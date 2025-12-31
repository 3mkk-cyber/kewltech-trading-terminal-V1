/**
 * In-memory storage for trading bot signals and pattern detections
 * This allows the bot to communicate its findings to the API and web interface
 */

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

class BotSignalsManager {
  private activeSignals: Map<string, BotSignal> = new Map();
  private activePatterns: Map<string, BotPattern> = new Map();
  private marketScans: BotMarketScan[] = [];
  private maxScans: number = 100; // Keep last 100 scans

  addSignal(signal: BotSignal): void {
    this.activeSignals.set(signal.id, signal);
    console.log(`[BOT] Signal added: ${signal.symbol} ${signal.strategy} (${signal.tradeType})`);
  }

  removeSignal(signalId: string): void {
    this.activeSignals.delete(signalId);
  }

  getSignals(): BotSignal[] {
    return Array.from(this.activeSignals.values()).sort(
      (a, b) => b.signalTime - a.signalTime
    );
  }

  getSignalsBySymbol(symbol: string): BotSignal[] {
    return this.getSignals().filter((s) => s.symbol === symbol);
  }

  addPattern(pattern: BotPattern): void {
    this.activePatterns.set(pattern.id, pattern);
    console.log(`[BOT] Pattern detected: ${pattern.symbol} ${pattern.patternType} (${pattern.interval})`);
  }

  removePattern(patternId: string): void {
    this.activePatterns.delete(patternId);
  }

  getPatterns(): BotPattern[] {
    return Array.from(this.activePatterns.values()).sort(
      (a, b) => b.detectionTime - a.detectionTime
    );
  }

  getPatternsBySymbol(symbol: string): BotPattern[] {
    return this.getPatterns().filter((p) => p.symbol === symbol);
  }

  recordMarketScan(scan: BotMarketScan): void {
    this.marketScans.push(scan);
    if (this.marketScans.length > this.maxScans) {
      this.marketScans.shift();
    }
    console.log(
      `[BOT] Market scan recorded: ${scan.symbols.length} symbols, ${scan.patterns.length} patterns, ${scan.signals.length} signals`
    );
  }

  getLatestScan(): BotMarketScan | undefined {
    return this.marketScans.length > 0
      ? this.marketScans[this.marketScans.length - 1]
      : undefined;
  }

  getScans(limit: number = 20): BotMarketScan[] {
    return this.marketScans.slice(-limit);
  }

  clear(): void {
    this.activeSignals.clear();
    this.activePatterns.clear();
  }
}

// Singleton instance
export const botSignalsManager = new BotSignalsManager();
