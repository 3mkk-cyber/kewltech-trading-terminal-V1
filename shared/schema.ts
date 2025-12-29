
import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const analysisLogs = pgTable("analysis_logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow(),
  price: text("price").notNull(), // Store as text to avoid precision issues
  data: jsonb("data").notNull(), // Store full analysis JSON
});

export const insertAnalysisLogSchema = createInsertSchema(analysisLogs).omit({ id: true, timestamp: true });

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
