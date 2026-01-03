import type { Express } from "express";

import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { KewltechAnalysis, type IndicatorSignal } from "@shared/schema";
import axios from "axios";
import { botSignalsManager } from "./botSignals";
import { learningEngine } from "./learningEngine";
// We will use 'technicalindicators' package. Ensure to install it.
import { MACD, Stochastic, RSI } from "technicalindicators";

// Cache for market data to avoid rate limiting
const dataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute cache

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Define symbols for batch analysis
  const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "DOGEUSDT", "POLUSDT"];

  // BATCH ANALYSIS ENDPOINT - Must come BEFORE :symbol route to be matched first
  app.get("/api/analysis/batch", async (req, res) => {
    try {
      console.log(`[API] Batch analysis requested for symbols: ${SYMBOLS.join(", ")}`);
      
      const analyses = await Promise.all(
        SYMBOLS.map(async (symbol) => {
          try {
            const binanceSymbol = symbol;
            const now = Math.floor(Date.now());
            const from = now - 100 * 3600000; // 100 hours ago

            // Check cache first
            const cached = dataCache.get(binanceSymbol);
            let klines: any[] = [];
            
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              klines = cached.data;
            } else {
              const response = await axios.get("https://api.binance.com/api/v3/klines", {
                params: {
                  symbol: binanceSymbol,
                  interval: "1h",
                  startTime: from,
                  endTime: now,
                  limit: 100,
                },
                timeout: 10000,
              });
              klines = response.data;
              dataCache.set(binanceSymbol, { data: klines, timestamp: Date.now() });
            }

            if (!klines || klines.length === 0) {
              return null;
            }

            const closes = klines.map((k: any[]) => parseFloat(k[4]));
            const highs = klines.map((k: any[]) => parseFloat(k[2]));
            const lows = klines.map((k: any[]) => parseFloat(k[3]));
            const currentPrice = closes[closes.length - 1];

            if (!currentPrice || currentPrice <= 0) {
              return null;
            }

            // Calculate indicators
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
            } catch (err) {
              macdResult = [];
            }
            const lastMacd = macdResult?.length > 0 ? macdResult[macdResult.length - 1] : null;

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
            } catch (err) {
              stochResult = [];
            }
            const lastStoch = stochResult?.length > 0 ? stochResult[stochResult.length - 1] : null;

            const rsiInput = {
              values: closes,
              period: 14,
            };
            let rsiResult: any[] = [];
            try {
              rsiResult = RSI.calculate(rsiInput);
            } catch (err) {
              rsiResult = [];
            }
            const lastRSI = rsiResult?.length > 0 ? rsiResult[rsiResult.length - 1] : 50;

            const recentLows = lows.slice(-20);
            const recentHighs = highs.slice(-20);
            const support = Math.min(...recentLows);
            const resistance = Math.max(...recentHighs);

            let signal: IndicatorSignal = "neutral";
            let trend: "bullish" | "bearish" | "neutral" = "neutral";

            if (lastMacd && lastMacd.MACD > lastMacd.signal && lastRSI < 70) {
              signal = "buy";
              trend = "bullish";
            } else if (lastMacd && lastMacd.MACD < lastMacd.signal && lastRSI > 30) {
              signal = "sell";
              trend = "bearish";
            }

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

            return analysis;
          } catch (err) {
            console.error(`[API] Error analyzing ${symbol}:`, err);
            return null;
          }
        })
      );

      const validAnalyses = analyses.filter(a => a !== null);
      console.log(`[API] Batch analysis complete: ${validAnalyses.length}/${SYMBOLS.length} symbols`);
      
      res.json({
        success: true,
        data: validAnalyses,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      console.error("[API] Batch analysis error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to perform batch analysis",
      });
    }
  });

  // SINGLE SYMBOL ANALYSIS ENDPOINT
  app.get(api.analysis.get.path, async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase(); // e.g., BTCUSDT
      console.log(`[API] Received analysis request for symbol: ${symbol}`);

      // 1. Convert symbol format to Binance format (e.g., BTCUSDT)
      const binanceSymbol = symbol.replace("-USD", "USDT");
      const now = Math.floor(Date.now());
      const from = now - 100 * 3600000; // 100 hours ago

      console.log(`[API] Fetching candlestick data from Binance for symbol: ${binanceSymbol}`);

      let klines: any[] = [];
      try {
        // Check cache first
        const cached = dataCache.get(binanceSymbol);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          console.log(`[API] Using cached data for ${binanceSymbol}`);
          klines = cached.data;
        } else {
          // Fetch 1-hour candlesticks from Binance
          console.log(`[API] Fetching fresh data from Binance for ${binanceSymbol}`);
          const response = await axios.get("https://api.binance.com/api/v3/klines", {
            params: {
              symbol: binanceSymbol,
              interval: "1h",
              startTime: from,
              endTime: now,
              limit: 100,
            },
            timeout: 10000,
          });

          klines = response.data;
          
          // Cache the result
          dataCache.set(binanceSymbol, { data: klines, timestamp: Date.now() });
          
          console.log(`[API] Binance data received:`, {
            symbol: binanceSymbol,
            dataPoints: klines.length,
          });
        }
      } catch (apiError: any) {
        console.error(`[API] Binance API error:`, {
          message: apiError.message,
          symbol: binanceSymbol,
        });
        throw new Error(`Failed to fetch market data from Binance API: ${apiError.message}`);
      }

      if (!klines || klines.length === 0) {
        console.error(`[API] No data received from Binance`);
        throw new Error("No candlestick data available from Binance");
      }

      // 2. Extract OHLCV data from Binance format
      // Binance returns: [open_time, open, high, low, close, volume, ...]
      const closes = klines.map((k: any[]) => parseFloat(k[4]));
      const highs = klines.map((k: any[]) => parseFloat(k[2]));
      const lows = klines.map((k: any[]) => parseFloat(k[3]));
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

  // Bot Signals Endpoints
  app.post("/api/bot/signals", async (req, res) => {
    try {
      const signal = req.body;
      console.log(`[API] Received bot signal for ${signal.symbol}: ${signal.strategy}`);
      await botSignalsManager.addSignal(signal);
      res.json({ success: true, message: "Signal recorded", id: signal.id });
    } catch (error: any) {
      console.error("[API] Error recording bot signal:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/bot/signals", async (req, res) => {
    try {
      const symbol = req.query.symbol as string | undefined;
      const allSignals = symbol
        ? await botSignalsManager.getSignalsBySymbol(symbol.toUpperCase())
        : await botSignalsManager.getSignals();
      
      // Filter to show only high-quality recent signals
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const filteredSignals = allSignals
        .filter(signal => {
          // Only show signals with high confidence (85%+)
          if (signal.confidence && signal.confidence < 85) return false;
          // Only show signals from last 2 hours
          if (signal.signalTime < twoHoursAgo) return false;
          return true;
        })
        .sort((a, b) => b.signalTime - a.signalTime) // Most recent first
        .slice(0, 20); // Limit to 20 best signals
      
      res.json({ success: true, data: filteredSignals });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/bot/patterns", async (req, res) => {
    try {
      const pattern = req.body;
      console.log(`[API] Received bot pattern for ${pattern.symbol}: ${pattern.patternType}`);
      const patternId = await botSignalsManager.addPattern(pattern);
      res.json({ success: true, message: "Pattern recorded", id: patternId });
    } catch (error: any) {
      console.error("[API] Error recording bot pattern:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/bot/patterns", async (req, res) => {
    try {
      const symbol = req.query.symbol as string | undefined;
      const patterns = symbol
        ? await botSignalsManager.getPatternsBySymbol(symbol.toUpperCase())
        : await botSignalsManager.getPatterns();
      res.json({ success: true, data: patterns });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/bot/scan", async (req, res) => {
    try {
      const scan = req.body;
      await botSignalsManager.recordMarketScan(scan);
      res.json({ success: true, message: "Market scan recorded" });
    } catch (error: any) {
      console.error("[API] Error recording market scan:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/bot/scan/latest", async (req, res) => {
    try {
      const scan = await botSignalsManager.getLatestScan();
      res.json({ success: true, data: scan || null });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/bot/scans", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const scans = await botSignalsManager.getScans(limit);
      res.json({ success: true, data: scans });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Trade history endpoint
  app.post("/api/bot/trades", async (req, res) => {
    try {
      const trade = req.body;
      await botSignalsManager.addClosedTrade(trade);
      res.json({ success: true, data: trade });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/bot/trades", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const symbol = req.query.symbol as string | undefined;
      
      let trades;
      if (symbol) {
        trades = await botSignalsManager.getClosedTradesBySymbol(symbol);
      } else {
        trades = await botSignalsManager.getClosedTrades(limit);
      }
      
      const stats = await botSignalsManager.getTradeStats();
      res.json({ success: true, data: trades, stats });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/bot/open-trades", async (req, res) => {
    try {
      // Handle both direct array format and nested format from trading bot
      let trades = req.body;
      if (req.body.openTrades && Array.isArray(req.body.openTrades)) {
        trades = req.body.openTrades;
      }

      // Transform trade data to match frontend expectations
      const transformedTrades = trades.map((trade: any) => ({
        id: trade.id,
        symbol: trade.symbol,
        tradeType: trade.tradeType || "long",
        entryPrice: trade.entryPrice,
        currentPrice: trade.currentPrice,
        positionSize: trade.positionSize,
        entryTime: trade.entryTime,
        unrealizedPnlUsd: trade.unrealizedPnl || trade.unrealizedPnlUsd || 0,
        stopLossPrice: trade.stopLossPrice,
        takeProfitPrice: trade.takeProfitPrice,
        riskAmountUsd: trade.riskAmount || trade.riskAmountUsd || 0,
        duration: trade.durationSeconds || trade.duration || 0,
        isAggressive: trade.isAggressive || true, // Default to true for 5m trades
      }));

      await botSignalsManager.setOpenTrades(transformedTrades);
      res.json({ success: true, data: transformedTrades });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/bot/open-trades", async (req, res) => {
    try {
      const symbol = req.query.symbol as string | undefined;
      
      // First try to get from botSignalsManager (in-memory)
      let trades;
      if (symbol) {
        trades = await botSignalsManager.getOpenTradesBySymbol(symbol);
      } else {
        trades = await botSignalsManager.getOpenTrades();
      }
      
      // If empty, fetch from database
      if (!trades || trades.length === 0) {
        const { db: database } = await import('./db');
        const { trades: tradesTable } = await import('@shared/schema');
        const { eq, and } = await import('drizzle-orm');
        
        const dbTrades = symbol
          ? await database.select().from(tradesTable).where(and(eq(tradesTable.status, 'open'), eq(tradesTable.symbol, symbol)))
          : await database.select().from(tradesTable).where(eq(tradesTable.status, 'open'));
        
        // Transform database trades to OpenTrade format
        trades = dbTrades.map((t: any) => ({
          id: t.id.toString(),
          symbol: t.symbol,
          tradeType: t.tradeType || 'long',
          entryPrice: t.entryPrice,
          currentPrice: t.entryPrice, // We'll need to fetch real-time price separately
          stopLossPrice: t.stopLossPrice,
          takeProfitPrice: t.takeProfitPrice,
          positionSize: t.positionSize || 0,
          riskAmountUsd: t.riskAmountUsd || 0,
          unrealizedPnL: 0, // Calculate based on current price
          unrealizedPnLPercent: 0,
          entryTime: new Date(t.entryTime).getTime(),
          duration: Date.now() - new Date(t.entryTime).getTime(),
          strategy: 'Database Trade',
          interval: t.isAggressive ? '5m' : '15m'
        }));
      }
      
      res.json({ success: true, data: trades });
    } catch (error: any) {
      console.error('[ERROR] Failed to fetch open trades:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Learning engine performance data endpoint
  app.get("/api/learning/performance", async (req, res) => {
    try {
      const learningData = learningEngine.exportLearningData();
      res.json({ 
        success: true, 
        data: learningData,
        summary: learningEngine.getPerformanceSummary()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Trade history endpoint for closed trades
  app.get("/api/bot/trade-history", async (req, res) => {
    try {
      const { db: database } = await import('./db');
      const { trades: tradesTable } = await import('@shared/schema');
      const { eq, desc } = await import('drizzle-orm');
      
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Get closed trades ordered by exit time (most recent first)
      const closedTrades = await database
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.status, 'closed'))
        .orderBy(desc(tradesTable.exitTime))
        .limit(limit);
      
      // Transform to client format
      const formattedTrades = closedTrades.map((t: any) => ({
        id: t.id.toString(),
        symbol: t.symbol,
        tradeType: t.tradeType || 'long',
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        stopLossPrice: t.stopLossPrice,
        takeProfitPrice: t.takeProfitPrice,
        positionSize: t.positionSize || 0,
        riskAmountUsd: t.riskAmountUsd || 0,
        pnlUsd: t.netPnlUsd || t.pnlPercent || 0,
        entryTime: new Date(t.entryTime).getTime(),
        exitTime: t.exitTime ? new Date(t.exitTime).getTime() : null,
        exitReason: t.exitReason,
        duration: t.exitTime ? new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime() : 0,
        strategy: t.strategy || 'Unknown',
        interval: t.isAggressive ? '5m' : '15m',
        isWinner: (t.netPnlUsd || t.pnlPercent || 0) > 0
      }));
      
      res.json({ success: true, data: formattedTrades });
    } catch (error: any) {
      console.error('[ERROR] Failed to fetch trade history:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Trading statistics endpoint for dashboard
  app.get("/api/bot/statistics", async (req, res) => {
    try {
      const { db: database } = await import('./db');
      const { trades: tradesTable } = await import('@shared/schema');
      const { gte, eq, and, sql } = await import('drizzle-orm');
      
      // Get all closed trades
      const allTrades = await database
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.status, 'closed'));

      // Get today's trades
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = new Date(today.getTime());
      
      const todayTrades = await database
        .select()
        .from(tradesTable)
        .where(gte(tradesTable.entryTime, todayTimestamp));

      // Calculate statistics
      const winningTrades = allTrades.filter((t: any) => (t.netPnlUsd || t.pnlPercent || 0) > 0);
      const losingTrades = allTrades.filter((t: any) => (t.netPnlUsd || t.pnlPercent || 0) < 0);
      const totalPnL = allTrades.reduce((sum: number, t: any) => sum + (t.netPnlUsd || t.pnlPercent || 0), 0);
      const todayPnL = todayTrades.reduce((sum: number, t: any) => sum + (t.netPnlUsd || t.pnlPercent || 0), 0);
      
      const avgWin = winningTrades.length > 0 
        ? winningTrades.reduce((sum: number, t: any) => sum + (t.netPnlUsd || t.pnlPercent || 0), 0) / winningTrades.length 
        : 0;
      const avgLoss = losingTrades.length > 0 
        ? losingTrades.reduce((sum: number, t: any) => sum + (t.netPnlUsd || t.pnlPercent || 0), 0) / losingTrades.length 
        : 0;

      const stats = {
        totalTrades: allTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: allTrades.length > 0 ? (winningTrades.length / allTrades.length) * 100 : 0,
        totalPnL: parseFloat(totalPnL.toFixed(2)),
        avgWin: parseFloat(avgWin.toFixed(2)),
        avgLoss: parseFloat(avgLoss.toFixed(2)),
        todayTrades: todayTrades.length,
        todayPnL: parseFloat(todayPnL.toFixed(2))
      };

      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('[ERROR] Failed to fetch statistics:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return httpServer;
}
