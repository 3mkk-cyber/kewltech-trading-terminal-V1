// ==============================================================================
// FILE: tradingBot.ts (Content)
// ==============================================================================
// The main orchestrator and execution loop of the bot.
// ==============================================================================

import axios from 'axios';
import { WoofiProAPIClient } from './woofiApiClient';
import { PatternRecognizer } from './patternRecognizer';
import { RiskManager } from './riskManager';
import { Pattern, TradeSignal, ActiveTrade, Kline } from './dataModels';
import {
  ACCOUNT_EQUITY_USD,
  RISK_PERCENTAGE_PER_TRADE,
  MONITORED_SYMBOLS,
  SCAN_INTERVAL_SECONDS,
  MAX_CONCURRENT_TRADES,
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
  EMA_PERIODS
} from './config';
import { getEMATrend } from './utils';

export class TradingBot {
  private apiClient: WoofiProAPIClient;
  private patternRecognizer: PatternRecognizer;
  private riskManager: RiskManager;
  private activeTrades: ActiveTrade[];
  private closedTrades: ActiveTrade[];
  private webApiUrl: string;

  constructor() {
    this.apiClient = new WoofiProAPIClient();
    this.patternRecognizer = new PatternRecognizer(this.apiClient);
    this.patternRecognizer.setTradingBot(this);
    this.riskManager = new RiskManager(ACCOUNT_EQUITY_USD, RISK_PERCENTAGE_PER_TRADE);
    this.activeTrades = [];
    this.closedTrades = [];
    this.webApiUrl = "http://localhost:5000";
    console.log("TradingBot initialized.");
  }

  private async sendSignalToApi(signal: TradeSignal, finalizedSignal: TradeSignal): Promise<void> {
    try {
      const signalTimestamp = signal.signalTime.getTime();
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
        confidence: 85,
        details: {
          interval: signal.interval || "1h",
          strategy: signal.strategy
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
      if (this.activeTrades.length === 0) {
        return;
      }

      console.log(`[DEBUG] sendOpenTradesToApi called with ${this.activeTrades.length} active trades`);

      const openTrades = await Promise.all(this.activeTrades.map(async (trade) => {
        try {
          console.log(`[DEBUG] Fetching current price for ${trade.signal.symbol}`);
          // Fetch current price from API
          const currentPriceData = await this.apiClient.getCurrentPrice(trade.signal.symbol);
          console.log(`[DEBUG] Current price data for ${trade.signal.symbol}:`, currentPriceData);
          const currentPrice = currentPriceData ? parseFloat(currentPriceData.c) : trade.signal.entryPrice;
          console.log(`[DEBUG] Using currentPrice ${currentPrice} for ${trade.signal.symbol} (entry: ${trade.signal.entryPrice})`);

          const unrealizedPnl = (currentPrice - trade.signal.entryPrice) * (trade.signal.positionSize || 0);
          const fees = Math.abs(unrealizedPnl) * 0.0005;

          return {
            id: trade.entryOrderId || `TRADE_${trade.signal.symbol}_${trade.entryTime.getTime()}`,
            symbol: trade.signal.symbol,
            entryPrice: trade.signal.entryPrice,
            currentPrice,
            positionSize: trade.signal.positionSize || 0,
            entryTime: trade.entryTime.getTime(),
            stopLossPrice: trade.signal.stopLossPrice,
            takeProfitPrice: trade.signal.takeProfitPrice,
            unrealizedPnlUsd: parseFloat(unrealizedPnl.toFixed(2)),
            riskAmountUsd: trade.signal.riskAmountUsd || 0,
            duration: Math.floor((Date.now() - trade.entryTime.getTime()) / 1000),
            isAggressive: trade.signal.interval === "5m" ? false : true
          };
        } catch (e) {
          console.debug(`Error preparing open trade data for ${trade.signal.symbol}:`, e);
          return null;
        }
      }));

      const validTrades = openTrades.filter(trade => trade !== null);

      if (validTrades.length > 0) {
        const response = await axios.post(`${this.webApiUrl}/api/bot/open-trades`, validTrades, { timeout: 5000 });
        if (response.status === 200) {
          console.debug(`Open trades sent to API: ${validTrades.length} trades`);
        } else {
          console.debug(`Failed to send open trades: ${response.status}`);
        }
      }
    } catch (error: any) {
      console.debug(`Could not send open trades to web API: ${error.message}`);
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

        // Detect 5-minute patterns with improved logic
        const pattern = this.patternRecognizer['detect5mPattern'](symbol, klines5m);
        if (!pattern) {
          continue;
        }

        // Check pattern quality and age
        const patternAge = (Date.now() - pattern.detectionTime.getTime()) / (1000 * 60 * 5); // Age in 5m candles
        if (patternAge < MIN_PATTERN_AGE_5M) {
          console.debug(`[5M] Pattern too new for ${symbol} (${patternAge.toFixed(1)} candles old)`);
          continue;
        }

        // Calculate signal confidence
        const confidence = this.calculate5mSignalConfidence(pattern, klines5m);
        if (confidence < MIN_SIGNAL_CONFIDENCE_5M) {
          console.debug(`[5M] Low confidence signal for ${symbol} (${confidence.toFixed(2)})`);
          continue;
        }

        // Check for breakout with improved logic
        const breakoutSignal = this.patternRecognizer['check5mBreakout'](symbol, pattern, klines5m);
        if (breakoutSignal) {
          // Apply conservative risk management
          const riskManagedSignal = this.apply5mRiskManagement(breakoutSignal, klines5m, confidence);
          if (riskManagedSignal) {
            signals.push(riskManagedSignal);
            console.log(`[5M] Conservative signal generated for ${symbol} (${pattern.patternType}) confidence: ${confidence.toFixed(2)}`);
          }
        }
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
      stopLossPrice = Math.max(signal.stopLossPrice, signal.entryPrice - stopDistance);
      takeProfitPrice = Math.min(signal.takeProfitPrice, signal.entryPrice + (stopDistance * 2)); // 2:1 reward ratio
    } else {
      stopLossPrice = Math.min(signal.stopLossPrice, signal.entryPrice + stopDistance);
      takeProfitPrice = Math.max(signal.takeProfitPrice, signal.entryPrice - (stopDistance * 2));
    }

    // Validate stop loss distance
    const riskPerUnit = Math.abs(signal.entryPrice - stopLossPrice);
    if (riskPerUnit / signal.entryPrice < 0.002) { // Minimum 0.2% risk
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
    console.log(" Kewltech-Inspired Trading Bot - Live Data Feed & Signal Generation");
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

  private async processSignals(signals: TradeSignal[]): Promise<void> {
    if (!signals.length) {
      return;
    }

    console.log(`--- Processing ${signals.length} New Trade Signal(s) ---`);
    for (const signal of signals) {
      console.log(`Signal: ${signal.strategy} (${signal.tradeType.toUpperCase()}) for ${signal.symbol} on ${signal.interval} at ${signal.signalTime.toISOString()}`);
      console.log(`  Entry: ${signal.entryPrice.toFixed(4)}, SL: ${signal.stopLossPrice.toFixed(4)}, TP: ${signal.takeProfitPrice.toFixed(4)}`);

      const finalizedSignal = this.riskManager.calculateTradeParameters(signal);
      if (finalizedSignal && finalizedSignal.positionSize) {
        console.log(`  Finalized: Pos Size: ${finalizedSignal.positionSize.toFixed(4)} ${finalizedSignal.symbol}, Risk: $${finalizedSignal.riskAmountUsd?.toFixed(2)}`);

        // Send signal to web API for browser display
        await this.sendSignalToApi(signal, finalizedSignal);

        // PAPER TRADING SIMULATION (ENABLED)
        console.log(`\n\x1b[92m${'='.repeat(60)}`);
        console.log(`[PAPER TRADING] Executing simulated order for ${finalizedSignal.symbol}`);
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

          const orderId = `PAPER_${finalizedSignal.symbol}_${Date.now()}`;
          const activeTrade: ActiveTrade = {
            signal: finalizedSignal,
            entryTime: new Date(),
            entryOrderId: orderId,
            status: "OPEN"
          };

          // Override entry price with actual execution price
          activeTrade.signal.entryPrice = executionPrice;

          this.activeTrades.push(activeTrade);

          console.log(`  ✓ Order EXECUTED (PAPER TRADING)`);
          console.log(`    Order ID: ${orderId}`);
          console.log(`    Entry Price: $${executionPrice.toFixed(4)}`);
          console.log(`    Position Size: ${finalizedSignal.positionSize.toFixed(4)} ${finalizedSignal.symbol}`);
          console.log(`    Stop Loss: $${finalizedSignal.stopLossPrice.toFixed(4)}`);
          console.log(`    Take Profit: $${finalizedSignal.takeProfitPrice.toFixed(4)}`);
          console.log(`    Risk Amount: $${finalizedSignal.riskAmountUsd?.toFixed(2)}`);
          console.log(`    Active Trades: ${this.activeTrades.length}`);
          console.log(`\\x1b[92m${'='.repeat(60)}\\x1b[0m\n`);

        } catch (e) {
          console.error(`  ✗ FAILED to execute paper trade for ${finalizedSignal.symbol}: ${e}`);
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
        const entryPrice = trade.signal.entryPrice;
        const stopLoss = trade.signal.stopLossPrice;
        const takeProfit = trade.signal.takeProfitPrice;

        let exitReason: string | undefined;
        let exitPrice: number | undefined;

        if (trade.signal.tradeType === "long") {
          if (currentPrice >= takeProfit) {
            exitReason = "TAKE_PROFIT";
            exitPrice = takeProfit;
          } else if (currentPrice <= stopLoss) {
            exitReason = "STOP_LOSS";
            exitPrice = stopLoss;
          }
        } else { // short
          if (currentPrice <= takeProfit) {
            exitReason = "TAKE_PROFIT";
            exitPrice = takeProfit;
          } else if (currentPrice >= stopLoss) {
            exitReason = "STOP_LOSS";
            exitPrice = stopLoss;
          }
        }

        if (exitReason && exitPrice) {
          trade.exitTime = new Date();
          trade.exitPrice = exitPrice;
          trade.exitReason = exitReason;
          trade.status = "CLOSED";

          let pnl: number;
          if (trade.signal.tradeType === "long") {
            pnl = (exitPrice - entryPrice) * (trade.signal.positionSize || 0);
          } else {
            pnl = (entryPrice - exitPrice) * (trade.signal.positionSize || 0);
          }
          trade.pnlUsd = pnl;
          trade.feesUsd = Math.abs(pnl) * 0.0005;

          console.log(`\n\\x1b[95m${'='.repeat(60)}`);
          console.log(`[PAPER TRADING] Trade Closed - ${exitReason}`);
          console.log(`${'='.repeat(60)}\\x1b[0m`);
          console.log(`  Symbol: ${trade.signal.symbol}`);
          console.log(`  Entry Price: $${entryPrice.toFixed(4)}`);
          console.log(`  Exit Price: $${exitPrice.toFixed(4)}`);
          console.log(`  Position Size: ${(trade.signal.positionSize || 0).toFixed(4)}`);
          console.log(`  Gross P&L: $${pnl.toFixed(2)}`);
          console.log(`  Fees: $${trade.feesUsd.toFixed(2)}`);
          console.log(`  Net P&L: $${(pnl - (trade.feesUsd || 0)).toFixed(2)}`);
          console.log(`  Duration: ${trade.exitTime.getTime() - trade.entryTime.getTime()}ms`);

          if (pnl > 0) {
            console.log(`\\x1b[92m  ✓ WINNER!\\x1b[0m`);
          } else {
            console.log(`\\x1b[91m  ✗ LOSER\\x1b[0m`);
          }

          this.closedTrades.push(trade);
          await this.sendClosedTradeToApi(trade);

          console.log(`  Remaining Trades: ${this.activeTrades.length - 1}`);
          console.log(`\\x1b[95m${'='.repeat(60)}\\x1b[0m\n`);

          tradesToClose.push(idx);
        }
      } catch (e) {
        console.error(`Error checking trade exit for ${trade.signal.symbol}:`, e);
      }
    }

    // Log summary of open trades
    const openCount = this.activeTrades.filter(t => t.status === "OPEN").length;
    if (openCount > 0) {
      console.log(`[PAPER TRADING] ${openCount} trade(s) still open`);
    }
  }

  async run(): Promise<void> {
    console.log("Starting Kewltech-Inspired Trading Bot...");
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
        const emaCache: Record<string, Record<number, string | null>> = {};

        for (const sym of MONITORED_SYMBOLS) {
          const klines = await this.apiClient.getKlines(sym, "15m", 100);
          if (klines) {
            emaCache[sym] = getEMATrend(klines, EMA_PERIODS);
          }
        }

        for (const sym of symbolsForLiveFeed) {
          const ticker = await this.apiClient.getCurrentPrice(sym);
          if (ticker) {
            this.printLiveDataRow(ticker, emaCache[sym]);
          } else {
            console.log(`${sym.padEnd(15)} ${'Data N/A'.padEnd(12)} ${'N/A'.padEnd(10)} ${'N/A'.padEnd(35)} ${'N/A'.padEnd(15)} ${'N/A'.padEnd(20)}`);
          }
        }
        console.log("-".repeat(120));

        console.log(`\n\\x1b[93m--- Market Scan Cycle at ${cycleStartTime.toISOString()} UTC ---\\x1b[0m`);
        console.log(`[TRADING STATUS] Open Trades: ${this.activeTrades.length}/${MAX_CONCURRENT_TRADES}`);

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
