// ==============================================================================
// FILE: patternRecognizer.enhanced.ts
// ==============================================================================
// Comprehensive Multi-Pattern Detection System
// Integrates: Wedges, Double Tops/Bottoms, Triangles, H&S Patterns
// Confirmation: MACD, Stochastic, RSI, A/D Line
// Validation: Support/Resistance, EMA Trend, Volume
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
  AUTO_TRADE_ON_PATTERN_DETECTION,
  AUTO_TRADE_ON_BREAKOUT,
  MAX_CONCURRENT_TRADES
} from './config';
import { getPivotPoints, fitTrendline, getEMATrend, getCandleDurationMinutes } from './utils';
import { MACD, Stochastic, RSI, ADL } from 'technicalindicators';

// ============================================================================
// HELPER INTERFACES
// ============================================================================

interface TechnicalIndicators {
  macd: { value: number; signal: number; histogram: number } | null;
  stochastic: { k: number; d: number; signal: string } | null;
  rsi: number | null;
  adl: number | null;
  emaTrends: { [key: number]: string | null };
  volume: number;
  avgVolume: number;
}

interface SupportResistance {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
}

interface PatternConfidence {
  score: number;
  reasons: string[];
}

// ============================================================================
// ENHANCED PATTERN RECOGNIZER CLASS
// ============================================================================

export class EnhancedPatternRecognizer {
  private apiClient: WoofiProAPIClient;
  private tradingBot: any;
  private activePatterns: Map<string, Pattern>;
  private supportResistanceLevels: Map<string, SupportResistance>;

  constructor(apiClient: WoofiProAPIClient, tradingBot?: any) {
    this.apiClient = apiClient;
    this.tradingBot = tradingBot;
    this.activePatterns = new Map();
    this.supportResistanceLevels = new Map();
  }

  setTradingBot(tradingBot: any): void {
    this.tradingBot = tradingBot;
  }

  // ============================================================================
  // TECHNICAL INDICATORS CALCULATION
  // ============================================================================

  private calculateTechnicalIndicators(klines: Kline[]): TechnicalIndicators {
    const result: TechnicalIndicators = {
      macd: null,
      stochastic: null,
      rsi: null,
      adl: null,
      emaTrends: {},
      volume: 0,
      avgVolume: 0
    };

    if (klines.length < 50) return result;

    try {
      // MACD (12, 26, 9)
      const macdInput = {
        values: klines.map(k => k.close),
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      };
      const macdResult = MACD.calculate(macdInput);
      if (macdResult.length > 0) {
        const lastMacd = macdResult[macdResult.length - 1];
        result.macd = {
          value: lastMacd.MACD || 0,
          signal: lastMacd.signal || 0,
          histogram: lastMacd.histogram || 0
        };
      }

      // Stochastic (14, 3, 3)
      const stochInput = {
        high: klines.map(k => k.high),
        low: klines.map(k => k.low),
        close: klines.map(k => k.close),
        period: 14,
        signalPeriod: 3
      };
      const stochResult = Stochastic.calculate(stochInput);
      if (stochResult.length > 0) {
        const lastStoch = stochResult[stochResult.length - 1];
        result.stochastic = {
          k: lastStoch.k || 0,
          d: lastStoch.d || 0,
          signal: lastStoch.k > 80 ? 'overbought' : lastStoch.k < 20 ? 'oversold' : 'neutral'
        };
      }

      // RSI (14)
      result.rsi = this.calculateRSI(klines, 14);

      // Accumulation/Distribution Line
      const adlInput = {
        high: klines.map(k => k.high),
        low: klines.map(k => k.low),
        close: klines.map(k => k.close),
        volume: klines.map(k => k.volume)
      };
      const adlResult = ADL.calculate(adlInput);
      if (adlResult.length > 0) {
        result.adl = adlResult[adlResult.length - 1];
      }

      // EMA Trends
      result.emaTrends = getEMATrend(klines, EMA_PERIODS);

      // Volume Analysis
      result.volume = klines[klines.length - 1].volume;
      result.avgVolume = klines.slice(-20).reduce((sum, k) => sum + k.volume, 0) / 20;

    } catch (error) {
      console.error('[INDICATORS] Error calculating technical indicators:', error);
    }

    return result;
  }

  // ============================================================================
  // SUPPORT & RESISTANCE DETECTION
  // ============================================================================

  private detectSupportResistance(klines: Kline[]): SupportResistance {
    const pivots = getPivotPoints(klines, 3);
    const highs = pivots.filter(p => p.type === 'high').map(p => p.price);
    const lows = pivots.filter(p => p.type === 'low').map(p => p.price);

    // Cluster nearby levels (within 0.5% of each other)
    const clusterLevels = (levels: number[]): number[] => {
      if (levels.length === 0) return [];
      const sorted = levels.sort((a, b) => a - b);
      const clustered: number[] = [];
      let currentCluster = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i] - currentCluster[0]) / currentCluster[0] < 0.005) {
          currentCluster.push(sorted[i]);
        } else {
          clustered.push(currentCluster.reduce((a, b) => a + b) / currentCluster.length);
          currentCluster = [sorted[i]];
        }
      }
      clustered.push(currentCluster.reduce((a, b) => a + b) / currentCluster.length);
      return clustered;
    };

    const supports = clusterLevels(lows);
    const resistances = clusterLevels(highs);
    const currentPrice = klines[klines.length - 1].close;

    // Find nearest levels
    const nearestSupport = supports.filter(s => s < currentPrice).sort((a, b) => b - a)[0] || null;
    const nearestResistance = resistances.filter(r => r > currentPrice).sort((a, b) => a - b)[0] || null;

    return {
      supports,
      resistances,
      nearestSupport,
      nearestResistance
    };
  }

  // ============================================================================
  // PATTERN: DOUBLE TOP/BOTTOM DETECTION
  // ============================================================================

  private detectDoubleTopBottom(symbol: string, interval: string, klines: Kline[], indicators: TechnicalIndicators): Pattern | null {
    const pivots = getPivotPoints(klines, 3);
    const highs = pivots.filter(p => p.type === 'high').slice(-10); // Last 10 highs
    const lows = pivots.filter(p => p.type === 'low').slice(-10); // Last 10 lows

    // DOUBLE TOP DETECTION (Bearish Reversal)
    if (highs.length >= 2) {
      const lastTwo = highs.slice(-2);
      const priceDiff = Math.abs(lastTwo[0].price - lastTwo[1].price) / lastTwo[0].price;
      
      if (priceDiff < 0.02) { // Within 2%
        // Confirm with indicators
        const isOverbought = indicators.stochastic?.signal === 'overbought';
        const isBearishMACD = indicators.macd && indicators.macd.histogram < 0;
        const isBearishDivergence = indicators.rsi && indicators.rsi < 70 && lastTwo[1].price > lastTwo[0].price;
        
        if ((isOverbought || isBearishMACD) && indicators.emaTrends[50] !== 'bearish') {
          console.info(`[DOUBLE TOP] Detected for ${symbol} ${interval} at ${lastTwo[1].price.toFixed(4)}`);
          return {
            symbol,
            patternType: "Double Top",
            interval,
            detectionTime: klines[klines.length - 1].closeTime,
            upperPivots: lastTwo,
            lowerPivots: []
          };
        }
      }
    }

    // DOUBLE BOTTOM DETECTION (Bullish Reversal)
    if (lows.length >= 2) {
      const lastTwo = lows.slice(-2);
      const priceDiff = Math.abs(lastTwo[0].price - lastTwo[1].price) / lastTwo[0].price;
      
      if (priceDiff < 0.02) { // Within 2%
        // Confirm with indicators
        const isOversold = indicators.stochastic?.signal === 'oversold';
        const isBullishMACD = indicators.macd && indicators.macd.histogram > 0;
        const isBullishDivergence = indicators.rsi && indicators.rsi > 30 && lastTwo[1].price < lastTwo[0].price;
        
        if ((isOversold || isBullishMACD) && indicators.emaTrends[50] !== 'bullish') {
          console.info(`[DOUBLE BOTTOM] Detected for ${symbol} ${interval} at ${lastTwo[1].price.toFixed(4)}`);
          return {
            symbol,
            patternType: "Double Bottom",
            interval,
            detectionTime: klines[klines.length - 1].closeTime,
            upperPivots: [],
            lowerPivots: lastTwo
          };
        }
      }
    }

    return null;
  }

  // ============================================================================
  // PATTERN: ASCENDING/DESCENDING TRIANGLE
  // ============================================================================

  private detectTrianglePattern(symbol: string, interval: string, klines: Kline[], indicators: TechnicalIndicators): Pattern | null {
    const pivots = getPivotPoints(klines, 3);
    const highs = pivots.filter(p => p.type === 'high').slice(-5);
    const lows = pivots.filter(p => p.type === 'low').slice(-5);

    if (highs.length < 3 || lows.length < 3) return null;

    // ASCENDING TRIANGLE (Bullish Continuation)
    const highsFlat = highs.every(h => Math.abs(h.price - highs[0].price) / highs[0].price < 0.015); // Highs within 1.5%
    const lowsRising = lows.length >= 3 && lows[lows.length - 1].price > lows[0].price;
    
    if (highsFlat && lowsRising && indicators.emaTrends[50] === 'bullish') {
      console.info(`[ASCENDING TRIANGLE] Detected for ${symbol} ${interval}`);
      return {
        symbol,
        patternType: "Ascending Triangle",
        interval,
        detectionTime: klines[klines.length - 1].closeTime,
        upperPivots: highs,
        lowerPivots: lows
      };
    }

    // DESCENDING TRIANGLE (Bearish Continuation)
    const lowsFlat = lows.every(l => Math.abs(l.price - lows[0].price) / lows[0].price < 0.015); // Lows within 1.5%
    const highsFalling = highs.length >= 3 && highs[highs.length - 1].price < highs[0].price;
    
    if (lowsFlat && highsFalling && indicators.emaTrends[50] === 'bearish') {
      console.info(`[DESCENDING TRIANGLE] Detected for ${symbol} ${interval}`);
      return {
        symbol,
        patternType: "Descending Triangle",
        interval,
        detectionTime: klines[klines.length - 1].closeTime,
        upperPivots: highs,
        lowerPivots: lows
      };
    }

    return null;
  }

  // ============================================================================
  // PATTERN: HEAD AND SHOULDERS
  // ============================================================================

  private detectHeadAndShoulders(symbol: string, interval: string, klines: Kline[], indicators: TechnicalIndicators): Pattern | null {
    const pivots = getPivotPoints(klines, 3);
    const highs = pivots.filter(p => p.type === 'high').slice(-5);
    const lows = pivots.filter(p => p.type === 'low').slice(-5);

    // Need at least 3 highs for H&S
    if (highs.length < 3) return null;

    // HEAD AND SHOULDERS (Bearish Reversal)
    const sorted = [...highs].sort((a, b) => b.price - a.price);
    const head = sorted[0];
    const leftShoulder = highs.find(h => h.index < head.index && h.price < head.price * 0.98);
    const rightShoulder = highs.find(h => h.index > head.index && h.price < head.price * 0.98);

    if (leftShoulder && rightShoulder) {
      const shouldersLevel = Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price;
      
      if (shouldersLevel < 0.03 && indicators.rsi && indicators.rsi < 60) { // Shoulders within 3%
        console.info(`[HEAD & SHOULDERS] Detected for ${symbol} ${interval}`);
        return {
          symbol,
          patternType: "Head and Shoulders",
          interval,
          detectionTime: klines[klines.length - 1].closeTime,
          upperPivots: [leftShoulder, head, rightShoulder],
          lowerPivots: lows
        };
      }
    }

    // INVERSE HEAD AND SHOULDERS (Bullish Reversal)
    const sortedLows = [...lows].sort((a, b) => a.price - b.price);
    const headLow = sortedLows[0];
    const leftShoulderLow = lows.find(l => l.index < headLow.index && l.price > headLow.price * 1.02);
    const rightShoulderLow = lows.find(l => l.index > headLow.index && l.price > headLow.price * 1.02);

    if (leftShoulderLow && rightShoulderLow) {
      const shouldersLevel = Math.abs(leftShoulderLow.price - rightShoulderLow.price) / leftShoulderLow.price;
      
      if (shouldersLevel < 0.03 && indicators.rsi && indicators.rsi > 40) { // Shoulders within 3%
        console.info(`[INVERSE HEAD & SHOULDERS] Detected for ${symbol} ${interval}`);
        return {
          symbol,
          patternType: "Inverse Head and Shoulders",
          interval,
          detectionTime: klines[klines.length - 1].closeTime,
          upperPivots: highs,
          lowerPivots: [leftShoulderLow, headLow, rightShoulderLow]
        };
      }
    }

    return null;
  }

  // ============================================================================
  // PATTERN CONFIDENCE SCORING
  // ============================================================================

  private calculatePatternConfidence(pattern: Pattern, indicators: TechnicalIndicators, srLevels: SupportResistance): PatternConfidence {
    let score = 50; // Base score
    const reasons: string[] = [];

    const isBullish = ['Bullish', 'Double Bottom', 'Ascending', 'Inverse'].some(p => pattern.patternType.includes(p));
    const currentPrice = 0; // Would need klines to get current price

    // EMA Trend Alignment (+20/-10)
    if (indicators.emaTrends[50]) {
      if ((isBullish && indicators.emaTrends[50] === 'bullish') || 
          (!isBullish && indicators.emaTrends[50] === 'bearish')) {
        score += 20;
        reasons.push(`EMA50 aligned with pattern direction`);
      } else if ((isBullish && indicators.emaTrends[50] === 'bearish') || 
                 (!isBullish && indicators.emaTrends[50] === 'bullish')) {
        score -= 10;
        reasons.push(`EMA50 counter to pattern (reversal setup)`);
      }
    }

    // MACD Confirmation (+15)
    if (indicators.macd) {
      if ((isBullish && indicators.macd.histogram > 0) || 
          (!isBullish && indicators.macd.histogram < 0)) {
        score += 15;
        reasons.push(`MACD histogram confirms ${isBullish ? 'bullish' : 'bearish'} momentum`);
      }
    }

    // Stochastic Confirmation (+10)
    if (indicators.stochastic) {
      if ((isBullish && indicators.stochastic.signal === 'oversold') || 
          (!isBullish && indicators.stochastic.signal === 'overbought')) {
        score += 10;
        reasons.push(`Stochastic shows ${isBullish ? 'oversold' : 'overbought'} conditions`);
      }
    }

    // RSI Confirmation (+10)
    if (indicators.rsi) {
      if ((isBullish && indicators.rsi < 40) || (!isBullish && indicators.rsi > 60)) {
        score += 10;
        reasons.push(`RSI confirms ${isBullish ? 'oversold' : 'overbought'} momentum`);
      }
    }

    // Volume Confirmation (+10)
    if (indicators.volume > indicators.avgVolume * 1.2) {
      score += 10;
      reasons.push(`Above-average volume (+${((indicators.volume / indicators.avgVolume - 1) * 100).toFixed(0)}%)`);
    }

    // Support/Resistance Proximity (+15)
    if (isBullish && srLevels.nearestSupport) {
      score += 15;
      reasons.push(`Near support level at ${srLevels.nearestSupport.toFixed(4)}`);
    } else if (!isBullish && srLevels.nearestResistance) {
      score += 15;
      reasons.push(`Near resistance level at ${srLevels.nearestResistance.toFixed(4)}`);
    }

    return { score: Math.min(100, Math.max(0, score)), reasons };
  }

  // ============================================================================
  // EXISTING WEDGE DETECTION (ENHANCED)
  // ============================================================================

  private detectWedgePattern(symbol: string, interval: string, klines: Kline[], indicators: TechnicalIndicators): Pattern | null {
    if (klines.length < WEDGE_LOOKBACK_CANDLES * 0.55) return null;

    const pivots = getPivotPoints(klines, 2);
    if (pivots.length === 0) return null;

    const highs = pivots.filter(p => p.type === 'high');
    const lows = pivots.filter(p => p.type === 'low');

    if (highs.length < WEDGE_MIN_PIVOTS_FOR_TRENDLINE || lows.length < WEDGE_MIN_PIVOTS_FOR_TRENDLINE) return null;

    const recentHighsChrono = highs.slice(-WEDGE_MIN_PIVOTS_FOR_TRENDLINE).sort((a, b) => a.index - b.index);
    const recentLowsChrono = lows.slice(-WEDGE_MIN_PIVOTS_FOR_TRENDLINE).sort((a, b) => a.index - b.index);

    if (recentHighsChrono.length < 2 || recentLowsChrono.length < 2) return null;

    const [slopeH, interceptH, rSqH] = fitTrendline(recentHighsChrono);
    const [slopeL, interceptL, rSqL] = fitTrendline(recentLowsChrono);

    if (slopeH == null || interceptH == null || rSqH == null || 
        slopeL == null || interceptL == null || rSqL == null) return null;

    // BULLISH WEDGE (Falling Wedge) - Both slopes negative
    if (slopeH < -TRENDLINE_SLOPE_DIFF_THRESHOLD && 
        slopeL < -TRENDLINE_SLOPE_DIFF_THRESHOLD &&
        rSqH > WEDGE_MIN_R_SQUARED && 
        rSqL > WEDGE_MIN_R_SQUARED) {
      
      const maxPivotIdx = Math.max(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));
      const apexIdxApprox = (interceptL - interceptH) / (slopeH - slopeL);
      const minPivotIdx = Math.min(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));

      if (maxPivotIdx - minPivotIdx > 0) {
        console.info(`[BULLISH WEDGE] Forming for ${symbol} ${interval}`);
        return {
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

    // BEARISH WEDGE (Rising Wedge) - Both slopes positive
    if (slopeH > TRENDLINE_SLOPE_DIFF_THRESHOLD && 
        slopeL > TRENDLINE_SLOPE_DIFF_THRESHOLD &&
        rSqH > WEDGE_MIN_R_SQUARED && 
        rSqL > WEDGE_MIN_R_SQUARED) {
      
      const maxPivotIdx = Math.max(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));
      const apexIdxApprox = (interceptL - interceptH) / (slopeH - slopeL);
      const minPivotIdx = Math.min(...recentHighsChrono.concat(recentLowsChrono).map(p => p.index));

      if (maxPivotIdx - minPivotIdx > 0) {
        console.info(`[BEARISH WEDGE] Forming for ${symbol} ${interval}`);
        return {
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

    return null;
  }

  // ============================================================================
  // COMPREHENSIVE PATTERN DETECTION
  // ============================================================================

  private detectAllPatterns(symbol: string, interval: string, klines: Kline[]): Pattern[] {
    const patterns: Pattern[] = [];
    
    // Calculate indicators once
    const indicators = this.calculateTechnicalIndicators(klines);
    
    // Detect all pattern types
    const wedge = this.detectWedgePattern(symbol, interval, klines, indicators);
    if (wedge) patterns.push(wedge);

    const doublePattern = this.detectDoubleTopBottom(symbol, interval, klines, indicators);
    if (doublePattern) patterns.push(doublePattern);

    const triangle = this.detectTrianglePattern(symbol, interval, klines, indicators);
    if (triangle) patterns.push(triangle);

    const hs = this.detectHeadAndShoulders(symbol, interval, klines, indicators);
    if (hs) patterns.push(hs);

    return patterns;
  }

  // ============================================================================
  // SIGNAL GENERATION WITH COMPREHENSIVE VALIDATION
  // ============================================================================

  private generateSignalFromPattern(pattern: Pattern, klines: Kline[], indicators: TechnicalIndicators, srLevels: SupportResistance): TradeSignal | null {
    const lastCandle = klines[klines.length - 1];
    const isBullish = ['Bullish', 'Double Bottom', 'Ascending', 'Inverse'].some(p => pattern.patternType.includes(p));
    
    // Calculate pattern confidence
    const confidence = this.calculatePatternConfidence(pattern, indicators, srLevels);
    
    // Require minimum confidence score (Option C: Lowered from 60 to 40 for bootstrap phase)
    if (confidence.score < 40) {
      console.log(`[FILTER] ✗ Pattern ${pattern.patternType} for ${pattern.symbol} rejected: Low confidence (${confidence.score})`);
      return null;
    }

    // Trend Filter: require trend alignment with EMA50
    if (isBullish && indicators.emaTrends[50] === 'bearish') {
      console.log(`[FILTER] ✗ Rejecting LONG ${pattern.patternType} for ${pattern.symbol}: Bearish trend (EMA50)`);
      return null;
    }
    if (!isBullish && indicators.emaTrends[50] === 'bullish') {
      console.log(`[FILTER] ✗ Rejecting SHORT ${pattern.patternType} for ${pattern.symbol}: Bullish trend (EMA50)`);
      return null;
    }

    // RSI Filter (Option C: Relaxed from 70 to 85 for shorts, allows trading in overbought conditions)
    if (indicators.rsi) {
      if (isBullish && indicators.rsi < 30) {
        console.log(`[FILTER] ✗ Rejecting LONG: RSI too low (${indicators.rsi.toFixed(1)})`);
        return null;
      }
      if (!isBullish && indicators.rsi > 85) {
        console.log(`[FILTER] ✗ Rejecting SHORT: RSI too high (${indicators.rsi.toFixed(1)})`);
        return null;
      }
    }

    // Calculate entry, stop loss, and take profit
    const entryPrice = lastCandle.close;
    let stopLossPrice: number;
    let takeProfitPrice: number;

    if (isBullish) {
      // Use nearest support as stop loss or recent low
      stopLossPrice = srLevels.nearestSupport || 
                      (pattern.lowerPivots.length > 0 
                        ? Math.min(...pattern.lowerPivots.map(p => p.price)) * 0.995 
                        : entryPrice * 0.97);
      
      const riskPerUnit = entryPrice - stopLossPrice;
      takeProfitPrice = entryPrice + (riskPerUnit * 2.5); // 2.5:1 R:R
    } else {
      // Use nearest resistance as stop loss or recent high
      stopLossPrice = srLevels.nearestResistance || 
                      (pattern.upperPivots.length > 0 
                        ? Math.max(...pattern.upperPivots.map(p => p.price)) * 1.005 
                        : entryPrice * 1.03);
      
      const riskPerUnit = stopLossPrice - entryPrice;
      takeProfitPrice = entryPrice - (riskPerUnit * 2.5); // 2.5:1 R:R
    }

    console.log(`[SIGNAL] ✓ ${pattern.patternType} for ${pattern.symbol} approved (Confidence: ${confidence.score})`);
    console.log(`  Reasons: ${confidence.reasons.join(', ')}`);
    console.log(`  Entry: ${entryPrice.toFixed(4)}, SL: ${stopLossPrice.toFixed(4)}, TP: ${takeProfitPrice.toFixed(4)}`);

    return {
      symbol: pattern.symbol,
      strategy: pattern.patternType,
      tradeType: isBullish ? 'long' : 'short',
      interval: pattern.interval,
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      signalTime: lastCandle.closeTime,
      patternDetails: pattern
    };
  }

  // ============================================================================
  // MAIN SCAN FUNCTION
  // ============================================================================

  async scanAndGenerateSignals(currentTimeUtc: Date): Promise<TradeSignal[]> {
    const generatedSignals: TradeSignal[] = [];
    const swingIntervals = ["5m", "15m", "1h", "4h"];

    for (const symbol of MONITORED_SYMBOLS) {
      console.debug(`[SCAN] Analyzing ${symbol}...`);
      
      for (const interval of swingIntervals) {
        const klines = await this.apiClient.getKlines(symbol, interval, WEDGE_LOOKBACK_CANDLES);
        if (!klines || klines.length < 50) continue;

        // Calculate indicators and S/R levels
        const indicators = this.calculateTechnicalIndicators(klines);
        const srLevels = this.detectSupportResistance(klines);
        
        // Store S/R levels for future reference
        this.supportResistanceLevels.set(`${symbol}_${interval}`, srLevels);

        // Detect all pattern types
        const patterns = this.detectAllPatterns(symbol, interval, klines);
        
        // Generate signals from patterns
        for (const pattern of patterns) {
          const signal = this.generateSignalFromPattern(pattern, klines, indicators, srLevels);
          if (signal) {
            generatedSignals.push(signal);
            
            // Send to dashboard
            if (this.tradingBot) {
              this.tradingBot.sendPatternToApi(symbol, interval, pattern.patternType, true);
            }

            // Auto-trade if enabled
            if (AUTO_TRADE_ON_PATTERN_DETECTION && this.tradingBot && 
                this.tradingBot.activeTrades.length < MAX_CONCURRENT_TRADES) {
              console.log(`[AUTO TRADE] Executing ${signal.tradeType.toUpperCase()} on ${pattern.patternType}`);
              await this.tradingBot.processSignals([signal]);
            }
          }
        }
      }
    }

    console.info(`[SCAN] Complete. Generated ${generatedSignals.length} signals`);
    return generatedSignals;
  }

  // ============================================================================
  // RSI CALCULATION (Helper)
  // ============================================================================

  private calculateRSI(klines: Kline[], period: number = 14): number | null {
    if (klines.length < period + 1) return null;

    const changes: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      changes.push(klines[i].close - klines[i - 1].close);
    }

    const recentChanges = changes.slice(-period);
    const gains = recentChanges.filter(c => c > 0);
    const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}
