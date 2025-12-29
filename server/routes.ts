
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
  app: Express
): Promise<Server> {

  app.get(api.analysis.get.path, async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase(); // e.g., BTCUSDT
      
      // 1. Fetch Data from Binance Public API (No key needed for public data)
      // Fetch 100 candles of 1h interval
      const response = await axios.get(`https://api.binance.com/api/v3/klines`, {
        params: {
          symbol: symbol === 'BTC-USDT' ? 'BTCUSDT' : symbol, // normalize common format
          interval: '1h',
          limit: 100
        }
      });

      const data = response.data;
      // Binance format: [open_time, open, high, low, close, volume, ...]
      const closes = data.map((d: any) => parseFloat(d[4]));
      const highs = data.map((d: any) => parseFloat(d[2]));
      const lows = data.map((d: any) => parseFloat(d[3]));
      const currentPrice = closes[closes.length - 1];

      // 2. Calculate Indicators (Kewltech Modules)
      
      // MACD (12, 26, 9)
      const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      };
      const macdResult = MACD.calculate(macdInput);
      const lastMacd = macdResult[macdResult.length - 1];
      
      // Stochastic (14, 3, 3)
      const stochInput = {
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
      };
      const stochResult = Stochastic.calculate(stochInput);
      const lastStoch = stochResult[stochResult.length - 1];

      // RSI (14) - Supplementary
      const rsiInput = {
        values: closes,
        period: 14
      };
      const rsiResult = RSI.calculate(rsiInput);
      const lastRsi = rsiResult[rsiResult.length - 1];

      // 3. Logic & Signals
      let macdSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
      if (lastMacd.MACD > lastMacd.signal && lastMacd.histogram > 0) macdSignal = 'buy';
      else if (lastMacd.MACD < lastMacd.signal && lastMacd.histogram < 0) macdSignal = 'sell';

      let stochSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
      if (lastStoch.k < 20 && lastStoch.d < 20 && lastStoch.k > lastStoch.d) stochSignal = 'buy'; // Oversold cross up
      else if (lastStoch.k > 80 && lastStoch.d > 80 && lastStoch.k < lastStoch.d) stochSignal = 'sell'; // Overbought cross down

      // Support/Resistance (Simple local min/max of last 50 candles)
      const recentLows = lows.slice(-50);
      const recentHighs = highs.slice(-50);
      const support = Math.min(...recentLows);
      const resistance = Math.max(...recentHighs);

      // Overall Trend
      const trend = lastRsi > 50 ? (macdSignal === 'buy' ? 'bullish' : 'neutral') : (macdSignal === 'sell' ? 'bearish' : 'neutral');

      const analysis: KewltechAnalysis = {
        timestamp: Date.now(),
        symbol: symbol,
        price: currentPrice,
        indicators: {
          macd: {
            value: lastMacd.MACD,
            signal: macdSignal,
            histogram: lastMacd.histogram
          },
          stochastic: {
            value: lastStoch.k,
            k: lastStoch.k,
            d: lastStoch.d,
            signal: stochSignal
          },
          rsi: {
            value: lastRsi,
            signal: lastRsi > 70 ? 'sell' : (lastRsi < 30 ? 'buy' : 'neutral')
          },
          trend: trend
        },
        levels: {
          support: [support],
          resistance: [resistance]
        },
        summary: `Market is ${trend}. MACD is ${macdSignal}. Stochastic is ${stochSignal}.`
      };

      // 4. Log to DB (Fire and forget)
      storage.logAnalysis(symbol, currentPrice, analysis).catch(err => console.error("Failed to log analysis:", err));

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
