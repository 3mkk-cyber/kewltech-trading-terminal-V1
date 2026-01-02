/**
 * Database-backed storage for trading bot signals and pattern detections
 * This allows the bot to persist data across server restarts
 */

import { db } from "./db";
import { patterns, signals, trades, marketScans, emaTrends, orbData } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { learningEngine } from "./learningEngine";

export interface BotSignal {
  id: string;
  symbol: string;
  strategy: string;
  tradeType: "long" | "short";
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  positionSize: number;
  riskAmount: number;
  signalTime: number; // timestamp
  confidence?: number; // 0-100
  details?: any;
}

export interface BotPattern {
  id: string;
  symbol: string;
  interval: string;
  patternType: string;
  detectionTime: number; // timestamp
  upperSlope?: number;
  lowerSlope?: number;
  status: "forming" | "confirmed" | "breakout";
  details?: any;
}

export interface BotMarketScan {
  timestamp: number;
  symbols: Array<{
    symbol: string;
    price: number;
    change1h: number;
    emaStatus: Record<number, string>;
    volume: number;
  }>;
  patterns: BotPattern[];
  signals: BotSignal[];
}

export interface OpenTrade {
  id: string;
  symbol: string;
  tradeType: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  entryTime: number;
  unrealizedPnlUsd: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskAmountUsd: number;
  duration: number; // seconds
  isAggressive: boolean; // 5m trade?
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  entryTime: number;
  exitTime: number;
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "MANUAL";
  grossPnlUsd: number;
  feesUsd: number;
  netPnlUsd: number;
  riskAmount: number;
  isWinner: boolean;
}

class BotSignalsManager {
  private initialized: boolean = false;
  private activeSignals: Map<string, BotSignal> = new Map();
  private activePatterns: Map<string, BotPattern> = new Map();
  // Cache for latest open trade data (including current prices and P&L)
  private openTradesCache: Map<string, OpenTrade> = new Map();

  // Initialize by loading data from database
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log("[DB] Initializing BotSignalsManager from database...");

      // Load recent patterns (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentPatterns = await db
        .select()
        .from(patterns)
        .where(gte(patterns.detectionTime, yesterday))
        .orderBy(desc(patterns.detectionTime));

      console.log(`[DB] Loaded ${recentPatterns.length} recent patterns`);

      // Load recent signals (last 24 hours)
      const recentSignals = await db
        .select()
        .from(signals)
        .where(gte(signals.signalTime, yesterday))
        .orderBy(desc(signals.signalTime));

      console.log(`[DB] Loaded ${recentSignals.length} recent signals`);

      // Load open trades
      const openTradesData = await db
        .select()
        .from(trades)
        .where(eq(trades.status, "open"))
        .orderBy(desc(trades.entryTime));

      console.log(`[DB] Loaded ${openTradesData.length} open trades`);

      this.initialized = true;
      console.log("[DB] BotSignalsManager initialization complete");
    } catch (error) {
      console.error("[DB] Error initializing BotSignalsManager:", error);
      // Continue with empty state if database fails
      this.initialized = true;
    }
  }

  async addPattern(pattern: Omit<BotPattern, 'id'>): Promise<string> {
    await this.initialize();

    try {
      const patternId = `${pattern.symbol}_${pattern.interval}_${pattern.patternType}_${pattern.detectionTime}`;

      await db.insert(patterns).values({
        symbol: pattern.symbol,
        patternType: pattern.patternType,
        interval: pattern.interval,
        detectionTime: new Date(pattern.detectionTime),
        slopeUpper: pattern.upperSlope,
        slopeLower: pattern.lowerSlope,
        status: pattern.status,
        details: pattern.details,
      });

      console.log(`[DB] Pattern saved: ${pattern.symbol} ${pattern.patternType} (${pattern.interval})`);
      return patternId;
    } catch (error) {
      console.error("[DB] Error saving pattern:", error);
      throw error;
    }
  }

  async addSignal(signal: BotSignal): Promise<void> {
    await this.initialize();

    try {
      await db.insert(signals).values({
        symbol: signal.symbol,
        strategy: signal.strategy,
        tradeType: signal.tradeType,
        interval: signal.details?.interval || "1h",
        entryPrice: signal.entryPrice,
        stopLossPrice: signal.stopLossPrice,
        takeProfitPrice: signal.takeProfitPrice,
        positionSize: signal.positionSize,
        riskAmount: signal.riskAmount,
        signalTime: new Date(signal.signalTime),
        confidence: signal.confidence,
        details: signal.details,
      });

      console.log(`[DB] Signal saved: ${signal.symbol} ${signal.strategy} (${signal.tradeType})`);
    } catch (error) {
      console.error("[DB] Error saving signal:", error);
      throw error;
    }
  }

  async getPatterns(): Promise<BotPattern[]> {
    await this.initialize();

    try {
      const patternRecords = await db
        .select()
        .from(patterns)
        .orderBy(desc(patterns.detectionTime))
        .limit(100);

      return patternRecords.map(record => ({
        id: `${record.symbol}_${record.interval}_${record.patternType}_${record.detectionTime.getTime()}`,
        symbol: record.symbol,
        interval: record.interval,
        patternType: record.patternType,
        detectionTime: record.detectionTime.getTime(),
        upperSlope: record.slopeUpper || undefined,
        lowerSlope: record.slopeLower || undefined,
        status: (record.status as "forming" | "confirmed" | "breakout") || "forming",
        details: record.details as any,
      }));
    } catch (error) {
      console.error("[DB] Error loading patterns:", error);
      return [];
    }
  }

  async getPatternsBySymbol(symbol: string): Promise<BotPattern[]> {
    await this.initialize();

    try {
      const patternRecords = await db
        .select()
        .from(patterns)
        .where(eq(patterns.symbol, symbol))
        .orderBy(desc(patterns.detectionTime))
        .limit(50);

      return patternRecords.map(record => ({
        id: `${record.symbol}_${record.interval}_${record.patternType}_${record.detectionTime.getTime()}`,
        symbol: record.symbol,
        interval: record.interval,
        patternType: record.patternType,
        detectionTime: record.detectionTime.getTime(),
        upperSlope: record.slopeUpper || undefined,
        lowerSlope: record.slopeLower || undefined,
        status: (record.status as "forming" | "confirmed" | "breakout") || "forming",
        details: record.details as any,
      }));
    } catch (error) {
      console.error("[DB] Error loading patterns by symbol:", error);
      return [];
    }
  }

  async getSignals(): Promise<BotSignal[]> {
    await this.initialize();

    try {
      const signalRecords = await db
        .select()
        .from(signals)
        .orderBy(desc(signals.signalTime))
        .limit(100);

      return signalRecords.map(record => ({
        id: record.id.toString(),
        symbol: record.symbol,
        strategy: record.strategy,
        tradeType: record.tradeType as "long" | "short",
        entryPrice: record.entryPrice,
        stopLossPrice: record.stopLossPrice,
        takeProfitPrice: record.takeProfitPrice,
        positionSize: record.positionSize || 0,
        riskAmount: record.riskAmount,
        signalTime: record.signalTime.getTime(),
        confidence: record.confidence || undefined,
        details: record.details as any,
      }));
    } catch (error) {
      console.error("[DB] Error loading signals:", error);
      return [];
    }
  }

  async recordMarketScan(scan: BotMarketScan): Promise<void> {
    await this.initialize();

    try {
      await db.insert(marketScans).values({
        timestamp: new Date(scan.timestamp),
        symbols: scan.symbols,
        patterns: scan.patterns,
        signals: scan.signals,
      });

      console.log(`[DB] Market scan recorded at ${new Date(scan.timestamp).toISOString()}`);
    } catch (error) {
      console.error("[DB] Error recording market scan:", error);
      throw error;
    }
  }

  async getLatestScan(): Promise<BotMarketScan | null> {
    await this.initialize();

    try {
      const scanRecord = await db
        .select()
        .from(marketScans)
        .orderBy(desc(marketScans.timestamp))
        .limit(1);

      if (scanRecord.length === 0) return null;

      const record = scanRecord[0];
      return {
        timestamp: record.timestamp.getTime(),
        symbols: record.symbols as any,
        patterns: record.patterns as any,
        signals: record.signals as any,
      };
    } catch (error) {
      console.error("[DB] Error loading latest scan:", error);
      return null;
    }
  }

  async getScans(limit: number = 20): Promise<BotMarketScan[]> {
    await this.initialize();

    try {
      const scanRecords = await db
        .select()
        .from(marketScans)
        .orderBy(desc(marketScans.timestamp))
        .limit(limit);

      return scanRecords.map(record => ({
        timestamp: record.timestamp.getTime(),
        symbols: record.symbols as any,
        patterns: record.patterns as any,
        signals: record.signals as any,
      }));
    } catch (error) {
      console.error("[DB] Error loading scans:", error);
      return [];
    }
  }

  async addOpenTrade(trade: OpenTrade): Promise<void> {
    await this.initialize();

    try {
      await db.insert(trades).values({
        symbol: trade.symbol,
        tradeType: trade.tradeType,
        entryPrice: trade.entryPrice,
        entryTime: new Date(trade.entryTime),
        stopLossPrice: trade.stopLossPrice,
        takeProfitPrice: trade.takeProfitPrice,
        positionSize: trade.positionSize,
        riskAmountUsd: trade.riskAmountUsd,
        status: "open",
        isAggressive: trade.isAggressive,
      });

      console.log(`[DB] Open trade saved: ${trade.symbol} ${trade.positionSize} units`);
    } catch (error) {
      console.error("[DB] Error saving open trade:", error);
      throw error;
    }
  }

  async setOpenTrades(openTrades: OpenTrade[]): Promise<void> {
    await this.initialize();

    try {
      // Get all existing open trades
      const existingTrades = await db
        .select()
        .from(trades)
        .where(eq(trades.status, "open"));

      // Create a map of existing trades by a unique key (symbol + entryTime)
      const existingTradesMap = new Map(
        existingTrades.map(t => [
          `${t.symbol}_${t.entryTime.getTime()}`,
          t
        ])
      );

      // Update or insert each trade
      for (const trade of openTrades) {
        const tradeKey = `${trade.symbol}_${trade.entryTime}`;
        const existingTrade = existingTradesMap.get(tradeKey);

        // Cache the latest trade data (with current price and P&L)
        this.openTradesCache.set(tradeKey, trade);

        if (existingTrade) {
          // Update existing trade with current price and P&L
          await db
            .update(trades)
            .set({
              // Don't update entryPrice, symbol, tradeType, positionSize - they're immutable
              // Just update the calculated/dynamic fields that the bot sends
              stopLossPrice: trade.stopLossPrice,
              takeProfitPrice: trade.takeProfitPrice,
            })
            .where(eq(trades.id, existingTrade.id));
          
          existingTradesMap.delete(tradeKey);
        } else {
          // New trade - insert it
          await this.addOpenTrade(trade);
        }
      }

      // Any remaining trades in the map are no longer active - close them
      const tradesToClose = Array.from(existingTradesMap.values());
      for (const existingTrade of tradesToClose) {
        await db
          .update(trades)
          .set({ status: "closed", exitTime: new Date() })
          .where(eq(trades.id, existingTrade.id));
        
        // Remove from cache
        const tradeKey = `${existingTrade.symbol}_${existingTrade.entryTime.getTime()}`;
        this.openTradesCache.delete(tradeKey);
      }

      console.log(`[DB] Updated open trades: ${openTrades.length} active positions`);
    } catch (error) {
      console.error("[DB] Error setting open trades:", error);
      throw error;
    }
  }

  async getOpenTrades(): Promise<OpenTrade[]> {
    await this.initialize();

    try {
      const tradeRecords = await db
        .select()
        .from(trades)
        .where(eq(trades.status, "open"))
        .orderBy(desc(trades.entryTime));

      return tradeRecords.map(record => {
        const tradeKey = `${record.symbol}_${record.entryTime.getTime()}`;
        const cachedTrade = this.openTradesCache.get(tradeKey);

        if (cachedTrade) {
          // Return cached data with current prices and P&L
          return cachedTrade;
        }

        // Fallback to database values if no cache (shouldn't happen normally)
        return {
          id: record.id.toString(),
          symbol: record.symbol,
          tradeType: (record.tradeType as "long" | "short") || "long",
          entryPrice: record.entryPrice,
          currentPrice: record.entryPrice,
          positionSize: record.positionSize || 0,
          entryTime: record.entryTime.getTime(),
          unrealizedPnlUsd: 0,
          stopLossPrice: record.stopLossPrice,
          takeProfitPrice: record.takeProfitPrice,
          riskAmountUsd: record.riskAmountUsd || 0,
          duration: Math.floor((Date.now() - record.entryTime.getTime()) / 1000),
          isAggressive: record.isAggressive || false,
        };
      });
    } catch (error) {
      console.error("[DB] Error loading open trades:", error);
      return [];
    }
  }

  async getOpenTradesBySymbol(symbol: string): Promise<OpenTrade[]> {
    await this.initialize();

    try {
      const tradeRecords = await db
        .select()
        .from(trades)
        .where(and(eq(trades.status, "open"), eq(trades.symbol, symbol)))
        .orderBy(desc(trades.entryTime));

      return tradeRecords.map(record => {
        const tradeKey = `${record.symbol}_${record.entryTime.getTime()}`;
        const cachedTrade = this.openTradesCache.get(tradeKey);

        if (cachedTrade) {
          // Return cached data with current prices and P&L
          return cachedTrade;
        }

        // Fallback to database values if no cache (shouldn't happen normally)
        return {
          id: record.id.toString(),
          symbol: record.symbol,
          tradeType: (record.tradeType as "long" | "short") || "long",
          entryPrice: record.entryPrice,
          currentPrice: record.entryPrice,
          positionSize: record.positionSize || 0,
          entryTime: record.entryTime.getTime(),
          unrealizedPnlUsd: 0,
          stopLossPrice: record.stopLossPrice,
          takeProfitPrice: record.takeProfitPrice,
          riskAmountUsd: record.riskAmountUsd || 0,
          duration: Math.floor((Date.now() - record.entryTime.getTime()) / 1000),
          isAggressive: record.isAggressive || false,
        };
      });
    } catch (error) {
      console.error("[DB] Error loading open trades by symbol:", error);
      return [];
    }
  }

  async getTradeStats(): Promise<{
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    totalNetPnl: number;
    averagePnl: number;
  }> {
    await this.initialize();

    try {
      const allTrades = await db
        .select()
        .from(trades)
        .where(eq(trades.status, "closed"));

      const totalTrades = allTrades.length;
      const winners = allTrades.filter(t => (t.pnl || 0) > 0).length;
      const losers = totalTrades - winners;
      const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;
      const totalNetPnl = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const averagePnl = totalTrades > 0 ? totalNetPnl / totalTrades : 0;

      return {
        totalTrades,
        winners,
        losers,
        winRate,
        totalNetPnl,
        averagePnl,
      };
    } catch (error) {
      console.error("[DB] Error calculating trade stats:", error);
      return {
        totalTrades: 0,
        winners: 0,
        losers: 0,
        winRate: 0,
        totalNetPnl: 0,
        averagePnl: 0,
      };
    }
  }

  // Legacy methods for backward compatibility (now no-ops or minimal implementations)
  removeSignal(signalId: string): void {
    console.log(`[DB] Signal removal not implemented for database-backed storage: ${signalId}`);
  }

  async getSignalsBySymbol(symbol: string): Promise<BotSignal[]> {
    const signals = await this.getSignals();
    return signals.filter((s) => s.symbol === symbol);
  }

  async addClosedTrade(trade: ClosedTrade): Promise<void> {
    await this.initialize();

    try {
      await db.insert(trades).values({
        symbol: trade.symbol,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        entryTime: new Date(trade.entryTime),
        exitTime: new Date(trade.exitTime),
        positionSize: trade.positionSize,
        exitReason: trade.exitReason,
        grossPnlUsd: trade.grossPnlUsd,
        feesUsd: trade.feesUsd,
        netPnlUsd: trade.netPnlUsd,
        riskAmountUsd: trade.riskAmount,
        status: "closed",
        isWinner: trade.isWinner,
        stopLossPrice: 0, // Will be 0 for closed trades without stop loss info
        takeProfitPrice: 0, // Will be 0 for closed trades without take profit info
      });

      console.log(`[DB] Closed trade saved: ${trade.symbol} ${trade.exitReason} P&L: $${trade.netPnlUsd.toFixed(2)}`);
      
      // Trigger learning engine to re-analyze after new trade data
      learningEngine.initialize().catch(err => {
        console.error("[AI] Failed to update learning engine:", err);
      });
    } catch (error) {
      console.error("[DB] Error saving closed trade:", error);
      throw error;
    }
  }



  async getClosedTrades(limit?: number): Promise<ClosedTrade[]> {
    await this.initialize();

    try {
      const baseQuery = db
        .select()
        .from(trades)
        .where(eq(trades.status, "closed"))
        .orderBy(desc(trades.exitTime));

      const tradeRecords = limit ? await baseQuery.limit(limit) : await baseQuery;

      return tradeRecords.map(record => ({
        id: record.id.toString(),
        symbol: record.symbol,
        entryPrice: record.entryPrice,
        exitPrice: record.exitPrice || 0,
        positionSize: record.positionSize || 0,
        entryTime: record.entryTime.getTime(),
        exitTime: record.exitTime?.getTime() || Date.now(),
        exitReason: (record.exitReason as "TAKE_PROFIT" | "STOP_LOSS" | "MANUAL") || "MANUAL",
        grossPnlUsd: record.grossPnlUsd || 0,
        feesUsd: record.feesUsd || 0,
        netPnlUsd: record.netPnlUsd || 0,
        riskAmount: record.riskAmountUsd || 0,
        isWinner: record.isWinner || false,
      }));
    } catch (error) {
      console.error("[DB] Error loading closed trades:", error);
      return [];
    }
  }

  async getClosedTradesBySymbol(symbol: string): Promise<ClosedTrade[]> {
    await this.initialize();

    try {
      const tradeRecords = await db
        .select()
        .from(trades)
        .where(and(eq(trades.status, "closed"), eq(trades.symbol, symbol)))
        .orderBy(desc(trades.exitTime));

      return tradeRecords.map(record => ({
        id: record.id.toString(),
        symbol: record.symbol,
        entryPrice: record.entryPrice,
        exitPrice: record.exitPrice || 0,
        positionSize: record.positionSize || 0,
        entryTime: record.entryTime.getTime(),
        exitTime: record.exitTime?.getTime() || Date.now(),
        exitReason: (record.exitReason as "TAKE_PROFIT" | "STOP_LOSS" | "MANUAL") || "MANUAL",
        grossPnlUsd: record.grossPnlUsd || 0,
        feesUsd: record.feesUsd || 0,
        netPnlUsd: record.netPnlUsd || 0,
        riskAmount: record.riskAmountUsd || 0,
        isWinner: record.isWinner || false,
      }));
    } catch (error) {
      console.error("[DB] Error loading closed trades by symbol:", error);
      return [];
    }
  }



  clear(): void {
    this.activeSignals.clear();
    this.activePatterns.clear();
  }
}

// Singleton instance
export const botSignalsManager = new BotSignalsManager();
