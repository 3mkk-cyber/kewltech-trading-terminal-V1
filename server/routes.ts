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
      console.log(`[API] Received analysis request for symbol: ${symbol}`);

      // 1. Fetch Data from Orderly Network Public API
      const baseCurrency = symbol.replace("USDT", "");
      const orderlySymbol = "PERP_" + baseCurrency + "_USDC";
      const now = Math.floor(Date.now() / 1000);
      const from = now - 100 * 3600;

      console.log(`[API] Fetching kline data from Orderly for symbol: ${orderlySymbol}`);

      let response;
      try {
        response = await axios.get(
          "https://api.orderly.org/v1/tv/kline_history",
          {
            params: {
              symbol: orderlySymbol,
              resolution: "1h",
              from: from.toString(),
              to: now.toString(),
              limit: 100,
            },
            timeout: 10000,
          },
        );
        console.log(`[API] Orderly API response received:`, {
          status: response.status,
          dataKeys: Object.keys(response.data),
          dataStatus: response.data.s,
          closesLength: response.data.c?.length,
        });
      } catch (apiError: any) {
        console.error(`[API] Orderly API error:`, {
          message: apiError.message,
          code: apiError.code,
          url: apiError.config?.url,
          params: apiError.config?.params,
        });
        throw new Error(`Failed to fetch market data from Orderly API: ${apiError.message}`);
      }

      const klineData = response.data;
      if (klineData.s !== "ok" || !klineData.c || klineData.c.length === 0) {
        console.error(`[API] Invalid kline data:`, { status: klineData.s, closesLength: klineData.c?.length });
        throw new Error("No kline data available from API");
      }

      const closes = klineData.c;
      const highs = klineData.h;
      const lows = klineData.l;
      const currentPrice = closes[closes.length - 1];

      console.log(`[API] Market data extracted:`, {
        closes: closes.length,
        currentPrice,
        minPrice: Math.min(...closes),
        maxPrice: Math.max(...closes),
      });

      if (!currentPrice || currentPrice <= 0) {
        console.error(`[API] Invalid price: ${currentPrice}`);
        throw new Error("Invalid price data received");
      }

      // MACD (12, 26, 9)
      const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      };
      let macdResult: any[] = [];
      try {
        macdResult = MACD.calculate(macdInput);
        console.log(`[API] MACD calculated:`, { length: macdResult.length, lastValue: macdResult[macdResult.length - 1] });
      } catch (err) {
        console.error("[API] MACD calculation error:", err);
        macdResult = [];
      }
      const lastMacd = macdResult?.length > 0 ? macdResult[macdResult.length - 1] : null;

      // Stochastic (14, 3, 3)
      const stochInput = {
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3,
      };
      let stochResult: any[] = [];
      try {
        stochResult = Stochastic.calculate(stochInput);
        console.log(`[API] Stochastic calculated:`, { length: stochResult.length, lastValue: stochResult[stochResult.length - 1] });
      } catch (err) {
        console.error("[API] Stochastic calculation error:", err);
        stochResult = [];
      }
      const lastStoch = stochResult?.length > 0 ? stochResult[stochResult.length - 1] : null;

      // RSI (14)
      const rsiInput = {
        values: closes,
        period: 14,
      };
      let rsiResult: any[] = [];
      try {
        rsiResult = RSI.calculate(rsiInput);
        console.log(`[API] RSI calculated:`, { length: rsiResult.length, lastValue: rsiResult[rsiResult.length - 1] });
      } catch (err) {
        console.error("[API] RSI calculation error:", err);
        rsiResult = [];
      }
      const lastRSI = rsiResult?.length > 0 ? rsiResult[rsiResult.length - 1] : 50;

      // 3. Support/Resistance (simplified: recent lows/highs)
      const recentLows = lows.slice(-20);
      const recentHighs = highs.slice(-20);
      const support = Math.min(...recentLows);
      const resistance = Math.max(...recentHighs);

      // 4. Generate Bot Signal
      let signal: IndicatorSignal = "neutral";
      let trend: "bullish" | "bearish" | "neutral" = "neutral";

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
        indicators: {
          trend: trend as "bullish" | "bearish" | "neutral",
          macd: lastMacd
            ? {
                value: lastMacd.MACD || 0,
                signal: (lastMacd.MACD > lastMacd.signal ? "buy" : lastMacd.MACD < lastMacd.signal ? "sell" : "neutral") as IndicatorSignal,
                histogram: lastMacd.histogram || 0,
              }
            : { value: 0, signal: "neutral" as IndicatorSignal, histogram: 0 },
          stochastic: lastStoch
            ? {
                value: lastStoch.k || 0,
                k: lastStoch.k || 0,
                d: lastStoch.d || 0,
                signal: (lastStoch.k < 20
                  ? "buy"
                  : lastStoch.k > 80
                    ? "sell"
                    : "neutral") as IndicatorSignal,
              }
            : { value: 50, k: 50, d: 50, signal: "neutral" as IndicatorSignal },
          rsi: {
            value: lastRSI || 50,
            signal: (lastRSI < 30
              ? "buy"
              : lastRSI > 70
                ? "sell"
                : "neutral") as IndicatorSignal,
          },
        },
        levels: {
          support: [support],
          resistance: [resistance],
        },
        summary: `Market analysis for ${symbol}: ${trend} trend detected with ${signal} signal. Price: $${currentPrice}`,
      };

      // Store in database
      try {
        await storage.saveAnalysis(analysis);
        console.log(`[API] Analysis saved to database for ${symbol}`);
      } catch (dbError) {
        console.error(`[API] Database save error:`, dbError);
        // Don't fail the request if we can't save to database
      }

      console.log(`[API] Returning analysis for ${symbol}:`, {
        trend: analysis.indicators.trend,
        price: analysis.price,
        timestamp: analysis.timestamp,
      });

      // 6. Success Response - Return analysis directly
      res.json(analysis);
    } catch (error: any) {
      console.error("[API] Analysis error:", error);
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
      console.log(`[API] Fetching history for symbol: ${symbol}`);
      
      try {
        const history = await storage.getAnalysisHistory(symbol);
        console.log(`[API] Retrieved ${history.length} records from database`);
        
        // Extract the analysis data from storage records
        const analysisData = history.map((record) => record.data);
        console.log(`[API] Returning ${analysisData.length} analysis records`);
        
        res.json(analysisData);
      } catch (dbError: any) {
        console.log(`[API] Database unavailable, returning empty history:`, dbError.message);
        // Return empty array if database is unavailable
        // This allows the frontend to show charts with just the live data
        res.json([]);
      }
    } catch (error: any) {
      console.error("[API] History error:", error);
      // Return empty array instead of error
      res.json([]);
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
