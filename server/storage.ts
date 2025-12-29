import { db } from "./db";
import {
  analysisLogs,
  type AnalysisLog,
  type KewltechAnalysis,
} from "@shared/schema";
import { desc, eq } from "drizzle-orm";

export interface IStorage {
  logAnalysis(
    symbol: string,
    price: number,
    data: KewltechAnalysis,
  ): Promise<AnalysisLog>;
  getAnalysisHistory(symbol: string): Promise<AnalysisLog[]>;
  saveAnalysis(analysis: KewltechAnalysis): Promise<void>;
  getRecentAnalyses(limit: number): Promise<AnalysisLog[]>;
}

export class DatabaseStorage implements IStorage {
  async logAnalysis(
    symbol: string,
    price: number,
    data: KewltechAnalysis,
  ): Promise<AnalysisLog> {
    const [log] = await db
      .insert(analysisLogs)
      .values({
        price: price.toString(),
        data: data,
      })
      .returning();
    return log;
  }

  async saveAnalysis(analysis: KewltechAnalysis): Promise<void> {
    return await this.logAnalysis(analysis.symbol, analysis.price, analysis);
  }

  async getRecentAnalyses(limit: number): Promise<AnalysisLog[]> {
    return await db
      .select()
      .from(analysisLogs)
      .orderBy(desc(analysisLogs.timestamp))
      .limit(limit);
  }

  async getAnalysisHistory(symbol: string): Promise<AnalysisLog[]> {
    // In a real app we'd filter by symbol, but schema assumes single symbol logs for MVP simplicity or stores symbol in JSON
    return await db
      .select()
      .from(analysisLogs)
      .orderBy(desc(analysisLogs.timestamp))
      .limit(50);
  }
}

export const storage = new DatabaseStorage();
