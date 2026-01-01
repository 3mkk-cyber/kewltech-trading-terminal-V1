// ==============================================================================
// FILE: riskManager.ts (Content)
// ==============================================================================
// Implements Kewltech's risk management principles
// ==============================================================================

import { TradeSignal } from './dataModels';
import { ACCOUNT_EQUITY_USD, RISK_PERCENTAGE_PER_TRADE } from './config';

export class RiskManager {
  private accountEquityUsd: number;
  private riskPercentagePerTrade: number;

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

    const riskPerUnit = signal.tradeType === "long" ? (entryPrice - stopLossPrice) : (stopLossPrice - entryPrice);
    if (riskPerUnit <= 0) {
      console.warn(`Risk per unit not positive for ${signal.symbol}. Entry: ${entryPrice}, SL: ${stopLossPrice}.`);
      return null;
    }

    const maxRiskAmountUsd = this.accountEquityUsd * this.riskPercentagePerTrade;
    // Ensure position_size is not infinity if risk_per_unit is extremely small
    if (riskPerUnit < 1e-9) {
      console.warn(`Risk per unit is too small for ${signal.symbol}. Risk per unit: ${riskPerUnit}`);
      return null;
    }

    const positionSize = maxRiskAmountUsd / riskPerUnit;
    const actualRiskAmountUsd = positionSize * riskPerUnit;

    signal.positionSize = positionSize;
    signal.riskAmountUsd = actualRiskAmountUsd;

    console.log(`Risk calc for ${signal.symbol} (${signal.strategy}): Entry: ${entryPrice.toFixed(4)}, SL: ${stopLossPrice.toFixed(4)}. Risk/Unit: ${riskPerUnit.toFixed(4)}. Pos Size: ${positionSize.toFixed(4)}, Risk Amt: $${actualRiskAmountUsd.toFixed(2)}`);
    return signal;
  }

  updateAccountEquity(newEquityUsd: number): void {
    this.accountEquityUsd = newEquityUsd;
    console.log(`Account equity updated to: $${this.accountEquityUsd.toLocaleString()}`);
  }
}