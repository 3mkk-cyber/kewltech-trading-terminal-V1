/**
 * Advanced Learning Engine for Trading Bot
 * Analyzes historical trade performance and adapts strategy parameters
 */

import { db } from "./db";
import { trades, signals } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export interface StrategyPerformance {
  strategy: string;
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  avgPnl: number;
  totalPnl: number;
  avgDuration: number;
  confidenceScore: number; // 0-100
}

export interface SymbolPerformance {
  symbol: string;
  totalTrades: number;
  winRate: number;
  avgPnl: number;
  bestStrategy: string;
  volatilityScore: number;
}

export interface PatternQuality {
  patternType: string;
  interval: string;
  successRate: number;
  avgPnl: number;
  sampleSize: number;
  reliability: number; // 0-100
}

export interface TradeQualityFactors {
  strategyScore: number;
  symbolScore: number;
  patternScore: number;
  timingScore: number;
  marketConditionScore: number;
  overallScore: number;
}

class LearningEngine {
  private strategyPerformance: Map<string, StrategyPerformance> = new Map();
  private symbolPerformance: Map<string, SymbolPerformance> = new Map();
  private patternQuality: Map<string, PatternQuality> = new Map();
  private lastAnalysisTime: Date = new Date(0);
  
  // Learning parameters
  private readonly MIN_SAMPLE_SIZE = 10; // Minimum trades needed for reliable statistics
  private readonly LEARNING_RATE = 0.15; // How quickly to adapt (0-1)
  private readonly RECENCY_BIAS = 0.7; // Weight recent trades more (0-1)
  
  /**
   * Initialize and load historical performance data
   */
  async initialize(): Promise<void> {
    console.log("[LEARNING] Initializing Learning Engine...");
    await this.analyzeHistoricalPerformance();
    console.log("[LEARNING] Learning Engine initialized");
  }

  /**
   * Analyze all historical trades to build performance profiles
   */
  private async analyzeHistoricalPerformance(): Promise<void> {
    try {
      // Get all closed trades from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const closedTrades = await db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.status, "closed"),
            gte(trades.entryTime, thirtyDaysAgo)
          )
        )
        .orderBy(desc(trades.exitTime));

      console.log(`[LEARNING] Analyzing ${closedTrades.length} historical trades...`);

      // Analyze strategy performance
      await this.analyzeStrategyPerformance(closedTrades);
      
      // Analyze symbol performance
      await this.analyzeSymbolPerformance(closedTrades);
      
      // Analyze pattern quality
      await this.analyzePatternQuality(closedTrades);

      this.lastAnalysisTime = new Date();
    } catch (error) {
      console.error("[LEARNING] Error analyzing historical performance:", error);
    }
  }

  /**
   * Analyze performance by strategy type
   */
  private async analyzeStrategyPerformance(closedTrades: any[]): Promise<void> {
    const strategyStats = new Map<string, any>();

    for (const trade of closedTrades) {
      // Get the signal that triggered this trade
      if (!trade.signalId) continue;

      const signal = await db
        .select()
        .from(signals)
        .where(eq(signals.id, trade.signalId))
        .limit(1);

      if (signal.length === 0) continue;

      const strategy = signal[0].strategy;
      
      if (!strategyStats.has(strategy)) {
        strategyStats.set(strategy, {
          strategy,
          totalTrades: 0,
          winners: 0,
          losers: 0,
          totalPnl: 0,
          totalDuration: 0,
          recentTrades: []
        });
      }

      const stats = strategyStats.get(strategy);
      stats.totalTrades++;
      
      if (trade.isWinner) {
        stats.winners++;
      } else {
        stats.losers++;
      }
      
      stats.totalPnl += trade.netPnlUsd || 0;
      
      if (trade.exitTime && trade.entryTime) {
        stats.totalDuration += (trade.exitTime.getTime() - trade.entryTime.getTime()) / 1000 / 60; // minutes
      }

      // Track recent trades with recency bias
      stats.recentTrades.push({
        isWinner: trade.isWinner,
        pnl: trade.netPnlUsd || 0,
        timestamp: trade.exitTime
      });
    }

    // Calculate final metrics with confidence scoring
    Array.from(strategyStats.entries()).forEach(([strategy, stats]) => {
      const winRate = stats.totalTrades > 0 ? (stats.winners / stats.totalTrades) * 100 : 0;
      const avgPnl = stats.totalTrades > 0 ? stats.totalPnl / stats.totalTrades : 0;
      const avgDuration = stats.totalTrades > 0 ? stats.totalDuration / stats.totalTrades : 0;

      // Calculate confidence score based on sample size and consistency
      const sampleSizeScore = Math.min(stats.totalTrades / this.MIN_SAMPLE_SIZE, 1) * 40;
      const performanceScore = (winRate / 100) * 40;
      const profitabilityScore = avgPnl > 0 ? Math.min(avgPnl / 10, 20) : 0;
      
      const confidenceScore = Math.min(sampleSizeScore + performanceScore + profitabilityScore, 100);

      this.strategyPerformance.set(strategy, {
        strategy,
        totalTrades: stats.totalTrades,
        winners: stats.winners,
        losers: stats.losers,
        winRate,
        avgPnl,
        totalPnl: stats.totalPnl,
        avgDuration,
        confidenceScore
      });
    });

    console.log(`[LEARNING] Analyzed ${strategyStats.size} different strategies`);
  }

  /**
   * Analyze performance by symbol
   */
  private async analyzeSymbolPerformance(closedTrades: any[]): Promise<void> {
    const symbolStats = new Map<string, any>();

    for (const trade of closedTrades) {
      const symbol = trade.symbol;
      
      if (!symbolStats.has(symbol)) {
        symbolStats.set(symbol, {
          symbol,
          totalTrades: 0,
          winners: 0,
          totalPnl: 0,
          strategies: new Map()
        });
      }

      const stats = symbolStats.get(symbol);
      stats.totalTrades++;
      
      if (trade.isWinner) {
        stats.winners++;
      }
      
      stats.totalPnl += trade.netPnlUsd || 0;

      // Track best strategy per symbol
      if (trade.signalId) {
        const signal = await db
          .select()
          .from(signals)
          .where(eq(signals.id, trade.signalId))
          .limit(1);

        if (signal.length > 0) {
          const strategy = signal[0].strategy;
          const strategyData = stats.strategies.get(strategy) || { wins: 0, total: 0, pnl: 0 };
          strategyData.total++;
          if (trade.isWinner) strategyData.wins++;
          strategyData.pnl += trade.netPnlUsd || 0;
          stats.strategies.set(strategy, strategyData);
        }
      }
    }

    // Calculate final metrics
    Array.from(symbolStats.entries()).forEach(([symbol, stats]) => {
      const winRate = stats.totalTrades > 0 ? (stats.winners / stats.totalTrades) * 100 : 0;
      const avgPnl = stats.totalTrades > 0 ? stats.totalPnl / stats.totalTrades : 0;

      // Find best performing strategy for this symbol
      let bestStrategy = "";
      let bestWinRate = 0;
      
      for (const [strategy, data] of stats.strategies.entries()) {
        const strategyWinRate = data.total > 0 ? (data.wins / data.total) * 100 : 0;
        if (strategyWinRate > bestWinRate) {
          bestWinRate = strategyWinRate;
          bestStrategy = strategy;
        }
      }

      // Calculate volatility score (higher avgPnl variance = higher volatility)
      const volatilityScore = Math.abs(avgPnl) / Math.max(stats.totalTrades, 1);

      this.symbolPerformance.set(symbol, {
        symbol,
        totalTrades: stats.totalTrades,
        winRate,
        avgPnl,
        bestStrategy,
        volatilityScore
      });
    });

    console.log(`[LEARNING] Analyzed ${symbolStats.size} different symbols`);
  }

  /**
   * Analyze pattern quality and reliability
   */
  private async analyzePatternQuality(closedTrades: any[]): Promise<void> {
    const patternStats = new Map<string, any>();

    for (const trade of closedTrades) {
      if (!trade.signalId) continue;

      const signal = await db
        .select()
        .from(signals)
        .where(eq(signals.id, trade.signalId))
        .limit(1);

      if (signal.length === 0) continue;

      const patternKey = `${signal[0].strategy}_${signal[0].interval}`;
      
      if (!patternStats.has(patternKey)) {
        patternStats.set(patternKey, {
          patternType: signal[0].strategy,
          interval: signal[0].interval,
          totalTrades: 0,
          winners: 0,
          totalPnl: 0
        });
      }

      const stats = patternStats.get(patternKey);
      stats.totalTrades++;
      
      if (trade.isWinner) {
        stats.winners++;
      }
      
      stats.totalPnl += trade.netPnlUsd || 0;
    }

    // Calculate reliability scores
    Array.from(patternStats.entries()).forEach(([key, stats]) => {
      const successRate = stats.totalTrades > 0 ? (stats.winners / stats.totalTrades) * 100 : 0;
      const avgPnl = stats.totalTrades > 0 ? stats.totalPnl / stats.totalTrades : 0;
      
      // Reliability = combination of sample size, success rate, and profitability
      const sampleReliability = Math.min(stats.totalTrades / this.MIN_SAMPLE_SIZE, 1) * 40;
      const successReliability = (successRate / 100) * 40;
      const profitReliability = avgPnl > 0 ? Math.min((avgPnl / 5) * 20, 20) : 0;
      
      const reliability = Math.min(sampleReliability + successReliability + profitReliability, 100);

      this.patternQuality.set(key, {
        patternType: stats.patternType,
        interval: stats.interval,
        successRate,
        avgPnl,
        sampleSize: stats.totalTrades,
        reliability
      });
    });

    console.log(`[LEARNING] Analyzed ${patternStats.size} pattern-interval combinations`);
  }

  /**
   * Calculate adaptive confidence score for a new trade signal
   */
  async calculateTradeQuality(signal: {
    symbol: string;
    strategy: string;
    interval: string;
    tradeType: "long" | "short";
  }): Promise<TradeQualityFactors> {
    // Refresh analysis if data is old (> 1 hour)
    if (Date.now() - this.lastAnalysisTime.getTime() > 60 * 60 * 1000) {
      await this.analyzeHistoricalPerformance();
    }

    // Strategy score
    const strategyPerf = this.strategyPerformance.get(signal.strategy);
    const strategyScore = strategyPerf 
      ? strategyPerf.confidenceScore 
      : 50; // Neutral score for unknown strategies

    // Symbol score
    const symbolPerf = this.symbolPerformance.get(signal.symbol);
    const symbolScore = symbolPerf 
      ? Math.min((symbolPerf.winRate / 100) * 100, 100)
      : 50;

    // Pattern score
    const patternKey = `${signal.strategy}_${signal.interval}`;
    const patternQuality = this.patternQuality.get(patternKey);
    const patternScore = patternQuality 
      ? patternQuality.reliability 
      : 50;

    // Timing score (based on recent market conditions)
    const timingScore = await this.calculateTimingScore(signal.symbol);

    // Market condition score (checks if conditions favor this strategy)
    const marketConditionScore = this.calculateMarketConditionScore(signal);

    // Calculate weighted overall score
    const overallScore = (
      strategyScore * 0.30 +
      symbolScore * 0.25 +
      patternScore * 0.25 +
      timingScore * 0.10 +
      marketConditionScore * 0.10
    );

    return {
      strategyScore,
      symbolScore,
      patternScore,
      timingScore,
      marketConditionScore,
      overallScore
    };
  }

  /**
   * Calculate timing score based on recent market activity
   */
  private async calculateTimingScore(symbol: string): Promise<number> {
    try {
      // Check recent trade performance for this symbol
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentTrades = await db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.symbol, symbol),
            eq(trades.status, "closed"),
            gte(trades.exitTime, oneHourAgo)
          )
        )
        .limit(5);

      if (recentTrades.length === 0) return 60; // Neutral when no recent data

      const recentWinners = recentTrades.filter(t => t.isWinner).length;
      const recentWinRate = (recentWinners / recentTrades.length) * 100;

      // Higher score if recent trades are winning
      return Math.min(recentWinRate + 20, 100);
    } catch (error) {
      return 60; // Neutral on error
    }
  }

  /**
   * Calculate market condition score
   */
  private calculateMarketConditionScore(signal: any): number {
    // Check if this strategy historically works better in current conditions
    const strategyPerf = this.strategyPerformance.get(signal.strategy);
    
    if (!strategyPerf) return 60;

    // If strategy has high confidence and good win rate, favor it
    if (strategyPerf.winRate > 60 && strategyPerf.confidenceScore > 70) {
      return 85;
    } else if (strategyPerf.winRate > 50 && strategyPerf.confidenceScore > 60) {
      return 70;
    } else if (strategyPerf.winRate < 40) {
      return 40;
    }

    return 60;
  }

  /**
   * Adapt position size based on strategy performance
   */
  adaptPositionSize(baseSize: number, strategy: string): number {
    const strategyPerf = this.strategyPerformance.get(strategy);
    
    if (!strategyPerf || strategyPerf.totalTrades < this.MIN_SAMPLE_SIZE) {
      return baseSize; // Use base size for unproven strategies
    }

    // Adjust position size based on win rate and confidence
    const winRateMultiplier = strategyPerf.winRate / 50; // 50% is baseline
    const confidenceMultiplier = strategyPerf.confidenceScore / 70; // 70 is baseline
    
    // Combine multipliers with learning rate to smooth adjustments
    const adjustmentFactor = (
      1.0 + 
      (winRateMultiplier - 1.0) * this.LEARNING_RATE +
      (confidenceMultiplier - 1.0) * this.LEARNING_RATE
    );

    // Cap adjustments to prevent extreme position sizes
    const boundedFactor = Math.max(0.5, Math.min(1.5, adjustmentFactor));
    
    return baseSize * boundedFactor;
  }

  /**
   * Determine if a signal should be filtered out based on poor historical performance
   */
  shouldFilterSignal(signal: {
    symbol: string;
    strategy: string;
    interval: string;
  }): boolean {
    const strategyPerf = this.strategyPerformance.get(signal.strategy);
    
    // Don't filter if we don't have enough data
    if (!strategyPerf || strategyPerf.totalTrades < this.MIN_SAMPLE_SIZE) {
      return false;
    }

    // Filter if strategy has consistently poor performance
    if (strategyPerf.winRate < 35 && strategyPerf.confidenceScore > 70) {
      console.log(`[LEARNING] Filtering signal: ${signal.strategy} has ${strategyPerf.winRate.toFixed(1)}% win rate`);
      return true;
    }

    // Check pattern quality
    const patternKey = `${signal.strategy}_${signal.interval}`;
    const patternQuality = this.patternQuality.get(patternKey);
    
    if (patternQuality && patternQuality.sampleSize >= this.MIN_SAMPLE_SIZE) {
      if (patternQuality.successRate < 35 && patternQuality.reliability > 60) {
        console.log(`[LEARNING] Filtering signal: ${patternKey} has ${patternQuality.successRate.toFixed(1)}% success rate`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get performance summary for logging
   */
  getPerformanceSummary(): string {
    let summary = "\n[LEARNING] Performance Summary:\n";
    
    summary += "─────────────────────────────────────────\n";
    summary += "STRATEGIES:\n";
    Array.from(this.strategyPerformance.entries()).forEach(([strategy, perf]) => {
      if (perf.totalTrades >= this.MIN_SAMPLE_SIZE) {
        summary += `  ${strategy}:\n`;
        summary += `    Win Rate: ${perf.winRate.toFixed(1)}% (${perf.winners}W/${perf.losers}L)\n`;
        summary += `    Avg P&L: $${perf.avgPnl.toFixed(2)}\n`;
        summary += `    Confidence: ${perf.confidenceScore.toFixed(0)}/100\n`;
      }
    });
    
    summary += "\nSYMBOLS:\n";
    Array.from(this.symbolPerformance.entries()).forEach(([symbol, perf]) => {
      if (perf.totalTrades >= 5) {
        summary += `  ${symbol}: ${perf.winRate.toFixed(1)}% (Best: ${perf.bestStrategy})\n`;
      }
    });
    
    summary += "─────────────────────────────────────────\n";
    
    return summary;
  }

  /**
   * Export learning data for analysis
   */
  exportLearningData(): {
    strategies: StrategyPerformance[];
    symbols: SymbolPerformance[];
    patterns: PatternQuality[];
  } {
    return {
      strategies: Array.from(this.strategyPerformance.values()),
      symbols: Array.from(this.symbolPerformance.values()),
      patterns: Array.from(this.patternQuality.values())
    };
  }
}

export const learningEngine = new LearningEngine();
