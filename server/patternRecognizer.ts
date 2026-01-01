// ==============================================================================
// FILE: patternRecognizer.ts (Content)
// ==============================================================================
// Implements Kewltech-inspired pattern detection logic
// ==============================================================================

import { WoofiProAPIClient } from './woofiApiClient';
import { Kline, PivotPoint, Pattern, TradeSignal } from './dataModels';
import {
  WEDGE_LOOKBACK_CANDLES,
  WEDGE_MIN_PIVOTS_FOR_TRENDLINE,
  WEDGE_MIN_R_SQUARED,
  TRENDLINE_SLOPE_DIFF_THRESHOLD,
  ORB_DURATION_MINUTES,
  ORB_BREAKOUT_BUFFER_FACTOR,
  ORB_RISK_REWARD_RATIO,
  ORB_SYMBOLS,
  MONITORED_SYMBOLS,
  EMA_PERIODS,
  WEDGE_MIN_PIVOTS_5M,
  WEDGE_MIN_R_SQUARED_5M
} from './config';
import { getPivotPoints, fitTrendline, getEMATrend, getCandleDurationMinutes } from './utils';

export class PatternRecognizer {
  private apiClient: WoofiProAPIClient;
  private tradingBot: any; // Will be set later to avoid circular dependency
  private activePatterns: Map<string, Pattern>;

  constructor(apiClient: WoofiProAPIClient, tradingBot?: any) {
    this.apiClient = apiClient;
    this.tradingBot = tradingBot;
    this.activePatterns = new Map();
  }

  setTradingBot(tradingBot: any): void {
    this.tradingBot = tradingBot;
  }

  private detectWedgePattern(symbol: string, interval: string, klines: Kline[]): Pattern | null {
    if (klines.length < WEDGE_LOOKBACK_CANDLES * 0.55) {
      console.debug(`Not enough klines for ${symbol} ${interval}: ${klines.length} < ${WEDGE_LOOKBACK_CANDLES * 0.55}`);
      return null;
    }

    // Check EMA trend for confirmation
    const emaTrends = getEMATrend(klines, EMA_PERIODS);
    console.debug(`${symbol} ${interval} EMA trends:`, emaTrends);

    const pivots = getPivotPoints(klines, 2); // Smaller window for more pivots
    console.info(`${symbol} ${interval}: Found ${pivots.length} pivot points (Curr: ${klines[klines.length - 1].close.toFixed(4)})`);
    if (pivots.length > 0) {
      pivots.slice(-5).forEach(p => {
        console.debug(`  ${p.type.toUpperCase()} pivot: $${p.price.toFixed(4)} at index ${p.index}`);
      });
    }

    if (pivots.length === 0) return null;
    const highs = pivots.filter(p => p.type === 'high');
    const lows = pivots.filter(p => p.type === 'low');
    console.debug(`${symbol} ${interval}: ${highs.length} highs, ${lows.length} lows`);
    if (highs.length < WEDGE_MIN_PIVOTS_FOR_TRENDLINE || lows.length < WEDGE_MIN_PIVOTS_FOR_TRENDLINE) return null;

    // Fit trendlines to most recent N pivots
    const recentHighsChrono = highs.slice(-WEDGE_MIN_PIVOTS_FOR_TRENDLINE).sort((a, b) => a.index - b.index);
    const recentLowsChrono = lows.slice(-WEDGE_MIN_PIVOTS_FOR_TRENDLINE).sort((a, b) => a.index - b.index);
    if (recentHighsChrono.length < 2 || recentLowsChrono.length < 2) return null;

    const [slopeH, interceptH, rSqH] = fitTrendline(recentHighsChrono);
    const [slopeL, interceptL, rSqL] = fitTrendline(recentLowsChrono);
    console.info(`${symbol} ${interval} Trendlines: Upper(slope=${slopeH?.toFixed(6)},R²=${rSqH?.toFixed(4)}) Lower(slope=${slopeL?.toFixed(6)},R²=${rSqL?.toFixed(4)})`);
    if (slopeH == null || interceptH == null || rSqH == null || slopeL == null || interceptL == null || rSqL == null) return null;

    let detectedPattern: Pattern | null = null;

    // Check dominant EMA trend (use 34 period as primary indicator)
    const primaryEmaTrend = emaTrends[34] || 'insufficient_data';

    // Log convergence analysis for debugging
    const slopeDiff = Math.abs((slopeH || 0) - (slopeL || 0));
    const convergenceRatio = slopeDiff / Math.max(Math.abs(slopeH || 0), Math.abs(slopeL || 0), 0.0001);
    console.debug(`${symbol} ${interval}: Convergence analysis - slope_diff=${slopeDiff.toFixed(6)}, ratio=${convergenceRatio.toFixed(4)}, H_R²=${rSqH.toFixed(4)}, L_R²=${rSqL.toFixed(4)}`);

    // Bullish Wedge (Falling Wedge) - prefer in downtrend or sideways (reversal pattern)
    const bullishSlopeCrit = (slopeH || 0) < -TRENDLINE_SLOPE_DIFF_THRESHOLD && (slopeL || 0) < -TRENDLINE_SLOPE_DIFF_THRESHOLD;
    const bullishConvCrit = true; // Relaxed for aggressive mode
    const bullishRsqCrit = (rSqH || 0) > WEDGE_MIN_R_SQUARED && (rSqL || 0) > WEDGE_MIN_R_SQUARED;

    if (bullishSlopeCrit && bullishConvCrit && bullishRsqCrit) {
      console.info(`${symbol} ${interval}: [BULLISH WEDGE FORMING] Both slopes negative (downtrend), convergence detected (H_slope=${slopeH.toFixed(6)}, L_slope=${slopeL.toFixed(6)})`);
      if (Math.abs((slopeH || 0) - (slopeL || 0)) > TRENDLINE_SLOPE_DIFF_THRESHOLD) {
        const maxPivotIdx = Math.max(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));
        const apexIdxApprox = ((interceptL || 0) - (interceptH || 0)) / ((slopeH || 0) - (slopeL || 0));
        const minPivotIdx = Math.min(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));
        const patternSpanIndices = maxPivotIdx - minPivotIdx;
        if (patternSpanIndices > 0) {
          const currentKlineEndIdx = klines.length - 1;
          const distanceToApexConceptual = apexIdxApprox - currentKlineEndIdx;
          detectedPattern = {
            symbol,
            patternType: "Bullish Wedge (Falling Wedge)",
            interval,
            detectionTime: klines[klines.length - 1].closeTime,
            upperTrendlineSlope: slopeH,
            upperTrendlineIntercept: interceptH,
            lowerTrendlineSlope: slopeL,
            lowerTrendlineIntercept: interceptL,
            approxApexIndex: apexIdxApprox,
            upperPivots: recentHighsChrono,
            lowerPivots: recentLowsChrono
          };
        }
      }
    } else {
      console.debug(`${symbol} ${interval}: Bullish Wedge - slope_crit=${bullishSlopeCrit}, conv_crit=${bullishConvCrit}, rsq_crit=${bullishRsqCrit}`);
    }

    // Bearish Wedge (Rising Wedge)
    const bearishSlopeCrit = (slopeH || 0) > TRENDLINE_SLOPE_DIFF_THRESHOLD && (slopeL || 0) > TRENDLINE_SLOPE_DIFF_THRESHOLD;
    const bearishConvCrit = true; // Relaxed
    const bearishRsqCrit = (rSqH || 0) > WEDGE_MIN_R_SQUARED && (rSqL || 0) > WEDGE_MIN_R_SQUARED;

    if (bearishSlopeCrit && bearishConvCrit && bearishRsqCrit) {
      console.info(`${symbol} ${interval}: [BEARISH WEDGE FORMING] Both slopes positive (uptrend), convergence detected (H_slope=${slopeH.toFixed(6)}, L_slope=${slopeL.toFixed(6)})`);
      if (Math.abs((slopeH || 0) - (slopeL || 0)) > TRENDLINE_SLOPE_DIFF_THRESHOLD) {
        const maxPivotIdx = Math.max(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));
        const apexIdxApprox = ((interceptL || 0) - (interceptH || 0)) / ((slopeH || 0) - (slopeL || 0));
        const minPivotIdx = Math.min(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));
        const patternSpanIndices = maxPivotIdx - minPivotIdx;
        if (patternSpanIndices > 0) {
          const currentKlineEndIdx = klines.length - 1;
          const distanceToApexConceptual = apexIdxApprox - currentKlineEndIdx;
          detectedPattern = {
            symbol,
            patternType: "Bearish Wedge (Rising Wedge)",
            interval,
            detectionTime: klines[klines.length - 1].closeTime,
            upperTrendlineSlope: slopeH,
            upperTrendlineIntercept: interceptH,
            lowerTrendlineSlope: slopeL,
            lowerTrendlineIntercept: interceptL,
            approxApexIndex: apexIdxApprox,
            upperPivots: recentHighsChrono,
            lowerPivots: recentLowsChrono
          };
        }
      }
    } else {
      console.debug(`${symbol} ${interval}: Bearish Wedge - slope_crit=${bearishSlopeCrit}, conv_crit=${bearishConvCrit}, rsq_crit=${bearishRsqCrit}`);
    }
    return detectedPattern;
  }

  private checkWedgeBreakout(symbol: string, interval: string, pattern: Pattern, currentKlines: Kline[]): TradeSignal | null {
    if (!pattern || pattern.upperTrendlineSlope == null || pattern.lowerTrendlineSlope == null ||
        pattern.upperTrendlineIntercept == null || pattern.lowerTrendlineIntercept == null) {
      return null;
    }

    // Klines are in chronological order (oldest first), so newest is at index -1
    const lastCandle = currentKlines[currentKlines.length - 1];
    const prevCandle = currentKlines.length > 1 ? currentKlines[currentKlines.length - 2] : lastCandle;

    // Trendline y = mx + c, where x is the index in chronological order
    const lastIdx = currentKlines.length - 1; // Index of newest candle
    const prevIdx = currentKlines.length > 1 ? currentKlines.length - 2 : lastIdx;

    let signal: TradeSignal | null = null;

    // For a Bullish Wedge, breakout is above the upper trendline
    if (pattern.patternType.includes("Bullish Wedge")) {
      // Calculate trendline values at the current and previous candle indices
      const utlValAtLast = pattern.upperTrendlineIntercept + pattern.upperTrendlineSlope * lastIdx;
      const utlValAtPrev = pattern.upperTrendlineIntercept + pattern.upperTrendlineSlope * prevIdx;

      if (lastCandle.close > utlValAtLast && prevCandle.close <= utlValAtPrev) { // Check for crossover
        const entryPrice = lastCandle.close;
        // Stop loss below the lower trendline of the wedge or recent significant low within the wedge
        const stopLossPrice = Math.min(...pattern.lowerPivots.map(p => p.price)) * 0.999; // Slightly below recent low
        // Take profit: Height of the wedge at widest point projected upwards from entry
        const startIdxPivots = Math.min(...pattern.upperPivots.concat(pattern.lowerPivots).map(p => p.index));
        const startUtlVal = pattern.upperTrendlineIntercept + pattern.upperTrendlineSlope * startIdxPivots;
        const startLtlVal = pattern.lowerTrendlineIntercept + pattern.lowerTrendlineSlope * startIdxPivots;
        const wedgeHeight = startUtlVal - startLtlVal;
        const takeProfitPrice = entryPrice + wedgeHeight;

        signal = {
          symbol,
          strategy: "Wedge Breakout",
          tradeType: "long",
          interval,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          signalTime: lastCandle.closeTime,
          patternDetails: pattern
        };
        console.info(`WEDGE BREAKOUT (LONG) for ${symbol} ${interval}. Entry: ${entryPrice.toFixed(4)}`);
        return signal;
      } else {
        console.debug(
          `[WEDGE] ${symbol} ${interval} no long breakout: prev_close=${prevCandle.close.toFixed(4)} last_close=${lastCandle.close.toFixed(4)} ` +
          `prev_utl=${utlValAtPrev.toFixed(4)} last_utl=${utlValAtLast.toFixed(4)}`
        );
      }
    }

    // For a Bearish Wedge, breakout is below the lower trendline
    else if (pattern.patternType.includes("Bearish Wedge")) {
      const ltlValAtLast = pattern.lowerTrendlineIntercept + pattern.lowerTrendlineSlope * lastIdx;
      const ltlValAtPrev = pattern.lowerTrendlineIntercept + pattern.lowerTrendlineSlope * prevIdx;

      if (lastCandle.close < ltlValAtLast && prevCandle.close >= ltlValAtPrev) {
        const entryPrice = lastCandle.close;
        const stopLossPrice = Math.max(...pattern.upperPivots.map(p => p.price)) * 1.001;
        const startIdxPivots = Math.min(...pattern.upperPivots.concat(pattern.lowerPivots).map(p => p.index));
        const startUtlVal = pattern.upperTrendlineIntercept + pattern.upperTrendlineSlope * startIdxPivots;
        const startLtlVal = pattern.lowerTrendlineIntercept + pattern.lowerTrendlineSlope * startIdxPivots;
        const wedgeHeight = startUtlVal - startLtlVal;
        const takeProfitPrice = entryPrice - wedgeHeight;

        signal = {
          symbol,
          strategy: "Wedge Breakout",
          tradeType: "short",
          interval,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          signalTime: lastCandle.closeTime,
          patternDetails: pattern
        };
        console.info(`WEDGE BREAKOUT (SHORT) for ${symbol} ${interval}. Entry: ${entryPrice.toFixed(4)}`);
        return signal;
      } else {
        console.debug(
          `[WEDGE] ${symbol} ${interval} no short breakout: prev_close=${prevCandle.close.toFixed(4)} last_close=${lastCandle.close.toFixed(4)} ` +
          `prev_ltl=${ltlValAtPrev.toFixed(4)} last_ltl=${ltlValAtLast.toFixed(4)}`
        );
      }
    }
    return null;
  }

  private async detectOrbBreakout(symbol: string, currentTimeUtc: Date): Promise<TradeSignal | null> {
    if (!ORB_SYMBOLS.includes(symbol) || !MONITORED_SYMBOLS.includes(symbol)) return null;
    const num1m = 60 * 24 + 10;
    const num5m = (60 * 24) / 5 + 10;
    const klines1m = await this.apiClient.getKlines(symbol, "1m", num1m); // Returns chronological (oldest first)
    const klines5m = await this.apiClient.getKlines(symbol, "5m", num5m); // Returns chronological (oldest first)

    if (!klines1m || !klines5m) return null;

    const dayStartUtc = new Date(currentTimeUtc);
    dayStartUtc.setUTCHours(0, 0, 0, 0);
    // Klines are in chronological order (oldest first). Filter by close_time.
    const dailyKlines1m = klines1m.filter(k => k.closeTime >= dayStartUtc);
    const dailyKlines5m = klines5m.filter(k => k.closeTime >= dayStartUtc);
    if (!dailyKlines1m || !dailyKlines5m) return null;

    const orbEndTime = new Date(dayStartUtc.getTime() + ORB_DURATION_MINUTES * 60 * 1000);

    // Check if current time is past the opening range formation period
    if (currentTimeUtc <= new Date(orbEndTime.getTime() + getCandleDurationMinutes("5m") * 60 * 1000)) {
      return null;
    }

    const orbKlines = dailyKlines1m.filter(k => k.closeTime < orbEndTime);
    if (!orbKlines.length) return null;
    const orbHigh = Math.max(...orbKlines.map(k => k.high));
    const orbLow = Math.min(...orbKlines.map(k => k.low));
    console.debug(`${symbol} ORB: High=${orbHigh.toFixed(4)}, Low=${orbLow.toFixed(4)}`);

    const postOrbKlines = dailyKlines5m.filter(k => k.openTime >= orbEndTime); // Using 5m for breakout confirmation
    if (!postOrbKlines.length) return null; // No candles formed yet after ORB

    // Look for a clear breakout: close beyond ORB high/low
    const lastPostOrbCandle = postOrbKlines[postOrbKlines.length - 1]; // Most recent 5m candle after ORB

    let signal: TradeSignal | null = null;
    const entryPrice = lastPostOrbCandle.close;
    const signalTime = lastPostOrbCandle.closeTime;
    const interval = "5m";
    if (entryPrice > orbHigh * ORB_BREAKOUT_BUFFER_FACTOR) {
      const stopLossPrice = orbLow * (2.0 - ORB_BREAKOUT_BUFFER_FACTOR); // SL below ORB low
      const riskPerUnit = entryPrice - stopLossPrice;
      let takeProfitPrice: number;
      if (riskPerUnit > 0) {
        takeProfitPrice = entryPrice + (riskPerUnit * ORB_RISK_REWARD_RATIO);
      } else {
        return null; // Invalid risk
      }
      signal = {
        symbol,
        strategy: "ORB Breakout",
        tradeType: "long",
        interval,
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        signalTime,
        patternDetails: {
          symbol,
          patternType: "ORB_Bullish",
          interval,
          detectionTime: signalTime,
          orbHigh,
          orbLow,
          orbEndTime,
          upperPivots: [],
          lowerPivots: []
        }
      };
      console.info(`ORB BREAKOUT (LONG) for ${symbol} ${interval}. Entry: ${entryPrice.toFixed(4)}`);
    } else if (entryPrice < orbLow / ORB_BREAKOUT_BUFFER_FACTOR) {
      const stopLossPrice = orbHigh * ORB_BREAKOUT_BUFFER_FACTOR;
      const riskPerUnit = stopLossPrice - entryPrice;
      let takeProfitPrice: number;
      if (riskPerUnit > 0) {
        takeProfitPrice = entryPrice - (riskPerUnit * ORB_RISK_REWARD_RATIO);
      } else {
        return null; // Invalid risk
      }
      signal = {
        symbol,
        strategy: "ORB Breakout",
        tradeType: "short",
        interval,
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        signalTime,
        patternDetails: {
          symbol,
          patternType: "ORB_Bearish",
          interval,
          detectionTime: signalTime,
          orbHigh,
          orbLow,
          orbEndTime,
          upperPivots: [],
          lowerPivots: []
        }
      };
      console.info(`ORB BREAKOUT (SHORT) for ${symbol} ${interval}. Entry: ${entryPrice.toFixed(4)}`);
    }
    return signal;
  }

  private detect5mPattern(symbol: string, klines: Kline[]): Pattern | null {
    if (klines.length < WEDGE_MIN_PIVOTS_5M + 2) {
      return null;
    }

    // Identify pivot points (simplified for speed)
    const pivotIndices: number[] = [];
    for (let i = 1; i < klines.length - 1; i++) {
      const isHighPivot = klines[i].high > klines[i - 1].high && klines[i].high > klines[i + 1].high;
      const isLowPivot = klines[i].low < klines[i - 1].low && klines[i].low < klines[i + 1].low;
      if (isHighPivot || isLowPivot) {
        pivotIndices.push(i);
      }
    }

    if (pivotIndices.length < WEDGE_MIN_PIVOTS_5M) {
      return null;
    }

    // Extract pivot prices
    const pivotHighs = pivotIndices.map(i => klines[i].high);
    const pivotLows = pivotIndices.map(i => klines[i].low);

    // Fit trendlines with aggressive parameters
    const x = Array.from({ length: pivotHighs.length }, (_, i) => i);

    // Upper trendline
    const zHigh = this.simpleLinearRegression(x, pivotHighs);
    const pHigh = (xVal: number) => zHigh.slope * xVal + zHigh.intercept;
    const residualsHigh = pivotHighs.map((y, i) => y - pHigh(i));
    const ssResHigh = residualsHigh.reduce((sum, r) => sum + r * r, 0);
    const ssTotHigh = pivotHighs.reduce((sum, y) => sum + Math.pow(y - (pivotHighs.reduce((a, b) => a + b, 0) / pivotHighs.length), 2), 0);
    const r2High = ssTotHigh > 0 ? 1 - (ssResHigh / ssTotHigh) : 0;

    // Lower trendline
    const zLow = this.simpleLinearRegression(x, pivotLows);
    const pLow = (xVal: number) => zLow.slope * xVal + zLow.intercept;
    const residualsLow = pivotLows.map((y, i) => y - pLow(i));
    const ssResLow = residualsLow.reduce((sum, r) => sum + r * r, 0);
    const ssTotLow = pivotLows.reduce((sum, y) => sum + Math.pow(y - (pivotLows.reduce((a, b) => a + b, 0) / pivotLows.length), 2), 0);
    const r2Low = ssTotLow > 0 ? 1 - (ssResLow / ssTotLow) : 0;

    // Check for wedge convergence (aggressive for 5m)
    if (r2High >= WEDGE_MIN_R_SQUARED_5M && r2Low >= WEDGE_MIN_R_SQUARED_5M) {
      const slopeDiff = Math.abs(zHigh.slope - zLow.slope);
      if (slopeDiff > 0) {  // Slopes differ (convergence)
        // Determine wedge type
        const upperSlope = zHigh.slope;
        const lowerSlope = zLow.slope;

        if (upperSlope < 0 && lowerSlope < 0 && lowerSlope > upperSlope) {
          // Falling wedge (bullish)
          return {
            symbol,
            patternType: "Bullish Wedge (Falling Wedge)",
            interval: "5m",
            detectionTime: new Date(),
            upperTrendlineSlope: upperSlope,
            lowerTrendlineSlope: lowerSlope,
            upperPivots: [], // Simplified
            lowerPivots: []
          };
        } else if (upperSlope > 0 && lowerSlope > 0 && upperSlope > lowerSlope) {
          // Rising wedge (bearish)
          return {
            symbol,
            patternType: "Bearish Wedge (Rising Wedge)",
            interval: "5m",
            detectionTime: new Date(),
            upperTrendlineSlope: upperSlope,
            lowerTrendlineSlope: lowerSlope,
            upperPivots: [], // Simplified
            lowerPivots: []
          };
        }
      }
    }

    return null;
  }

  private simpleLinearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  private check5mBreakout(symbol: string, pattern: Pattern, klines: Kline[]): TradeSignal | null {
    if (!klines || klines.length < 2) {
      return null;
    }

    const lastCandle = klines[klines.length - 1];
    const prevCandle = klines[klines.length - 2];
    const currentPrice = lastCandle.close;

    // Bullish wedge breakout
    if (pattern.patternType.includes("Bullish")) {
      if (currentPrice > prevCandle.high) {  // Price breaks above previous high
        const entryPrice = currentPrice;
        const riskPerUnit = pattern.lowerTrendlineSlope ? Math.abs(pattern.lowerTrendlineSlope) * 0.05 : 0.01;
        const stopLossPrice = entryPrice - riskPerUnit * 2;
        const takeProfitPrice = entryPrice + riskPerUnit * 2;
        console.info(`[5M BREAKOUT] ${symbol} bullish: prev_high=${prevCandle.high.toFixed(4)} close=${currentPrice.toFixed(4)} sl=${stopLossPrice.toFixed(4)} tp=${takeProfitPrice.toFixed(4)}`);

        const signal: TradeSignal = {
          symbol,
          strategy: "5m_Aggressive",
          tradeType: "long",
          interval: "5m",
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          signalTime: new Date(),
          patternDetails: pattern
        };
        return signal;
      }
    }

    // Bearish wedge breakout
    else if (pattern.patternType.includes("Bearish")) {
      if (currentPrice < prevCandle.low) {  // Price breaks below previous low
        const entryPrice = currentPrice;
        const riskPerUnit = pattern.upperTrendlineSlope ? pattern.upperTrendlineSlope * 0.05 : 0.01;
        const stopLossPrice = entryPrice + riskPerUnit * 2;
        const takeProfitPrice = entryPrice - riskPerUnit * 2;
        console.info(`[5M BREAKOUT] ${symbol} bearish: prev_low=${prevCandle.low.toFixed(4)} close=${currentPrice.toFixed(4)} sl=${stopLossPrice.toFixed(4)} tp=${takeProfitPrice.toFixed(4)}`);

        const signal: TradeSignal = {
          symbol,
          strategy: "5m_Aggressive",
          tradeType: "short",
          interval: "5m",
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          signalTime: new Date(),
          patternDetails: pattern
        };
        return signal;
      }
    }

    console.debug(
      `[5M BREAKOUT] ${symbol} no trigger: prev_high=${prevCandle.high.toFixed(4)} prev_low=${prevCandle.low.toFixed(4)} close=${currentPrice.toFixed(4)}`
    );
    return null;
  }

  async scanAndGenerateSignals(currentTimeUtc: Date): Promise<TradeSignal[]> {
    const generatedSignals: TradeSignal[] = [];
    const swingIntervals = ["15m", "1h"];

    // Scan standard intervals for all symbols
    for (const symbol of MONITORED_SYMBOLS) {
      console.debug(`Scanning ${symbol}...`);
      for (const interval of swingIntervals) {
        const patternKey = `${symbol}_${interval}`;
        if (!this.activePatterns.has(patternKey)) {
          // For wedge detection, we need enough klines. API returns newest first.
          // WEDGE_LOOKBACK_CANDLES is the number of candles to fetch.
          const klinesForDetection = await this.apiClient.getKlines(symbol, interval, WEDGE_LOOKBACK_CANDLES);
          if (klinesForDetection) { // API returns newest first
            // Use Kewltech method with EMA-filtered pattern detection
            const detectedPattern = this.detectWedgePattern(symbol, interval, klinesForDetection);
            if (detectedPattern) {
              this.activePatterns.set(patternKey, detectedPattern);
              // Send pattern to web API
              if (this.tradingBot) {
                this.tradingBot.sendPatternToApi(symbol, interval, detectedPattern.patternType, true);
              }
              // Log EMA context for the pattern
              const emaTrends = getEMATrend(klinesForDetection, EMA_PERIODS);
              console.info(`[KEWLTECH] Potential Pattern Detected: ${detectedPattern.patternType} for ${symbol} ${interval}`);
              console.info(`  EMA Trends: ${Object.entries(emaTrends).map(([k, v]) => `EMA${k}:${v}`).join(', ')}`);
            }
          }
        } else {
          // If pattern exists, check for breakout using recent klines
          // Fetch fewer klines for breakout check to be efficient
          const recentKlinesForBreakoutCheck = await this.apiClient.getKlines(symbol, interval, 50);
          if (recentKlinesForBreakoutCheck && recentKlinesForBreakoutCheck.length >= 2) { // Need at least two candles
            const breakoutSignal = this.checkWedgeBreakout(symbol, interval, this.activePatterns.get(patternKey)!, recentKlinesForBreakoutCheck);
            if (breakoutSignal) {
              // Send pattern breakout to API
              if (this.tradingBot) {
                this.tradingBot.sendPatternToApi(symbol, interval, this.activePatterns.get(patternKey)!.patternType, false);
              }
              generatedSignals.push(breakoutSignal);
              this.activePatterns.delete(patternKey);
              console.info(`Breakout signal generated and pattern ${patternKey} removed.`);
            }
          }
        }
        // ORB Detection (Opening Range Breakout)
        const orbSignal = await this.detectOrbBreakout(symbol, currentTimeUtc);
        if (orbSignal) {
          console.info(`[ORB SIGNAL] ${orbSignal.symbol} ${orbSignal.patternDetails?.patternType}: Entry=${orbSignal.entryPrice.toFixed(4)}, SL=${orbSignal.stopLossPrice.toFixed(4)}, TP=${orbSignal.takeProfitPrice.toFixed(4)}`);
          generatedSignals.push(orbSignal);
        } else {
          console.debug(`[ORB] No breakout detected for ${symbol} at ${currentTimeUtc.toISOString()}`);
        }
      }
    }

    // Clean up old patterns
    const patternsToRemove: string[] = [];
    for (const [pKey, activePattern] of Array.from(this.activePatterns)) {
      // Pattern age based on its interval and lookback candles
      const patternAgeThresholdHours = getCandleDurationMinutes(activePattern.interval) / 60 * WEDGE_LOOKBACK_CANDLES * 1.5; // Heuristic
      if ((currentTimeUtc.getTime() - activePattern.detectionTime.getTime()) > patternAgeThresholdHours * 60 * 60 * 1000) {
        patternsToRemove.push(pKey);
        console.info(`Removing old pattern ${pKey} due to age.`);
      }
    }
    patternsToRemove.forEach(pKey => this.activePatterns.delete(pKey));
    return generatedSignals;
  }
}