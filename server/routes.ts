import type { Express } from "express";

import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { KewltechAnalysis, type IndicatorSignal } from "@shared/schema";
import axios from "axios";
// We will use 'technicalindicators' package. Ensure to install it.
import { MACD, Stochastic, RSI } from "technicalindicators";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.get(api.analysis.get.path, async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase(); // e.g., BTCUSDT

      // 1. Fetch Data from WooFi Pro / Orderly Network Public API
      const baseCurrency = symbol.replace("USDT", "");
      const orderlySymbol = "PERP_" + baseCurrency + "_USDC";
      const now = Math.floor(Date.now() / 1000);
      const from = now - 100 * 3600;

      const response = await axios.get(
        "https://api.orderly.org/v1/tv/kline_history",
        {
          params: {
            symbol: orderlySymbol,
            resolution: "1h",
            from: from.toString(),
            to: now.toString(),
            limit: 100,
          },
        },
      );

      const klineData = response.data;
      if (klineData.s !== "ok" || !klineData.c || klineData.c.length === 0) {
        throw new Error("No kline data available");
      }

      const closes = klineData.c;
      const highs = klineData.h;
      const lows = klineData.l;
      const currentPrice = closes[closes.length - 1];

      // MACD (12, 26, 9)
      const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      };
      const macdResult = MACD.calculate(macdInput);
      const lastMacd = macdResult[macdResult.length - 1];

      // Stochastic (14, 3, 3)
      const stochInput = {
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3,
      };
      const stochResult = Stochastic.calculate(stochInput);
      const lastStoch = stochResult[stochResult.length - 1];

      // RSI (14)
      const rsiInput = {
        values: closes,
        period: 14,
      };
      const rsiResult = RSI.calculate(rsiInput);
      const lastRSI = rsiResult[rsiResult.length - 1];

      // 3. Support/Resistance (simplified: recent lows/highs)
      const recentLows = lows.slice(-20);
      const recentHighs = highs.slice(-20);
      const support = Math.min(...recentLows);
      const resistance = Math.max(...recentHighs);

      // 4. Generate Bot Signal
      let signal = "neutral";
      let trend = "neutral";

      // Simple logic based on MACD and RSI
      if (lastMacd && lastMacd.MACD > lastMacd.signal && lastRSI < 70) {
        signal = "buy";
        trend = "bullish";
      } else if (lastMacd && lastMacd.MACD < lastMacd.signal && lastRSI > 30) {
        signal = "sell";
        trend = "bearish";
      }

      // 5. Store analysis result
      const analysis: KewltechAnalysis = {
        timestamp: Date.now(),
        symbol: symbol,
        price: currentPrice,
        signal: signal,
        trend: trend,
        macd: lastMacd
          ? {
              value: lastMacd.MACD,
              signal: lastMacd.signal as IndicatorSignal,
              histogram: lastMacd.histogram,
            }
          : { value: 0, signal: "neutral" as IndicatorSignal, histogram: 0 },
        stochastic: lastStoch
          ? {
              value: lastStoch.k,
              k: lastStoch.k,
              d: lastStoch.d,
              signal: (lastStoch.k < 20
                ? "buy"
                : lastStoch.k > 80
                  ? "sell"
                  : "neutral") as IndicatorSignal,
            }
          : { value: 50, k: 50, d: 50, signal: "neutral" as IndicatorSignal },
        rsi: lastRSI || 50,
        support: support,
        resistance: resistance,
      };

      // Store in database
      await storage.saveAnalysis(analysis);

      // 6. Success Response
      res.json({
        success: true,
        data: analysis,
        message: "Market analysis completed successfully",
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to perform market analysis",
      });
    }
  });

  // Get analysis history
  app.get(api.analysis.history.path, async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const history = await storage.getAnalysisHistory(symbol);
      res.json(history);
    } catch (error: any) {
      console.error("History error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch history",
      });
    }
  });

  // Get recent analyses
  app.get("/api/analyses", async (req, res) => {
    try {
      const analyses = await storage.getRecentAnalyses(10);
      res.json({ success: true, data: analyses });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return httpServer;
}
