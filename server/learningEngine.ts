/**
 * Advanced Learning Engine for Trading Bot
 * Analyzes historical trade performance and adapts strategy parameters
 * Now with persistent database storage for continuous learning
 */

import { db } from "./db";
import { trades, signals, strategyPerformance, symbolPerformance, patternQuality } from "@shared/schema";
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
  private isInitialized: boolean = false;
  
  // Learning parameters
  private readonly MIN_SAMPLE_SIZE = 10; // Minimum trades needed for reliable statistics
  private readonly LEARNING_RATE = 0.15; // How quickly to adapt (0-1)
  private readonly RECENCY_BIAS = 0.7; // Weight recent trades more (0-1)
  private readonly UPDATE_INTERVAL = 5 * 60 * 1000; // Update database every 5 minutes
  
  /**
   * Initialize and load performance data from database
   */
  async initialize(): Promise<void> {
    console.log("[LEARNING] Initializing Learning Engine with database storage...");
    
    try {
      // Load existing data from database
      await this.loadFromDatabase();
      
      // Analyze any new trades since last update
      await this.analyzeHistoricalPerformance();
      
      // Set up periodic updates
      setInterval(() => this.periodicUpdate(), this.UPDATE_INTERVAL);
      
      this.isInitialized = true;
      console.log("[LEARNING] Learning Engine initialized with database persistence");
    } catch (error) {
      console.error("[LEARNING] Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Load learning data from database
   */
  private async loadFromDatabase(): Promise<void> {
    try {
      // Load strategy performance
      const strategies = await db.select().from(strategyPerformance);
      strategies.forEach(s => {
        this.strategyPerformance.set(s.strategy, {
          strategy: s.strategy,
          totalTrades: s.totalTrades,
          winners: s.winners,
          losers: s.losers,
          winRate: s.winRate,
          avgPnl: s.avgPnl,
          totalPnl: s.totalPnl,
          avgDuration: s.avgDuration,
          confidenceScore: s.confidenceScore
        });
      });

      // Load symbol performance
      const symbols = await db.select().from(symbolPerformance);
      symbols.forEach(s => {
        this.symbolPerformance.set(s.symbol, {
          symbol: s.symbol,
          totalTrades: s.totalTrades,
          winRate: s.winRate,
          avgPnl: s.avgPnl,
          bestStrategy: s.bestStrategy || "",
          volatilityScore: s.volatilityScore
        });
      });

      // Load pattern quality
      const patterns = await db.select().from(patternQuality);
      patterns.forEach(p => {
        const key = `${p.patternType}_${p.interval}`;
        this.patternQuality.set(key, {
          patternType: p.patternType,
          interval: p.interval,
          successRate: p.successRate,
          avgPnl: p.avgPnl,
          sampleSize: p.sampleSize,
          reliability: p.reliability
        });
      });

      console.log(`[LEARNING] Loaded from database: ${strategies.length} strategies, ${symbols.length} symbols, ${patterns.length} patterns`);
    } catch (error) {
      console.error("[LEARNING] Error loading from database:", error);
    }
  }

  /**
   * Periodic update to save learning data and analyze new trades
   */
  private async periodicUpdate(): Promise<void> {
    try {
      await this.analyzeHistoricalPerformance();
      await this.saveToDatabase();
    } catch (error) {
      console.error("[LEARNING] Error during periodic update:", error);
    }
  }

  /**
   * Save current learning data to database
   */
  private async saveToDatabase(): Promise<void> {
    try {
      // Save strategy performance
      for (const [strategy, perf] of Array.from(this.strategyPerformance.entries())) {
        await db
          .insert(strategyPerformance)
          .values({
            strategy: perf.strategy,
            totalTrades: perf.totalTrades,
            winners: perf.winners,
            losers: perf.losers,
            winRate: perf.winRate,
            avgPnl: perf.avgPnl,
            totalPnl: perf.totalPnl,
            avgDuration: perf.avgDuration,
            confidenceScore: perf.confidenceScore,
            lastUpdated: new Date()
          })
          .onConflictDoUpdate({
            target: strategyPerformance.strategy,
            set: {
              totalTrades: perf.totalTrades,
              winners: perf.winners,
              losers: perf.losers,
              winRate: perf.winRate,
              avgPnl: perf.avgPnl,
              totalPnl: perf.totalPnl,
              avgDuration: perf.avgDuration,
              confidenceScore: perf.confidenceScore,
              lastUpdated: new Date()
            }
          });
      }

      // Save symbol performance
      for (const [symbol, perf] of Array.from(this.symbolPerformance.entries())) {
        await db
          .insert(symbolPerformance)
          .values({
            symbol: perf.symbol,
            totalTrades: perf.totalTrades,
            winRate: perf.winRate,
            avgPnl: perf.avgPnl,
            bestStrategy: perf.bestStrategy,
            volatilityScore: perf.volatilityScore,
            lastUpdated: new Date()
          })
          .onConflictDoUpdate({
            target: symbolPerformance.symbol,
            set: {
              totalTrades: perf.totalTrades,
              winRate: perf.winRate,
              avgPnl: perf.avgPnl,
              bestStrategy: perf.bestStrategy,
              volatilityScore: perf.volatilityScore,
              lastUpdated: new Date()
            }
          });
      }

      // Save pattern quality
      for (const [key, perf] of Array.from(this.patternQuality.entries())) {
        await db
          .insert(patternQuality)
          .values({
            patternType: perf.patternType,
            interval: perf.interval,
            successRate: perf.successRate,
            avgPnl: perf.avgPnl,
            sampleSize: perf.sampleSize,
            reliability: perf.reliability,
            lastUpdated: new Date()
          })
          .onConflictDoNothing();
      }

      console.log("[LEARNING] Saved learning data to database");
    } catch (error) {
      console.error("[LEARNING] Error saving to database:", error);
    }
  }

  /**
   * Analyze all historical trades to build performance profiles
   * Only analyzes new trades since last update for efficiency
   */
  private async analyzeHistoricalPerformance(): Promise<void> {
    try {
      // Get all closed trades since last analysis
      const closedTrades = await db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.status, "closed"),
            gte(trades.exitTime, this.lastAnalysisTime)
          )
        )
        .orderBy(desc(trades.exitTime));

      if (closedTrades.length === 0) {
        console.log("[LEARNING] No new trades to analyze");
        return;
      }

      console.log(`[LEARNING] Analyzing ${closedTrades.length} new historical trades...`);

      // Analyze strategy performance
      await this.analyzeStrategyPerformance(closedTrades);
      
      // Analyze symbol performance
      await this.analyzeSymbolPerformance(closedTrades);
      
      // Analyze pattern quality
      await this.analyzePatternQuality(closedTrades);

      this.lastAnalysisTime = new Date();
      
      // Save to database after analysis
      await this.saveToDatabase();
    } catch (error) {
      console.error("[LEARNING] Error analyzing historical performance:", error);
    }
  }

  /**
   * Analyze performance by strategy type (incremental updates)
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
      
      // Get existing data or create new
      let existing = this.strategyPerformance.get(strategy);
      if (!existing) {
        existing = {
          strategy,
          totalTrades: 0,
          winners: 0,
          losers: 0,
          winRate: 0,
          avgPnl: 0,
          totalPnl: 0,
          avgDuration: 0,
          confidenceScore: 0
        };
      }

      if (!strategyStats.has(strategy)) {
        strategyStats.set(strategy, {
          strategy,
          totalTrades: existing.totalTrades,
          winners: existing.winners,
          losers: existing.losers,
          totalPnl: existing.totalPnl,
          totalDuration: existing.avgDuration * existing.totalTrades,
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

    console.log(`[LEARNING] Updated ${strategyStats.size} strategies`);
  }

  /**
   * Analyze performance by symbol (incremental updates)
   */
  private async analyzeSymbolPerformance(closedTrades: any[]): Promise<void> {
    const symbolStats = new Map<string, any>();

    for (const trade of closedTrades) {
      const symbol = trade.symbol;
      
      // Get existing data or create new
      let existing = this.symbolPerformance.get(symbol);
      if (!existing) {
        existing = {
          symbol,
          totalTrades: 0,
          winRate: 0,
          avgPnl: 0,
          bestStrategy: "",
          volatilityScore: 0
        };
      }

      if (!symbolStats.has(symbol)) {
        symbolStats.set(symbol, {
          symbol,
          totalTrades: existing.totalTrades,
          winners: Math.round(existing.winRate * existing.totalTrades / 100),
          totalPnl: existing.avgPnl * existing.totalTrades,
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

    console.log(`[LEARNING] Updated ${symbolStats.size} symbols`);
  }

  /**
   * Analyze pattern quality and reliability (incremental updates)
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
      
      // Get existing data or create new
      let existing = this.patternQuality.get(patternKey);
      if (!existing) {
        existing = {
          patternType: signal[0].strategy,
          interval: signal[0].interval,
          successRate: 0,
          avgPnl: 0,
          sampleSize: 0,
          reliability: 0
        };
      }

      if (!patternStats.has(patternKey)) {
        patternStats.set(patternKey, {
          patternType: signal[0].strategy,
          interval: signal[0].interval,
          totalTrades: existing.sampleSize,
          winners: Math.round(existing.successRate * existing.sampleSize / 100),
          totalPnl: existing.avgPnl * existing.sampleSize
        });
      }

      const stats = patternStats.get(patternKey);
      stats.totalTrades++;
      
      if (trade.isWinner) {
        stats.winners++;
      }
      
      stats.totalPnl += trade.netPnlUsd || 0;
    }

    // Calculate final metrics
    Array.from(patternStats.entries()).forEach(([key, stats]) => {
      const successRate = stats.totalTrades > 0 ? (stats.winners / stats.totalTrades) * 100 : 0;
      const avgPnl = stats.totalTrades > 0 ? stats.totalPnl / stats.totalTrades : 0;

      // Calculate reliability based on sample size and consistency
      const sampleReliability = Math.min(stats.totalTrades / this.MIN_SAMPLE_SIZE, 1) * 50;
      const performanceReliability = (successRate / 100) * 50;
      const reliability = Math.min(sampleReliability + performanceReliability, 100);

      this.patternQuality.set(key, {
        patternType: stats.patternType,
        interval: stats.interval,
        successRate,
        avgPnl,
        sampleSize: stats.totalTrades,
        reliability
      });
    });

    console.log(`[LEARNING] Updated ${patternStats.size} pattern-interval combinations`);
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
    // Patterns are stored by patternType+interval; fall back to strategy+interval for legacy data
    const patternKey = `${signal.strategy}_${signal.interval}`;
    const patternKeyAlt = `${signal.strategy.toUpperCase?.() || signal.strategy}_${signal.interval}`;
    const patternQuality =
      this.patternQuality.get(patternKey) ||
      this.patternQuality.get(patternKeyAlt) ||
      this.patternQuality.get(`${signal.strategy}_${signal.interval}`) || // legacy
      this.patternQuality.get(`${signal.interval}_${signal.strategy}`); // extra fallback
    const patternScore = patternQuality 
      ? patternQuality.reliability 
      : 50;

    // Timing score (based on recent market conditions)
    const timingScore = await this.calculateTimingScore(signal.symbol);

    // Market condition score (checks if conditions favor this strategy)
    const marketConditionScore = this.calculateMarketConditionScore(signal);

    // Calculate weighted overall score
    const overallScore = (
      strategyScore * 0.25 +
      symbolScore * 0.20 +
      patternScore * 0.25 +
      timingScore * 0.15 +
      marketConditionScore * 0.15
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

    const losing = strategyPerf.winRate < 45 || strategyPerf.confidenceScore < 55;
    const winning = strategyPerf.winRate > 60 && strategyPerf.confidenceScore > 65;

    if (losing) {
      return baseSize * 0.5; // Cut risk while recovering
    }

    if (winning) {
      return Math.min(baseSize * 1.25, baseSize * 1.5);
    }

    return baseSize; // Neutral
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
    if (strategyPerf.totalTrades >= Math.max(10, this.MIN_SAMPLE_SIZE) && strategyPerf.winRate < 45) {
      console.log(`[LEARNING] Filtering signal: ${signal.strategy} has ${strategyPerf.winRate.toFixed(1)}% win rate (n=${strategyPerf.totalTrades})`);
      return true;
    }

    // Check pattern quality
    const patternKey = `${signal.strategy}_${signal.interval}`;
    const patternKeyAlt = `${signal.strategy.toUpperCase?.() || signal.strategy}_${signal.interval}`;
    const patternQuality =
      this.patternQuality.get(patternKey) ||
      this.patternQuality.get(patternKeyAlt) ||
      this.patternQuality.get(`${signal.interval}_${signal.strategy}`);

    if (patternQuality && patternQuality.sampleSize >= Math.max(10, this.MIN_SAMPLE_SIZE)) {
      if (patternQuality.successRate < 45 && patternQuality.reliability > 55) {
        console.log(`[LEARNING] Filtering signal: ${patternKey} has ${patternQuality.successRate.toFixed(1)}% success rate (n=${patternQuality.sampleSize})`);
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

  async cleanup(): Promise<void> {
    // Clear in-memory caches; scheduled intervals will naturally exit on process shutdown
    this.strategyPerformance.clear();
    this.symbolPerformance.clear();
    this.patternQuality.clear();
  }
}

export const learningEngine = new LearningEngine();
