// ==============================================================================
// FILE: riskManager.ts (Content)
// ==============================================================================
// Implements DepthSignals's risk management principles with adaptive learning
// ==============================================================================

import { TradeSignal } from './dataModels';
import { ACCOUNT_EQUITY_USD, RISK_PERCENTAGE_PER_TRADE } from './config';

interface TradePerformance {
  symbol: string;
  interval: string;
  strategy: string;
  pnl: number;
  timestamp: Date;
}

export class RiskManager {
  private accountEquityUsd: number;
  private riskPercentagePerTrade: number;
  private tradeHistory: TradePerformance[] = [];
  private strategyPerformance: Map<string, { wins: number; losses: number; totalPnL: number }> = new Map();

  constructor(accountEquityUsd: number = ACCOUNT_EQUITY_USD, riskPercentagePerTrade: number = RISK_PERCENTAGE_PER_TRADE) {
    this.accountEquityUsd = accountEquityUsd;
    this.riskPercentagePerTrade = riskPercentagePerTrade;
    console.log(`RiskManager initialized. Equity: $${this.accountEquityUsd.toLocaleString()}, Risk per Trade: ${(this.riskPercentagePerTrade * 100).toFixed(2)}%`);
  }

  calculateTradeParameters(signal: TradeSignal): TradeSignal | null {
    if (!signal || !signal.entryPrice || !signal.stopLossPrice) {
      console.error("Invalid signal for risk calculation.");
      return null;
    }

    const entryPrice = signal.entryPrice;
    const stopLossPrice = signal.stopLossPrice;

    if (entryPrice === stopLossPrice) {
      console.warn(`Entry price equals SL for ${signal.symbol}.`);
      return null;
    }

    // Adaptive risk sizing based on strategy performance
    let adjustedRiskPercentage = this.riskPercentagePerTrade;
    const strategyKey = `${signal.symbol}_${signal.interval}_${signal.strategy}`;

    if (this.strategyPerformance.has(strategyKey)) {
      const perf = this.strategyPerformance.get(strategyKey)!;
      const winRate = perf.wins / (perf.wins + perf.losses);

      // Reduce risk for poorly performing strategies
      if (winRate < 0.4) {
        adjustedRiskPercentage *= 0.5; // Half risk for strategies with <40% win rate
      } else if (winRate > 0.7) {
        adjustedRiskPercentage *= 1.2; // Increase risk slightly for well-performing strategies
      }

      // Reduce risk if recent losses
      const recentTrades = this.tradeHistory.filter(t =>
        t.symbol === signal.symbol &&
        t.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      );

      const recentLosses = recentTrades.filter(t => t.pnl < 0).length;
      if (recentLosses >= 2) {
        adjustedRiskPercentage *= 0.7; // Reduce risk after 2+ losses in 24h
      }
    }

    // Special handling for 5-minute trades - more conservative
    if (signal.interval === "5m") {
      adjustedRiskPercentage *= 0.6; // 60% of normal risk for 5m trades
    }

    const maxRiskAmountUsd = this.accountEquityUsd * adjustedRiskPercentage;
    const riskPerUnit = signal.tradeType === "long" ? (entryPrice - stopLossPrice) : (stopLossPrice - entryPrice);

    if (riskPerUnit <= 0) {
      console.warn(`Risk per unit not positive for ${signal.symbol}. Entry: ${entryPrice}, SL: ${stopLossPrice}.`);
      return null;
    }

    // Ensure position_size is not infinity if risk_per_unit is extremely small
    if (riskPerUnit < 1e-9) {
      console.warn(`Risk per unit is too small for ${signal.symbol}. Risk per unit: ${riskPerUnit}`);
      return null;
    }

    const positionSize = maxRiskAmountUsd / riskPerUnit;
    const actualRiskAmountUsd = positionSize * riskPerUnit;

    signal.positionSize = positionSize;
    signal.riskAmountUsd = actualRiskAmountUsd;

    console.log(`Risk calc for ${signal.symbol} (${signal.strategy}): Entry: ${entryPrice.toFixed(4)}, SL: ${stopLossPrice.toFixed(4)}. Risk/Unit: ${riskPerUnit.toFixed(4)}. Pos Size: ${positionSize.toFixed(4)}, Risk Amt: $${actualRiskAmountUsd.toFixed(2)} (adjusted risk: ${(adjustedRiskPercentage * 100).toFixed(2)}%)`);
    return signal;
  }

  recordTradePerformance(symbol: string, interval: string, strategy: string, pnl: number): void {
    const performance: TradePerformance = {
      symbol,
      interval,
      strategy,
      pnl,
      timestamp: new Date()
    };

    this.tradeHistory.push(performance);

    // Keep only last 100 trades for memory efficiency
    if (this.tradeHistory.length > 100) {
      this.tradeHistory = this.tradeHistory.slice(-100);
    }

    // Update strategy performance
    const strategyKey = `${symbol}_${interval}_${strategy}`;
    if (!this.strategyPerformance.has(strategyKey)) {
      this.strategyPerformance.set(strategyKey, { wins: 0, losses: 0, totalPnL: 0 });
    }

    const perf = this.strategyPerformance.get(strategyKey)!;
    if (pnl > 0) {
      perf.wins++;
    } else {
      perf.losses++;
    }
    perf.totalPnL += pnl;

    console.log(`[LEARNING] Recorded ${strategyKey}: ${pnl > 0 ? 'WIN' : 'LOSS'} $${pnl.toFixed(2)}, Win Rate: ${(perf.wins / (perf.wins + perf.losses) * 100).toFixed(1)}%`);
  }

  getStrategyStats(strategyKey: string): { wins: number; losses: number; winRate: number; totalPnL: number } | null {
    const perf = this.strategyPerformance.get(strategyKey);
    if (!perf) return null;

    const total = perf.wins + perf.losses;
    return {
      wins: perf.wins,
      losses: perf.losses,
      winRate: total > 0 ? perf.wins / total : 0,
      totalPnL: perf.totalPnL
    };
  }

  updateAccountEquity(newEquityUsd: number): void {
    this.accountEquityUsd = newEquityUsd;
    console.log(`Account equity updated to: $${this.accountEquityUsd.toLocaleString()}`);
  }
}