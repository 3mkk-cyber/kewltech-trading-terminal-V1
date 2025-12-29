import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { KewltechAnalysis } from "@shared/schema";
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

      // 1. Fetch Data from WooFi Pro / Orderly Network Public API (No key needed for public data)
      // Convert symbol format: BTCUSDT -> PERP_BTC_USDC
      // Convert symbol format: BTCUSDT -> PERP_BTC_USDC
      // Extract base currency (e.g., BTC from BTCUSDT)
      const baseCurrency = symbol.replace("USDT", "");
      const orderlySymbol = "PERP_" + baseCurrency + "_USDC";
      const now = Math.floor(Date.now() / 1000);
      const from = now - 100 * 3600; // 100 hours ago for 1h candles

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

      // Orderly returns data as: {s: "ok", o: [], c: [], h: [], l: [], v: [], a: [], t: []}
      const klineData = response.data;
      if (klineData.s !== "ok" || !klineData.c || klineData.c.length === 0) {
        throw new Error("No kline data available");
      }

      const closes = klineData.c;
      const highs = klineData.h;
      const lows = klineData.l;
      const currentPrice = closes[closes.length - 1];
      // 2. Calculate Indicators (Kewltech Modules)

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

      // RSI (14) - Supplementary
      const rsiInput = {
        values: closes,
        period: 14,
      };
      const rsiResult = RSI.calculate(rsiInput);
      const lastRsi = rsiResult[rsiResult.length - 1];

      // 3. Logic & Signals
      let macdSignal: "buy" | "sell" | "neutral" = "neutral";
      if (lastMacd.MACD > lastMacd.signal && lastMacd.histogram > 0)
        macdSignal = "buy";
      else if (lastMacd.MACD < lastMacd.signal && lastMacd.histogram < 0)
        macdSignal = "sell";

      let stochSignal: "buy" | "sell" | "neutral" = "neutral";
      if (lastStoch.k < 20 && lastStoch.d < 20 && lastStoch.k > lastStoch.d)
        stochSignal = "buy"; // Oversold cross up
      else if (
        lastStoch.k > 80 &&
        lastStoch.d > 80 &&
        lastStoch.k < lastStoch.d
      )
        stochSignal = "sell"; // Overbought cross down

      // Support/Resistance (Simple local min/max of last 50 candles)
      const recentLows = lows.slice(-50);
      const recentHighs = highs.slice(-50);
      const support = Math.min(...recentLows);
      const resistance = Math.max(...recentHighs);

      // Overall Trend
      const trend =
        lastRsi > 50
          ? macdSignal === "buy"
            ? "bullish"
            : "neutral"
          : macdSignal === "sell"
            ? "bearish"
            : "neutral";

      const analysis: KewltechAnalysis = {
        timestamp: Date.now(),
        symbol: symbol,
        price: currentPrice,
        indicators: {
          macd: {
            value: lastMacd.MACD,
            signal: macdSignal,
            histogram: lastMacd.histogram,
          },
          stochastic: {
            value: lastStoch.k,
            k: lastStoch.k,
            d: lastStoch.d,
            signal: stochSignal,
          },
          rsi: {
            value: lastRsi,
            signal: lastRsi > 70 ? "sell" : lastRsi < 30 ? "buy" : "neutral",
          },
          trend: trend,
        },
        levels: {
          support: [support],
          resistance: [resistance],
        },
        summary: `Market is ${trend}. MACD is ${macdSignal}. Stochastic is ${stochSignal}.`,
      };

      // 4. Log to DB (Fire and forget)
      storage
        .logAnalysis(symbol, currentPrice, analysis)
        .catch((err) => console.error("Failed to log analysis:", err));

      res.json(analysis);
    } catch (error) {
      console.error("Analysis Error:", error);
      res.status(500).json({ message: "Failed to perform market analysis" });
    }
  });

  app.get(api.analysis.history.path, async (req, res) => {
    try {
      const history = await storage.getAnalysisHistory(req.params.symbol);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  return httpServer;
}
