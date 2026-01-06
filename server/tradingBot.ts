// ==============================================================================
// FILE: tradingBot.ts (Content)
// ==============================================================================
// The main orchestrator and execution loop of the bot.
// ==============================================================================

import axios from 'axios';
import { WoofiProAPIClient } from './woofiApiClient';
import { EnhancedPatternRecognizer } from './patternRecognizer.enhanced';
import { RiskManager } from './riskManager';
import { learningEngine } from './learningEngine';
import { botSignalsManager, OpenTrade } from './botSignals';
import { db } from './db';
import { trades } from '@shared/schema';
import { gte, sql } from 'drizzle-orm';
import { Pattern, TradeSignal, ActiveTrade, Kline } from './dataModels';
import { evaluateTradeExit, getTimeStopMinutes } from './tradeManagement';
import {
  ACCOUNT_EQUITY_USD,
  RISK_PERCENTAGE_PER_TRADE,
  MONITORED_SYMBOLS,
  SCAN_INTERVAL_SECONDS,
  MAX_CONCURRENT_TRADES,
  MAX_DAILY_TRADES,
  MAX_DAILY_FAST_TRADES,
  MAX_DAILY_SWING_TRADES,
  DAILY_MAX_LOSS_USD,
  MIN_MINUTES_BETWEEN_TRADES,
  FAST_COOLDOWN_MINUTES,
  SWING_COOLDOWN_MINUTES,
  AUTO_TRADE_ON_PATTERN_DETECTION,
  AUTO_TRADE_ON_BREAKOUT,
  AGGRESSIVE_MODE,
  AGGRESSIVE_5M_SYMBOLS,
  SCAN_5M_ENABLED,
  SCAN_5M_INTERVAL_SECONDS,
  WEDGE_MIN_PIVOTS_5M,
  WEDGE_MIN_R_SQUARED_5M,
  POSITION_SIZE_REDUCTION_5M,
  MIN_SIGNAL_CONFIDENCE_5M,
  MAX_DAILY_5M_TRADES,
  MIN_PATTERN_AGE_5M,
  MAX_SLIPPAGE_5M,
  EMA_PERIODS,
  BE_R_MULTIPLIER,
  PARTIAL_R_MULTIPLIER,
  PARTIAL_CLOSE_RATIO,
  TRAIL_START_R_MULTIPLIER,
  TRAIL_OFFSET_R,
  FAST_TIME_STOP_MINUTES,
  SWING_TIME_STOP_MINUTES,
  ALLOW_5M_AUTO_EXECUTION
} from './config';
import { getEMATrend } from './utils';

export class TradingBot {
  private apiClient: WoofiProAPIClient;
  private patternRecognizer: EnhancedPatternRecognizer;
  private riskManager: RiskManager;
  private activeTrades: ActiveTrade[];
  private closedTrades: ActiveTrade[];
  private webApiUrl: string;
  private lastTradeExecutionTime: number = 0; // Track last trade time for cooldown
  private lastTradeByInterval: Record<string, number> = {};
  private priceCache: Map<string, { price: number; updatedAt: number; raw: any }>;
  private scanTimer?: NodeJS.Timeout;
  private stopRequested = false;

  constructor() {
    this.apiClient = new WoofiProAPIClient();
    this.patternRecognizer = new EnhancedPatternRecognizer(this.apiClient);
    this.patternRecognizer.setTradingBot(this);
    this.riskManager = new RiskManager(ACCOUNT_EQUITY_USD, RISK_PERCENTAGE_PER_TRADE);
    this.activeTrades = [];
    this.closedTrades = [];
    this.webApiUrl = "http://localhost:5000";
    this.priceCache = new Map();
    console.log("TradingBot initialized.");

    // Reload any open trades from the database so trailing/BE logic resumes after restarts
    this.hydrateActiveTradesFromDb().catch(err => {
      console.error("[DB] Failed to hydrate active trades:", err);
    });
    
    // Initialize learning engine
    learningEngine.initialize().then(() => {
      console.log("\x1b[92m[AI] Learning Engine activated\x1b[0m");
      console.log(learningEngine.getPerformanceSummary());
    }).catch(err => {
      console.error("[AI] Failed to initialize learning engine:", err);
    });
  }

  start(): void {
    this.stopRequested = false;
    console.log("Starting DepthSignals-Inspired Trading Bot...");
    console.log(`Symbols: ${MONITORED_SYMBOLS.join(', ')}, Scan Interval: ${SCAN_INTERVAL_SECONDS}s`);
    console.log(`Account Equity: $${ACCOUNT_EQUITY_USD.toLocaleString()}, Risk per Trade: ${(RISK_PERCENTAGE_PER_TRADE * 100).toFixed(2)}%`);

    this.scanTimer = setInterval(async () => {
      try {
        if (this.stopRequested) {
          return;
        }
        await this.performScanCycle();
      } catch (error: any) {
        console.error(`\x1b[91mScan cycle error: ${error.message}\x1b[0m`, error);
      }
    }, SCAN_INTERVAL_SECONDS * 1000);
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
    console.log("TradingBot stopped.");
  }

  private async performScanCycle(): Promise<void> {
    const cycleStartTime = new Date();

    // Live Data Feed Display
    this.printLiveDataHeader();

    // Fetch EMA trends for all symbols
    const symbolsForLiveFeed = MONITORED_SYMBOLS.slice(0, 5); // Show top 5 for brevity
    const emaCache = await this.buildEmaCache();
    const liveTickers = await this.fetchTickers(symbolsForLiveFeed);

    for (const sym of symbolsForLiveFeed) {
      const ticker = liveTickers[sym];
      if (ticker) {
        this.printLiveDataRow(ticker, emaCache[sym]);
      } else {
        console.log(`${sym.padEnd(15)} ${'Data N/A'.padEnd(12)} ${'N/A'.padEnd(10)} ${'N/A'.padEnd(35)} ${'N/A'.padEnd(15)} ${'N/A'.padEnd(20)}`);
      }
    }
    console.log("-".repeat(120));

    console.log(`\n\\x1b[93m--- Market Scan Cycle at ${cycleStartTime.toISOString()} UTC ---\\x1b[0m`);
    console.log(`[TRADING STATUS] Open Trades: ${this.activeTrades.length}/${MAX_CONCURRENT_TRADES} | Auto Trade: ${AUTO_TRADE_ON_PATTERN_DETECTION} | Aggressive: ${AGGRESSIVE_MODE}`);

    console.log(`\nEMA Trends Summary:`);
    for (const sym of MONITORED_SYMBOLS) {
      if (emaCache[sym]) {
        const trends = Object.entries(emaCache[sym]).map(([k, v]) => `EMA${k}=${v}`).join(', ');
        console.log(`  ${sym.padEnd(15)}: ${trends}`);
      }
    }

    // Check and exit active trades first
    await this.checkActiveTradesForExit();

    const tradeSignals = await this.patternRecognizer.scanAndGenerateSignals(cycleStartTime);
    await this.processSignals(tradeSignals);

    // Send market scan data to web API
    await this.sendMarketScanToApi(cycleStartTime, tradeSignals);

    // Send open trades to dashboard
    await this.sendOpenTradesToApi();

    // Log pattern status
    if (this.patternRecognizer['activePatterns'].size > 0) {
      console.log(`\nActive Patterns (${this.patternRecognizer['activePatterns'].size}):`);
      for (const [patternKey, pattern] of Array.from(this.patternRecognizer['activePatterns'])) {
        const age = (cycleStartTime.getTime() - pattern.detectionTime.getTime()) / (1000 * 60);
        console.log(`  ${patternKey}: ${pattern.patternType} (detected ${age.toFixed(1)} min ago)`);
      }
    } else {
      console.log("\nNo active patterns at this moment.");
    }

    const cycleEndTime = new Date();
    console.log(`Cycle took ${(cycleEndTime.getTime() - cycleStartTime.getTime()) / 1000}s.`);
  }

  private async sendSignalToApi(signal: TradeSignal, finalizedSignal: TradeSignal, opts: { emitOnly?: boolean } = {}): Promise<void> {
    try {
      const signalTimestamp = signal.signalTime.getTime();
      const confidence = Math.round(signal.confidenceScore ?? 0);
      const aiScore = Math.round(signal.aiScore ?? 0);
      const emitOnly = opts.emitOnly ?? signal.emitOnly ?? false;
      const signalData = {
        id: `${signal.symbol}_${signalTimestamp}`,
        symbol: signal.symbol,
        strategy: signal.strategy,
        tradeType: signal.tradeType,
        entryPrice: signal.entryPrice,
        stopLossPrice: signal.stopLossPrice,
        takeProfitPrice: signal.takeProfitPrice,
        positionSize: finalizedSignal.positionSize || 0,
        riskAmount: finalizedSignal.riskAmountUsd || 0,
        signalTime: signalTimestamp,
        confidence,
        details: {
          interval: signal.interval || "1h",
          strategy: signal.strategy,
          aiScore,
          aiFactors: signal.aiFactors,
          emitOnly
        }
      };
      const response = await axios.post(`${this.webApiUrl}/api/bot/signals`, signalData, { timeout: 5000 });
      if (response.status === 200) {
        console.log(`✓ Signal sent to dashboard: ${signal.symbol} (${signal.strategy})`);
      } else {
        console.warn(`Failed to send signal to API: ${response.status}`);
      }
    } catch (error: any) {
      console.warn(`Could not send signal to web API: ${error.message}`);
    }
  }

  sendPatternToApi(symbol: string, interval: string, patternType: string, isForming: boolean): void {
    try {
      const patternData = {
        id: `${symbol}_${interval}_${patternType}_${Date.now()}`,
        symbol,
        interval,
        patternType,
        detectionTime: Date.now(),
        status: isForming ? "forming" : "confirmed",
        details: {}
      };
      axios.post(`${this.webApiUrl}/api/bot/patterns`, patternData, { timeout: 5000 }).then(response => {
        if (response.status === 200) {
          console.debug(`Pattern sent to API: ${symbol} ${patternType}`);
        } else {
          console.warn(`Failed to send pattern to API: ${response.status}`);
        }
      }).catch(error => {
        console.warn(`Could not send pattern to web API: ${error.message}`);
      });
    } catch (error: any) {
      console.warn(`Could not send pattern to web API: ${error.message}`);
    }
  }

  private async sendClosedTradeToApi(trade: ActiveTrade): Promise<void> {
    try {
      const positionSize = trade.signal.positionSize || 0;
      const entryPrice = trade.signal.entryPrice;
      const exitPrice = trade.exitPrice || 0;
      const grossPnl = (exitPrice - entryPrice) * positionSize;
      const fees = Math.abs(grossPnl) * 0.0005; // 0.05% fee on both entry and exit
      const netPnl = grossPnl - fees;

      const tradeData = {
        id: trade.entryOrderId || `TRADE_${trade.signal.symbol}_${trade.entryTime.getTime()}`,
        symbol: trade.signal.symbol,
        entryPrice,
        exitPrice,
        positionSize,
        entryTime: trade.entryTime.getTime(),
        exitTime: trade.exitTime?.getTime() || Date.now(),
        exitReason: trade.exitReason || "UNKNOWN",
        grossPnlUsd: parseFloat(netPnl.toFixed(2)),
        feesUsd: parseFloat(fees.toFixed(2)),
        netPnlUsd: parseFloat(netPnl.toFixed(2)),
        riskAmount: trade.signal.riskAmountUsd || 0,
        isWinner: netPnl > 0 ? 1 : 0
      };

      const response = await axios.post(`${this.webApiUrl}/api/bot/trades`, tradeData, { timeout: 5000 });
      if (response.status === 200) {
        console.debug(`Closed trade sent to API: ${trade.signal.symbol} P&L: $${netPnl.toFixed(2)}`);
      } else {
        console.warn(`Failed to send closed trade to API: ${response.status}`);
      }
    } catch (error: any) {
      console.warn(`Could not send closed trade to web API: ${error.message}`);
    }
  }

  private async sendOpenTradesToApi(): Promise<void> {
    try {
      // Load open trades from database instead of relying on in-memory state
      // This ensures we update P&L even after server restarts
      const dbTrades = await botSignalsManager.getOpenTrades();
      
      if (dbTrades.length === 0) {
        return;
      }

      // Fetch latest prices once per unique symbol to reduce API load (and avoid 429s)
      const symbols = Array.from(new Set(dbTrades.map(t => t.symbol)));
      const tickerMap = await this.fetchTickers(symbols);

      const openTrades = await Promise.all(dbTrades.map(async (dbTrade: OpenTrade) => {
        try {
          // Use native symbol format for WooFi (e.g., SPOT_BTC_USDT)
          const tickerData = tickerMap[dbTrade.symbol];
          const currentPrice = tickerData ? parseFloat(tickerData.c) : dbTrade.entryPrice;
          const entryTimeMs = new Date(dbTrade.entryTime).getTime();

          // Calculate P&L based on trade direction
          // LONG: profit when price goes UP (currentPrice - entryPrice)
          // SHORT: profit when price goes DOWN (entryPrice - currentPrice)
          let unrealizedPnl: number;
          if (dbTrade.tradeType === "short") {
            unrealizedPnl = (dbTrade.entryPrice - currentPrice) * (dbTrade.positionSize || 0);
          } else {
            unrealizedPnl = (currentPrice - dbTrade.entryPrice) * (dbTrade.positionSize || 0);
          }
          const fees = Math.abs(unrealizedPnl) * 0.0005;

          return {
            id: dbTrade.id,
            symbol: dbTrade.symbol,
            tradeType: dbTrade.tradeType,
            entryPrice: dbTrade.entryPrice,
            currentPrice,
            positionSize: dbTrade.positionSize || 0,
            entryTime: entryTimeMs,
            stopLossPrice: dbTrade.stopLossPrice,
            takeProfitPrice: dbTrade.takeProfitPrice,
            unrealizedPnlUsd: parseFloat(unrealizedPnl.toFixed(2)),
            riskAmountUsd: dbTrade.riskAmountUsd || 0,
            duration: Math.floor((Date.now() - entryTimeMs) / 1000),
            isAggressive: dbTrade.isAggressive
          };
        } catch (e) {
          console.debug(`Error preparing open trade data for ${dbTrade.symbol}:`, e);
          return null;
        }
      }));

      const validTrades = openTrades.filter((trade: any) => trade !== null);

      if (validTrades.length > 0) {
        await axios.post(`${this.webApiUrl}/api/bot/open-trades`, validTrades, { timeout: 5000 });
      }
    } catch (error: any) {
      // Silently handle API communication errors
    }
  }

  private next5mScanDue(fromTime: Date): Date {
    const jitterSeconds = (Math.random() - 0.5) * 4; // -2 to +2 seconds
    const interval = Math.max(1.0, SCAN_5M_INTERVAL_SECONDS + jitterSeconds);
    return new Date(fromTime.getTime() + interval * 1000);
  }

  private async scan5mPatterns(): Promise<TradeSignal[]> {
    const signals: TradeSignal[] = [];

    for (const symbol of AGGRESSIVE_5M_SYMBOLS) {
      try {
        // Check daily trade limit
        const todayTrades = this.getToday5mTrades(symbol);
        if (todayTrades >= MAX_DAILY_5M_TRADES) {
          console.log(`[5M] Skipping ${symbol} - daily limit reached (${todayTrades}/${MAX_DAILY_5M_TRADES})`);
          continue;
        }

        // Get 5-minute klines for pattern detection
        const klines5m = await this.apiClient.getKlines(symbol, "5m", 100);
        if (!klines5m || klines5m.length < 20) {
          console.debug(`[5M] Insufficient 5m data for ${symbol}`);
          continue;
        }

        // NOTE: 5m aggressive pattern detection disabled - EnhancedPatternRecognizer uses comprehensive
        // multi-timeframe analysis. The 5m-specific methods are in the legacy patternRecognizer.ts
        // For now, 5m aggressive mode is temporarily disabled to use the enhanced pattern detection system.
        console.debug(`[5M] Aggressive 5m mode temporarily disabled - using enhanced pattern system instead`);
        continue;
        
        // TODO: Re-enable 5m aggressive mode by either:
        // 1. Adding 5m-specific methods to EnhancedPatternRecognizer, OR
        // 2. Using a hybrid approach with both recognizers
      } catch (error) {
        console.error(`[5M] Error scanning ${symbol}:`, error);
      }
    }

    return signals;
  }

  private getToday5mTrades(symbol: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.closedTrades.filter(trade =>
      trade.signal.symbol === symbol &&
      trade.signal.interval === "5m" &&
      trade.entryTime >= today
    ).length;
  }

  private calculate5mSignalConfidence(pattern: Pattern, klines: Kline[]): number {
    let confidence = 0.5; // Base confidence

    // Pattern quality factors
    const r2Avg = (pattern.upperTrendlineSlope && pattern.lowerTrendlineSlope) ?
      (Math.abs(pattern.upperTrendlineSlope) + Math.abs(pattern.lowerTrendlineSlope)) / 2 : 0;
    confidence += r2Avg * 0.2; // Better trendlines = higher confidence

    // Volume confirmation (if available)
    const recentCandles = klines.slice(-5);
    const avgVolume = recentCandles.reduce((sum, k) => sum + (k.volume || 0), 0) / recentCandles.length;
    if (avgVolume > 0) {
      confidence += 0.1; // Volume data available
    }

    // Pattern age factor (older patterns more reliable)
    const ageHours = (Date.now() - pattern.detectionTime.getTime()) / (1000 * 60 * 60);
    confidence += Math.min(ageHours / 24, 0.2); // Up to 0.2 bonus for patterns > 24h old

    // Market condition factor
    const currentPrice = klines[klines.length - 1].close;
    const sma20 = this.calculateSMA(klines.slice(-20), 20);
    if (sma20) {
      const distanceFromSMA = Math.abs(currentPrice - sma20) / sma20;
      if (distanceFromSMA < 0.02) { // Within 2% of SMA
        confidence += 0.1; // Better market condition
      }
    }

    return Math.min(confidence, 1.0); // Cap at 1.0
  }

  private calculateSMA(klines: Kline[], period: number): number | null {
    if (klines.length < period) return null;
    const sum = klines.slice(-period).reduce((acc, k) => acc + k.close, 0);
    return sum / period;
  }

  private apply5mRiskManagement(signal: TradeSignal, klines: Kline[], confidence: number): TradeSignal | null {
    const currentPrice = klines[klines.length - 1].close;

    // Conservative position sizing based on confidence
    const basePositionSize = signal.positionSize || 0;
    const confidenceMultiplier = 0.5 + (confidence * 0.5); // 0.5 to 1.0 based on confidence
    const conservativePositionSize = basePositionSize * POSITION_SIZE_REDUCTION_5M * confidenceMultiplier;

    // Improved stop loss calculation using ATR
    const atr = this.calculateATR(klines.slice(-14), 14);
    const atrMultiplier = signal.tradeType === "long" ? 1.5 : 1.5; // Tighter stops for 5m
    const stopDistance = atr ? atr * atrMultiplier : Math.abs(signal.entryPrice) * 0.005; // 0.5% fallback

    let stopLossPrice: number;
    let takeProfitPrice: number;

    if (signal.tradeType === "long") {
      // LONG: SL below entry, TP above entry
      stopLossPrice = Math.min(signal.stopLossPrice, signal.entryPrice - stopDistance);
      takeProfitPrice = Math.max(signal.takeProfitPrice, signal.entryPrice + (stopDistance * 2.5)); // 2.5:1 reward ratio
    } else {
      // SHORT: SL above entry, TP below entry
      stopLossPrice = Math.max(signal.stopLossPrice, signal.entryPrice + stopDistance);
      takeProfitPrice = Math.min(signal.takeProfitPrice, signal.entryPrice - (stopDistance * 2.5));
    }

    // Validate stop loss distance
    const riskPerUnit = Math.abs(signal.entryPrice - stopLossPrice);
    if (riskPerUnit / signal.entryPrice < 0.001) { // Minimum 0.1% risk
      console.debug(`[5M] Stop loss too tight for ${signal.symbol}, skipping`);
      return null;
    }

    // Apply slippage protection
    const maxSlippage = signal.entryPrice * MAX_SLIPPAGE_5M;
    if (Math.abs(currentPrice - signal.entryPrice) > maxSlippage) {
      console.debug(`[5M] Excessive slippage for ${signal.symbol}, skipping`);
      return null;
    }

    return {
      ...signal,
      positionSize: conservativePositionSize,
      stopLossPrice,
      takeProfitPrice,
      riskAmountUsd: (conservativePositionSize * riskPerUnit)
    };
  }

  private calculateATR(klines: Kline[], period: number): number | null {
    if (klines.length < period + 1) return null;

    const trueRanges: number[] = [];
    for (let i = 1; i < Math.min(klines.length, period + 1); i++) {
      const high = klines[i].high;
      const low = klines[i].low;
      const prevClose = klines[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trueRanges.push(tr);
    }

    return trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;
  }

  private async sendMarketScanToApi(currentTimeUtc: Date, signals: TradeSignal[]): Promise<void> {
    try {
      const symbolsData = await Promise.all(
        MONITORED_SYMBOLS.map(async (symbol) => {
          try {
            const ticker = await this.apiClient.getCurrentPrice(symbol);
            if (ticker) {
              return {
                symbol,
                price: parseFloat(ticker.c),
                change1h: 0,
                emaStatus: {},
                volume: parseFloat(ticker.v)
              };
            }
          } catch (e) {
            console.debug(`Error getting price for ${symbol}:`, e);
          }
          return null;
        })
      );

      const scanData = {
        timestamp: currentTimeUtc.getTime(),
        symbols: symbolsData.filter(s => s !== null),
        patterns: [],
        signals: signals.map(s => ({
          id: `${s.symbol}_${s.signalTime.getTime()}`,
          symbol: s.symbol,
          strategy: s.strategy,
          tradeType: s.tradeType,
          entryPrice: s.entryPrice,
          stopLossPrice: s.stopLossPrice,
          takeProfitPrice: s.takeProfitPrice,
          signalTime: s.signalTime.getTime()
        }))
      };

      const response = await axios.post(`${this.webApiUrl}/api/bot/scan`, scanData, { timeout: 5000 });
      if (response.status === 200) {
        console.debug("Market scan data sent to API");
      } else {
        console.warn(`Failed to send market scan: ${response.status}`);
      }
    } catch (error: any) {
      console.warn(`Could not send market scan to API: ${error.message}`);
    }
  }

  private printLiveDataHeader(): void {
    console.clear();
    console.log("=".repeat(120));
    console.log(" DepthSignals-Inspired Trading Bot - Live Data Feed & Signal Generation");
    console.log("=".repeat(120));
    console.log(`${'Symbol'.padEnd(15)} ${'Price'.padEnd(12)} ${'1h Chg%'.padEnd(10)} ${'EMA Trend (13/34/244/610)'.padEnd(35)} ${'Volume'.padEnd(15)} ${'Last Update'.padEnd(20)}`);
    console.log("-".repeat(120));
  }

  private printLiveDataRow(tickerData: any, emaTrends: Record<number, string | null> | null): void {
    const symbol = tickerData.s || 'N/A';
    const lastPrice = tickerData.c || 'N/A';
    const openPrice = tickerData.o || 'N/A';
    const volume = tickerData.v || 'N/A';
    const lastUpdateTs = tickerData.E;

    let percentChange: number | string = 'N/A';
    if (typeof lastPrice === 'number' && typeof openPrice === 'number' && openPrice > 0) {
      percentChange = ((lastPrice - openPrice) / openPrice) * 100;
    }

    let lastUpdateStr = "N/A";
    if (lastUpdateTs) {
      try {
        lastUpdateStr = new Date(lastUpdateTs).toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      } catch (e) {
        lastUpdateStr = "Invalid Date";
      }
    }

    let emaStr = "N/A";
    if (emaTrends) {
      const trends = [13, 34, 244, 610].map(p => (emaTrends[p] || '?').substring(0, 3).toUpperCase());
      emaStr = trends.join('/');
    }

    if (typeof percentChange === 'number') {
      console.log(`${symbol.padEnd(15)} ${lastPrice.toFixed(2).padEnd(12)} ${percentChange.toFixed(2).padEnd(10)}% ${emaStr.padEnd(35)} ${volume.toString().padEnd(15)} ${lastUpdateStr.padEnd(20)}`);
    } else {
      console.log(`${symbol.padEnd(15)} ${lastPrice.toString().padEnd(12)} ${percentChange.toString().padEnd(10)} ${emaStr.padEnd(35)} ${volume.toString().padEnd(15)} ${lastUpdateStr.padEnd(20)}`);
    }
  }

  /**
   * Count the number of trades opened today
   */
  private async getTodayTradeCount(): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();
      
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(trades)
        .where(gte(trades.entryTime, new Date(todayTimestamp)))
        .then(rows => rows[0]);
      
      return result?.count || 0;
    } catch (error) {
      console.error('[ERROR] Failed to count today\'s trades:', error);
      return 0;
    }
  }

  private async getTodayNetPnlUsd(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const result: any = await db.execute(
        sql`select coalesce(sum(net_pnl_usd), 0)::float as net_pnl_usd from trades where exit_time >= ${today}`
      );

      const rows: any[] = (result as any)?.rows || [];
      const value = rows.length ? Number(rows[0].net_pnl_usd) || 0 : 0;
      return value;
    } catch (error) {
      console.error('[ERROR] Failed to calculate today\'s net P&L:', error);
      return 0;
    }
  }

  private async getTodayIntervalCounts(): Promise<Record<string, number>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const result: any = await db.execute(
        sql`select "interval" as interval, count(*)::int as count from trades where entry_time >= ${today} group by "interval"`
      );

      const counts: Record<string, number> = {};
      const rows: any[] = (result as any)?.rows || [];
      for (const row of rows) {
        if (row.interval) {
          counts[row.interval as string] = Number(row.count) || 0;
        }
      }
      return counts;
    } catch (error) {
      console.error('[ERROR] Failed to count interval trades:', error);
      return {};
    }
  }

  private getCooldownMinutes(interval?: string): number {
    if (interval === '5m' || interval === '15m') {
      return FAST_COOLDOWN_MINUTES;
    }
    if (interval === '1h' || interval === '4h') {
      return SWING_COOLDOWN_MINUTES;
    }
    return MIN_MINUTES_BETWEEN_TRADES;
  }

  /**
   * Check if we can execute a new trade without exceeding daily limit
   */
  private async canExecuteNewTrade(interval?: string): Promise<{ allowed: boolean; reason?: string }> {
    const todayCount = await this.getTodayTradeCount();
    const intervalCounts = await this.getTodayIntervalCounts();

    const fastTotal = (intervalCounts['5m'] || 0) + (intervalCounts['15m'] || 0);
    const swingTotal = (intervalCounts['1h'] || 0) + (intervalCounts['4h'] || 0);

    if (todayCount >= MAX_DAILY_TRADES) {
      return {
        allowed: false,
        reason: `Daily trade limit reached: ${todayCount}/${MAX_DAILY_TRADES}`
      };
    }

    if ((interval === '5m' || interval === '15m') && fastTotal >= MAX_DAILY_FAST_TRADES) {
      return {
        allowed: false,
        reason: `Fast-interval limit reached: ${fastTotal}/${MAX_DAILY_FAST_TRADES} (5m/15m)`
      };
    }

    if ((interval === '1h' || interval === '4h') && swingTotal >= MAX_DAILY_SWING_TRADES) {
      return {
        allowed: false,
        reason: `Swing-interval limit reached: ${swingTotal}/${MAX_DAILY_SWING_TRADES} (1h/4h)`
      };
    }

    return { allowed: true };
  }

  private async processSignals(signals: TradeSignal[]): Promise<void> {
    console.log(`\n[AI] Evaluating ${signals.length} signals with learning engine...`);
    const todayNetPnlUsd = await this.getTodayNetPnlUsd();
    const lossCapBreached = todayNetPnlUsd <= -DAILY_MAX_LOSS_USD;

    if (lossCapBreached) {
      console.log(`[RISK] Daily loss cap reached (net ${todayNetPnlUsd.toFixed(2)} <= -${DAILY_MAX_LOSS_USD.toFixed(2)}) - auto execution paused`);
    }
    
    const intervalThresholds: Record<string, { minConfidence: number; minScore: number; executeScore: number }> = {
      '5m': { minConfidence: 45, minScore: 55, executeScore: 65 },
      '15m': { minConfidence: 50, minScore: 60, executeScore: 70 },
      '1h': { minConfidence: 55, minScore: 65, executeScore: 75 },
      '4h': { minConfidence: 65, minScore: 70, executeScore: 78 },
      default: { minConfidence: 60, minScore: 65, executeScore: 70 }
    };

    const executableSignals: TradeSignal[] = [];
    const emitOnlySignals: TradeSignal[] = [];
    
    for (const signal of signals) {
      const thresholds = intervalThresholds[signal.interval] || intervalThresholds.default;
      const confidenceScore = signal.confidenceScore ?? 0;

      if (confidenceScore < thresholds.minConfidence) {
        console.log(`[AI] ✗ Filtered ${signal.symbol} ${signal.interval}: confidence ${confidenceScore.toFixed(1)} < ${thresholds.minConfidence}`);
        continue;
      }

      const shouldFilter = learningEngine.shouldFilterSignal({
        symbol: signal.symbol,
        strategy: signal.strategy,
        interval: signal.interval
      });
      
      if (shouldFilter) {
        console.log(`[AI] ✗ Filtered signal: ${signal.symbol} ${signal.strategy} (poor historical performance)`);
        continue;
      }
      
      const qualityFactors = await learningEngine.calculateTradeQuality({
        symbol: signal.symbol,
        strategy: signal.strategy,
        interval: signal.interval,
        tradeType: signal.tradeType
      });

      signal.aiScore = qualityFactors.overallScore;
      signal.aiFactors = qualityFactors;
      
      console.log(`[AI] ${signal.symbol} ${signal.strategy}:`);
      console.log(`     Quality Score: ${qualityFactors.overallScore.toFixed(1)}/100`);
      console.log(`     Strategy: ${qualityFactors.strategyScore.toFixed(0)} | Symbol: ${qualityFactors.symbolScore.toFixed(0)} | Pattern: ${qualityFactors.patternScore.toFixed(0)}`);

      const meetsScore = qualityFactors.overallScore >= thresholds.minScore;
      const shouldExecute = qualityFactors.overallScore >= thresholds.executeScore;

      if (!meetsScore) {
        console.log(`[AI] ✗ Signal rejected (score ${qualityFactors.overallScore.toFixed(1)} < ${thresholds.minScore})`);
        continue;
      }

      // Force emit-only when 5m auto execution is disabled
      if (signal.interval === '5m' && !ALLOW_5M_AUTO_EXECUTION) {
        signal.emitOnly = true;
        emitOnlySignals.push(signal);
        console.log(`[RISK] 5m auto-exec disabled → emit-only ${signal.symbol} ${signal.interval}`);
        continue;
      }

      // Halt auto execution after hitting daily loss cap, but continue emitting for visibility
      if (lossCapBreached) {
        signal.emitOnly = true;
        emitOnlySignals.push(signal);
        console.log(`[RISK] Daily loss cap active → emit-only ${signal.symbol} ${signal.interval}`);
        continue;
      }

      // For lower TFs, allow emit-only when score is good but not high enough for auto execution
      if (!shouldExecute && (signal.interval === '5m' || signal.interval === '15m')) {
        signal.emitOnly = true;
        emitOnlySignals.push(signal);
        console.log(`[AI] → Emit-only (no auto-exec) ${signal.symbol} ${signal.interval} score ${qualityFactors.overallScore.toFixed(1)}`);
        continue;
      }

      executableSignals.push(signal);
      console.log(`[AI] ✓ Signal accepted for execution (score: ${qualityFactors.overallScore.toFixed(1)})`);
    }
    
    console.log(`[AI] Filtered ${signals.length} signals down to ${executableSignals.length} exec + ${emitOnlySignals.length} emit-only\n`);

    // Publish emit-only signals to dashboard/storage but skip trade placement
    for (const signal of emitOnlySignals) {
      const displaySignal = this.riskManager.calculateTradeParameters(signal) || signal;
      await this.sendSignalToApi(signal, displaySignal as TradeSignal, { emitOnly: true });
    }

    if (!executableSignals.length) {
      return;
    }

    console.log(`--- Processing ${executableSignals.length} New Trade Signal(s) ---`);
    for (const signal of executableSignals) {
      console.log(`Signal: ${signal.strategy} (${signal.tradeType.toUpperCase()}) for ${signal.symbol} on ${signal.interval} at ${signal.signalTime.toISOString()}`);
      console.log(`  Entry: ${signal.entryPrice.toFixed(4)}, SL: ${signal.stopLossPrice.toFixed(4)}, TP: ${signal.takeProfitPrice.toFixed(4)}`);

      const finalizedSignal = this.riskManager.calculateTradeParameters(signal);
      if (finalizedSignal && finalizedSignal.positionSize) {
        // Apply adaptive position sizing based on learned strategy performance
        const originalSize = finalizedSignal.positionSize;
        const adaptedSize = learningEngine.adaptPositionSize(originalSize, signal.strategy);
        
        if (Math.abs(adaptedSize - originalSize) > 0.01) {
          console.log(`[AI] Adaptive sizing: ${originalSize.toFixed(4)} → ${adaptedSize.toFixed(4)} (${signal.strategy})`);
          finalizedSignal.positionSize = adaptedSize;
        }
        
        console.log(`  Finalized: Pos Size: ${finalizedSignal.positionSize.toFixed(4)} ${finalizedSignal.symbol}, Risk: $${finalizedSignal.riskAmountUsd?.toFixed(2)}`);

        // Send signal to web API for browser display
        await this.sendSignalToApi(signal, finalizedSignal);

        // Check per-symbol position limits (max 3 total, max 2 per direction)
        const symbolTrades = this.activeTrades.filter(t => t.signal.symbol === signal.symbol);
        const sameDirectionTrades = symbolTrades.filter(t => t.signal.tradeType === signal.tradeType);
        
        if (symbolTrades.length >= 3) {
          console.log(`\x1b[93m[POSITION LIMIT] ${signal.symbol} already has 3 open trades (limit reached)\x1b[0m`);
          console.log(`             Existing: ${symbolTrades.map(t => `${t.signal.tradeType.toUpperCase()}`).join(', ')}`);
          continue;
        }
        
        if (sameDirectionTrades.length >= 2) {
          console.log(`\x1b[93m[POSITION LIMIT] ${signal.symbol} already has 2 ${signal.tradeType.toUpperCase()} trades (direction limit)\x1b[0m`);
          console.log(`             Existing: ${sameDirectionTrades.length} trades`);
          continue;
        }

        // Check cooldown periods (global and interval-specific)
        const now = Date.now();
        const intervalKey = signal.interval || 'unknown';
        const timeSinceLastGlobal = (now - this.lastTradeExecutionTime) / (1000 * 60);
        const intervalCooldown = this.getCooldownMinutes(signal.interval);
        const lastIntervalTs = this.lastTradeByInterval[intervalKey] || 0;
        const timeSinceLastInterval = lastIntervalTs > 0 ? (now - lastIntervalTs) / (1000 * 60) : Number.POSITIVE_INFINITY;

        if (this.lastTradeExecutionTime > 0 && timeSinceLastGlobal < MIN_MINUTES_BETWEEN_TRADES) {
          const remainingMinutes = (MIN_MINUTES_BETWEEN_TRADES - timeSinceLastGlobal).toFixed(1);
          console.log(`\x1b[93m[COOLDOWN] ${remainingMinutes} minutes remaining before next trade (global)\x1b[0m`);
          console.log(`           Signal: ${finalizedSignal.symbol} ${signal.strategy} ${signal.tradeType.toUpperCase()}`);
          continue; // Skip this trade
        }

        if (lastIntervalTs > 0 && timeSinceLastInterval < intervalCooldown) {
          const remainingMinutes = (intervalCooldown - timeSinceLastInterval).toFixed(1);
          console.log(`\x1b[93m[COOLDOWN] ${remainingMinutes} minutes remaining before next ${signal.interval || 'interval'} trade\x1b[0m`);
          console.log(`           Signal: ${finalizedSignal.symbol} ${signal.strategy} ${signal.tradeType.toUpperCase()}`);
          continue; // Skip this trade
        }

        // Check daily trade limit before executing
        const limitCheck = await this.canExecuteNewTrade(signal.interval);
        if (!limitCheck.allowed) {
          console.log(`\x1b[91m[LIMIT] Trade rejected: ${limitCheck.reason}\x1b[0m`);
          console.log(`         Signal: ${finalizedSignal.symbol} ${signal.strategy} ${signal.tradeType.toUpperCase()}`);
          continue; // Skip this trade and move to next signal
        }

        // Execute trade
        console.log(`\n\x1b[92m${'='.repeat(60)}`);
        console.log(`[TRADE EXECUTION] Opening position for ${finalizedSignal.symbol}`);
        console.log(`${'='.repeat(60)}\\x1b[0m`);

        try {
          // Get current market price for order execution
          const currentPriceData = await this.apiClient.getCurrentPrice(finalizedSignal.symbol);
          let executionPrice: number;
          if (currentPriceData) {
            executionPrice = parseFloat(currentPriceData.c);
          } else {
            executionPrice = finalizedSignal.entryPrice;
            console.warn(`  Could not fetch market price, using signal entry price: ${executionPrice.toFixed(4)}`);
          }

          const orderId = `TRADE_${finalizedSignal.symbol}_${Date.now()}`;
          const activeTrade: ActiveTrade = {
            signal: finalizedSignal,
            entryTime: new Date(),
            entryOrderId: orderId,
            status: "OPEN",
            realizedPnlUsd: 0,
            movedToBreakeven: false,
            partialTaken: false,
            trailingActive: false,
            highestPrice: finalizedSignal.entryPrice,
            lowestPrice: finalizedSignal.entryPrice,
            timeStopMinutes: getTimeStopMinutes(finalizedSignal.interval),
            riskPerUnitBaseline: Math.abs(finalizedSignal.entryPrice - finalizedSignal.stopLossPrice)
          };

          // Override entry price with actual execution price
          activeTrade.signal.entryPrice = executionPrice;
          activeTrade.highestPrice = executionPrice;
          activeTrade.lowestPrice = executionPrice;

          this.activeTrades.push(activeTrade);

          // Update last trade execution time for cooldown tracking
          this.lastTradeExecutionTime = Date.now();
          this.lastTradeByInterval[intervalKey] = this.lastTradeExecutionTime;

          // Persist open trades to database
          await this.syncOpenTradesToDatabase();

          console.log(`  ✓ Order EXECUTED`);
          console.log(`    Order ID: ${orderId}`);
          console.log(`    Entry Price: $${executionPrice.toFixed(4)}`);
          console.log(`    Position Size: ${finalizedSignal.positionSize.toFixed(4)} ${finalizedSignal.symbol}`);
          console.log(`    Stop Loss: $${finalizedSignal.stopLossPrice.toFixed(4)}`);
          console.log(`    Take Profit: $${finalizedSignal.takeProfitPrice.toFixed(4)}`);
          console.log(`    Risk Amount: $${finalizedSignal.riskAmountUsd?.toFixed(2)}`);
          console.log(`    Active Trades: ${this.activeTrades.length}`);
          console.log(`\\x1b[92m${'='.repeat(60)}\\x1b[0m\n`);

        } catch (e) {
          console.error(`  ✗ FAILED to execute trade for ${finalizedSignal.symbol}: ${e}`);
        }
      } else {
        console.warn(`  -> Signal for ${signal.symbol} discarded by risk management or calculation failed.`);
      }
    }

    // Check for profit/loss on open trades
    await this.checkActiveTradesForExit();

    console.log(`--- End of Signal Processing ---`);
  }

  private async checkActiveTradesForExit(): Promise<void> {
    if (!this.activeTrades.length) {
      return;
    }

    const tradesToClose: number[] = [];
    let anyTradeUpdated = false;
    for (let idx = 0; idx < this.activeTrades.length; idx++) {
      const trade = this.activeTrades[idx];
      if (trade.status !== "OPEN") {
        continue;
      }

      try {
        const currentPriceData = await this.apiClient.getCurrentPrice(trade.signal.symbol);
        if (!currentPriceData) {
          continue;
        }

        const currentPrice = parseFloat(currentPriceData.c);
        const { trade: updatedTrade, closed } = evaluateTradeExit(trade, currentPrice, new Date());
        this.activeTrades[idx] = updatedTrade;
        anyTradeUpdated = anyTradeUpdated || closed || updatedTrade !== trade;

        if (closed && updatedTrade.exitReason && updatedTrade.exitPrice !== undefined) {
          const entryPrice = updatedTrade.signal.entryPrice;
          const remainingSize = updatedTrade.signal.positionSize || 0;
          const totalPnl = updatedTrade.pnlUsd || 0;

          console.log(`\n\x1b[95m${'='.repeat(60)}`);
          console.log(`[TRADE CLOSED] ${updatedTrade.exitReason}`);
          console.log(`${'='.repeat(60)}\x1b[0m`);
          console.log(`  Symbol: ${updatedTrade.signal.symbol}`);
          console.log(`  Entry Price: $${entryPrice.toFixed(4)}`);
          console.log(`  Exit Price: $${updatedTrade.exitPrice.toFixed(4)}`);
          console.log(`  Position Size Closed: ${(remainingSize).toFixed(4)} (remaining before close)`);
          if (updatedTrade.realizedPnlUsd) {
            console.log(`  Realized Partial P&L: $${(updatedTrade.realizedPnlUsd || 0).toFixed(2)}`);
          }
          console.log(`  Gross P&L: $${totalPnl.toFixed(2)}`);
          console.log(`  Fees: $${(updatedTrade.feesUsd || 0).toFixed(2)}`);
          console.log(`  Net P&L: $${(totalPnl - (updatedTrade.feesUsd || 0)).toFixed(2)}`);
          console.log(`  Duration: ${updatedTrade.exitTime!.getTime() - updatedTrade.entryTime.getTime()}ms`);

          if (totalPnl > 0) {
            console.log(`\x1b[92m  ✓ WINNER!\x1b[0m`);
          } else {
            console.log(`\x1b[91m  ✗ LOSER\x1b[0m`);
          }

          this.closedTrades.push(updatedTrade);
          await this.sendClosedTradeToApi(updatedTrade);

          console.log(`  Remaining Trades: ${this.activeTrades.length - 1}`);
          console.log(`\x1b[95m${'='.repeat(60)}\x1b[0m\n`);

          tradesToClose.push(idx);
        }
      } catch (e) {
        console.error(`Error checking trade exit for ${trade.signal.symbol}:`, e);
      }
    }

    // Log summary of open trades
    const openCount = this.activeTrades.filter(t => t.status === "OPEN").length;
    if (openCount > 0) {
      console.log(`[ACTIVE POSITIONS] ${openCount} trade(s) open`);
    }

    // Sync updated trades to database when any trade was modified
    if (anyTradeUpdated) {
      await this.syncOpenTradesToDatabase();
    }
  }

  /**
   * Sync active trades from memory to database
   * Converts ActiveTrade[] to OpenTrade[] format and persists
   */
  private async syncOpenTradesToDatabase(): Promise<void> {
    try {
      const openTrades = this.activeTrades
        .filter(t => t.status === "OPEN")
        .map(t => ({
          id: t.entryOrderId || `TRADE_${t.signal.symbol}_${t.entryTime.getTime()}`,
          symbol: t.signal.symbol,
          tradeType: t.signal.tradeType,
          entryPrice: t.signal.entryPrice,
          currentPrice: t.signal.entryPrice,
          positionSize: t.signal.positionSize || 0,
          entryTime: t.entryTime.getTime(),
          stopLossPrice: t.signal.stopLossPrice,
          takeProfitPrice: t.signal.takeProfitPrice,
          unrealizedPnlUsd: 0,
          riskAmountUsd: t.signal.riskAmountUsd || 0,
          duration: Math.floor((Date.now() - t.entryTime.getTime()) / 1000),
          isAggressive: false
        }));

      await botSignalsManager.setOpenTrades(openTrades);
      console.debug(`[DB] Synced ${openTrades.length} open trades to database`);
    } catch (error) {
      console.error(`[DB] Failed to sync open trades to database:`, error);
    }
  }

  private async hydrateActiveTradesFromDb(): Promise<void> {
    const dbTrades = await botSignalsManager.getOpenTrades();
    if (!dbTrades.length) {
      return;
    }

    const hydrated = dbTrades.map(dbTrade => {
      const interval = (dbTrade as any).interval || "1h";
      const entryPrice = dbTrade.entryPrice;
      const stopLossPrice = dbTrade.stopLossPrice;

      const signal: TradeSignal = {
        symbol: dbTrade.symbol,
        strategy: "rehydrated",
        tradeType: dbTrade.tradeType,
        interval,
        entryPrice,
        stopLossPrice,
        takeProfitPrice: dbTrade.takeProfitPrice,
        signalTime: new Date(dbTrade.entryTime),
        positionSize: dbTrade.positionSize,
        riskAmountUsd: dbTrade.riskAmountUsd,
      };

      const baselineRisk = Math.abs(entryPrice - stopLossPrice) || 0;

      const activeTrade: ActiveTrade = {
        signal,
        entryTime: new Date(dbTrade.entryTime),
        entryOrderId: dbTrade.id,
        status: "OPEN",
        realizedPnlUsd: 0,
        movedToBreakeven: false,
        partialTaken: false,
        trailingActive: false,
        highestPrice: entryPrice,
        lowestPrice: entryPrice,
        timeStopMinutes: getTimeStopMinutes(interval),
        riskPerUnitBaseline: baselineRisk,
      };

      return activeTrade;
    });

    this.activeTrades = hydrated;
    console.log(`[DB] Hydrated ${hydrated.length} open trade(s) from database`);
  }

  private async buildEmaCache(): Promise<Record<string, Record<number, string | null>>> {
    const results = await Promise.all(MONITORED_SYMBOLS.map(async sym => {
      try {
        const klines = await this.apiClient.getKlines(sym, "15m", 100);
        if (!klines) return [sym, undefined] as const;
        return [sym, getEMATrend(klines, EMA_PERIODS)] as const;
      } catch (err) {
        console.debug(`EMA fetch failed for ${sym}:`, err);
        return [sym, undefined] as const;
      }
    }));

    return results.reduce<Record<string, Record<number, string | null>>>((acc, [sym, ema]) => {
      if (ema) acc[sym] = ema;
      return acc;
    }, {});
  }

  private async fetchTickers(symbols: string[]): Promise<Record<string, any>> {
    const results = await Promise.all(symbols.map(async sym => {
      try {
        const cached = this.priceCache.get(sym);
        const now = Date.now();
        // Reuse cached quote if fresher than 12s to prevent rate limits
        if (cached && now - cached.updatedAt < 12000) {
          return [sym, cached.raw] as const;
        }

        const ticker = await this.apiClient.getCurrentPrice(sym);
        if (ticker) {
          this.priceCache.set(sym, { price: parseFloat(ticker.c), updatedAt: now, raw: ticker });
          return [sym, ticker] as const;
        }

        // If API returned null, fall back to cache instead of dropping the symbol
        const cachedFallback = this.priceCache.get(sym);
        if (cachedFallback) {
          return [sym, cachedFallback.raw] as const;
        }

        return [sym, null] as const;
      } catch (err) {
        console.debug(`Ticker fetch failed for ${sym}:`, err);
        // Fall back to cached value if available
        const cached = this.priceCache.get(sym);
        if (cached) {
          return [sym, cached.raw] as const;
        }
        return [sym, null] as const;
      }
    }));

    return results.reduce<Record<string, any>>((acc, [sym, ticker]) => {
      if (ticker) acc[sym] = ticker;
      return acc;
    }, {});
  }

  async run(): Promise<void> {
    console.log("Starting DepthSignals-Inspired Trading Bot...");
    console.log(`Symbols: ${MONITORED_SYMBOLS.join(', ')}, Scan Interval: ${SCAN_INTERVAL_SECONDS}s`);
    console.log(`Account Equity: $${ACCOUNT_EQUITY_USD.toLocaleString()}, Risk per Trade: ${(RISK_PERCENTAGE_PER_TRADE * 100).toFixed(2)}%`);
    console.log("Press Ctrl+C to stop.");

    let next5mScanTime = new Date();

    try {
      while (true) {
        const cycleStartTime = new Date();

        // Live Data Feed Display
        this.printLiveDataHeader();

        // Fetch EMA trends for all symbols
        const symbolsForLiveFeed = MONITORED_SYMBOLS.slice(0, 5); // Show top 5 for brevity
        const emaCache = await this.buildEmaCache();
        const liveTickers = await this.fetchTickers(symbolsForLiveFeed);

        for (const sym of symbolsForLiveFeed) {
          const ticker = liveTickers[sym];
          if (ticker) {
            this.printLiveDataRow(ticker, emaCache[sym]);
          } else {
            console.log(`${sym.padEnd(15)} ${'Data N/A'.padEnd(12)} ${'N/A'.padEnd(10)} ${'N/A'.padEnd(35)} ${'N/A'.padEnd(15)} ${'N/A'.padEnd(20)}`);
          }
        }
        console.log("-".repeat(120));

        console.log(`\n\\x1b[93m--- Market Scan Cycle at ${cycleStartTime.toISOString()} UTC ---\\x1b[0m`);
        console.log(`[TRADING STATUS] Open Trades: ${this.activeTrades.length}/${MAX_CONCURRENT_TRADES} | Auto Trade: ${AUTO_TRADE_ON_PATTERN_DETECTION} | Aggressive: ${AGGRESSIVE_MODE}`);

        console.log(`\nEMA Trends Summary:`);
        for (const sym of MONITORED_SYMBOLS) {
          if (emaCache[sym]) {
            const trends = Object.entries(emaCache[sym]).map(([k, v]) => `EMA${k}=${v}`).join(', ');
            console.log(`  ${sym.padEnd(15)}: ${trends}`);
          }
        }

        const tradeSignals = await this.patternRecognizer.scanAndGenerateSignals(cycleStartTime);
        await this.processSignals(tradeSignals);

        let signals5m: TradeSignal[] = [];
        const nowFor5m = new Date();
        if (SCAN_5M_ENABLED && nowFor5m >= next5mScanTime) {
          // Conservative 5-minute pattern scanning
          signals5m = await this.scan5mPatterns();
          next5mScanTime = this.next5mScanDue(nowFor5m);
        }

        // Send market scan data to web API
        await this.sendMarketScanToApi(cycleStartTime, [...tradeSignals, ...signals5m]);

        // Send open trades to dashboard
        await this.sendOpenTradesToApi();

        // Log pattern status
        if (this.patternRecognizer['activePatterns'].size > 0) {
          console.log(`\nActive Patterns (${this.patternRecognizer['activePatterns'].size}):`);
          for (const [patternKey, pattern] of Array.from(this.patternRecognizer['activePatterns'])) {
            const age = (cycleStartTime.getTime() - pattern.detectionTime.getTime()) / (1000 * 60);
            console.log(`  ${patternKey}: ${pattern.patternType} (detected ${age.toFixed(1)} min ago)`);
          }
        } else {
          console.log("\nNo active patterns at this moment.");
        }

        const cycleEndTime = new Date();
        const sleepDuration = SCAN_INTERVAL_SECONDS * 1000 - (cycleEndTime.getTime() - cycleStartTime.getTime());

        if (sleepDuration > 0) {
          console.log(`Cycle took ${(cycleEndTime.getTime() - cycleStartTime.getTime()) / 1000}s. Sleeping for ${sleepDuration / 1000}s.`);
          await new Promise(resolve => setTimeout(resolve, sleepDuration));
        } else {
          console.warn(`Cycle duration exceeded scan interval. Starting next scan immediately.`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error: any) {
      if (error.message === 'User force closed the prompt with 0 null') {
        console.log("\n\\x1b[91mBot stopped by user.\\x1b[0m");
      } else {
        console.error(`\x1b[91mUnhandled error: ${error.message}\x1b[0m`, error);
      }
    } finally {
      console.log("Trading Bot shutting down.");
    }
  }
}
