
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const analysisLogs = pgTable("analysis_logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow(),
  price: text("price").notNull(), // Store as text to avoid precision issues
  data: jsonb("data").notNull(), // Store full analysis JSON
});

export const insertAnalysisLogSchema = createInsertSchema(analysisLogs).omit({ id: true, timestamp: true });

// Trading Bot Data Tables
export const patterns = pgTable("patterns", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  patternType: varchar("pattern_type", { length: 50 }).notNull(),
  interval: varchar("interval", { length: 10 }).notNull(),
  detectionTime: timestamp("detection_time").notNull(),
  slopeUpper: real("slope_upper"),
  slopeLower: real("slope_lower"),
  rSquaredUpper: real("r_squared_upper"),
  rSquaredLower: real("r_squared_lower"),
  pivotCount: integer("pivot_count"),
  status: varchar("status", { length: 20 }).default("forming"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  tradeType: varchar("trade_type", { length: 10 }).notNull(),
  interval: varchar("interval", { length: 10 }).notNull(),
  entryPrice: real("entry_price").notNull(),
  stopLossPrice: real("stop_loss_price").notNull(),
  takeProfitPrice: real("take_profit_price").notNull(),
  positionSize: real("position_size"),
  riskAmount: real("risk_amount").notNull(),
  signalTime: timestamp("signal_time").notNull(),
  confidence: integer("confidence"),
  patternId: integer("pattern_id").references(() => patterns.id),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id").references(() => signals.id),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  tradeType: varchar("trade_type", { length: 10 }),
  entryPrice: real("entry_price").notNull(),
  entryTime: timestamp("entry_time").notNull(),
  stopLossPrice: real("stop_loss_price").notNull(),
  takeProfitPrice: real("take_profit_price").notNull(),
  positionSize: real("position_size"),
  riskAmountUsd: real("risk_amount_usd"),
  exitPrice: real("exit_price"),
  exitTime: timestamp("exit_time"),
  exitReason: varchar("exit_reason", { length: 20 }),
  status: varchar("status", { length: 20 }),
  pnl: real("pnl"),
  pnlPercent: real("pnl_percent"),
  grossPnlUsd: real("gross_pnl_usd"),
  feesUsd: real("fees_usd"),
  netPnlUsd: real("net_pnl_usd"),
  isWinner: boolean("is_winner"),
  isAggressive: boolean("is_aggressive").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketScans = pgTable("market_scans", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull(),
  symbols: jsonb("symbols").notNull(),
  patterns: jsonb("patterns").notNull(),
  signals: jsonb("signals").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emaTrends = pgTable("ema_trends", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  interval: varchar("interval", { length: 10 }).notNull(),
  ema13: varchar("ema_13", { length: 20 }),
  ema34: varchar("ema_34", { length: 20 }),
  ema244: varchar("ema_244", { length: 20 }),
  ema610: varchar("ema_610", { length: 20 }),
  recordedAt: timestamp("recorded_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orbData = pgTable("orb_data", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  orbHigh: real("orb_high").notNull(),
  orbLow: real("orb_low").notNull(),
  orbEndTime: timestamp("orb_end_time").notNull(),
  breakoutPrice: real("breakout_price"),
  breakoutType: varchar("breakout_type", { length: 10 }),
  breakoutTime: timestamp("breakout_time"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Learning Engine Tables
export const strategyPerformance = pgTable("strategy_performance", {
  id: serial("id").primaryKey(),
  strategy: varchar("strategy", { length: 50 }).notNull().unique(),
  totalTrades: integer("total_trades").notNull().default(0),
  winners: integer("winners").notNull().default(0),
  losers: integer("losers").notNull().default(0),
  winRate: real("win_rate").notNull().default(0),
  avgPnl: real("avg_pnl").notNull().default(0),
  totalPnl: real("total_pnl").notNull().default(0),
  avgDuration: real("avg_duration").notNull().default(0),
  confidenceScore: real("confidence_score").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const symbolPerformance = pgTable("symbol_performance", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull().unique(),
  totalTrades: integer("total_trades").notNull().default(0),
  winRate: real("win_rate").notNull().default(0),
  avgPnl: real("avg_pnl").notNull().default(0),
  bestStrategy: varchar("best_strategy", { length: 50 }),
  volatilityScore: real("volatility_score").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const patternQuality = pgTable("pattern_quality", {
  id: serial("id").primaryKey(),
  patternType: varchar("pattern_type", { length: 50 }).notNull(),
  interval: varchar("interval", { length: 10 }).notNull(),
  successRate: real("success_rate").notNull().default(0),
  avgPnl: real("avg_pnl").notNull().default(0),
  sampleSize: integer("sample_size").notNull().default(0),
  reliability: real("reliability").notNull().default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertPatternSchema = createInsertSchema(patterns).omit({ id: true, createdAt: true });
export const insertSignalSchema = createInsertSchema(signals).omit({ id: true, createdAt: true });
export const insertTradeSchema = createInsertSchema(trades).omit({ id: true, createdAt: true });
export const insertMarketScanSchema = createInsertSchema(marketScans).omit({ id: true, createdAt: true });
export const insertEmaTrendSchema = createInsertSchema(emaTrends).omit({ id: true, createdAt: true });
export const insertOrbDataSchema = createInsertSchema(orbData).omit({ id: true, createdAt: true });
export const insertStrategyPerformanceSchema = createInsertSchema(strategyPerformance).omit({ id: true, createdAt: true, lastUpdated: true });
export const insertSymbolPerformanceSchema = createInsertSchema(symbolPerformance).omit({ id: true, createdAt: true, lastUpdated: true });
export const insertPatternQualitySchema = createInsertSchema(patternQuality).omit({ id: true, createdAt: true, lastUpdated: true });

export type IndicatorSignal = 'buy' | 'sell' | 'neutral';

export interface IndicatorValue {
  value: number;
  signal: IndicatorSignal;
  histogram?: number; // For MACD
  k?: number; // For Stoch
  d?: number; // For Stoch
}

export interface KewltechAnalysis {
  timestamp: number;
  symbol: string;
  price: number;
  indicators: {
    macd: IndicatorValue;
    stochastic: IndicatorValue;
    rsi: IndicatorValue; // Added RSI as a common complement
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  levels: {
    support: number[];
    resistance: number[];
  };
  summary: string;
}

export type AnalysisLog = typeof analysisLogs.$inferSelect;
