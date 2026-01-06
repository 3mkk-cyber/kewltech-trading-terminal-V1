import { ActiveTrade } from './dataModels';
import {
  BE_R_MULTIPLIER,
  PARTIAL_R_MULTIPLIER,
  PARTIAL_CLOSE_RATIO,
  TRAIL_START_R_MULTIPLIER,
  TRAIL_OFFSET_R,
  FAST_TIME_STOP_MINUTES,
  SWING_TIME_STOP_MINUTES
} from './config';

export interface TradeExitResult {
  trade: ActiveTrade;
  closed: boolean;
}

export function getTimeStopMinutes(interval?: string): number {
  if (interval === '5m' || interval === '15m') {
    return FAST_TIME_STOP_MINUTES;
  }
  return SWING_TIME_STOP_MINUTES;
}

export function evaluateTradeExit(trade: ActiveTrade, currentPrice: number, now: Date = new Date()): TradeExitResult {
  const updated: ActiveTrade = {
    ...trade,
    signal: { ...trade.signal }
  };

  const entryPrice = updated.signal.entryPrice;
  const takeProfit = updated.signal.takeProfitPrice;
  let stopLoss = updated.signal.stopLossPrice;

  // Track extremes for trailing stop logic
  if (updated.signal.tradeType === 'long') {
    updated.highestPrice = Math.max(updated.highestPrice ?? entryPrice, currentPrice);
  } else {
    updated.lowestPrice = Math.min(updated.lowestPrice ?? entryPrice, currentPrice);
  }

  const baselineRisk = updated.riskPerUnitBaseline || Math.abs(entryPrice - stopLoss);
  if (!updated.riskPerUnitBaseline) {
    updated.riskPerUnitBaseline = baselineRisk;
  }

  if (baselineRisk <= 0) {
    return { trade: updated, closed: false };
  }

  const rMultiple = updated.signal.tradeType === 'long'
    ? (currentPrice - entryPrice) / baselineRisk
    : (entryPrice - currentPrice) / baselineRisk;

  // Breakeven move
  if (!updated.movedToBreakeven && rMultiple >= BE_R_MULTIPLIER) {
    updated.signal.stopLossPrice = entryPrice;
    updated.movedToBreakeven = true;
    stopLoss = updated.signal.stopLossPrice;
  }

  // Partial profit
  if (!updated.partialTaken && rMultiple >= PARTIAL_R_MULTIPLIER) {
    const closeRatio = Math.min(Math.max(PARTIAL_CLOSE_RATIO, 0.1), 0.9);
    const currentSize = updated.signal.positionSize || 0;
    const sizeToClose = currentSize * closeRatio;
    const remainingSize = currentSize - sizeToClose;

    if (sizeToClose > 0) {
      const realized = updated.signal.tradeType === 'long'
        ? (currentPrice - entryPrice) * sizeToClose
        : (entryPrice - currentPrice) * sizeToClose;
      updated.realizedPnlUsd = (updated.realizedPnlUsd || 0) + realized;
      updated.signal.positionSize = remainingSize;
      updated.partialTaken = true;
      updated.signal.stopLossPrice = Math.max(updated.signal.stopLossPrice, entryPrice);
      stopLoss = updated.signal.stopLossPrice;
    }
  }

  // Trailing stop activation
  if (rMultiple >= TRAIL_START_R_MULTIPLIER) {
    updated.trailingActive = true;
  }

  if (updated.trailingActive) {
    const trailDistance = TRAIL_OFFSET_R * baselineRisk;
    if (updated.signal.tradeType === 'long') {
      const candidate = currentPrice - trailDistance;
      const newStop = Math.max(updated.signal.stopLossPrice, candidate, entryPrice);
      if (newStop > updated.signal.stopLossPrice) {
        updated.signal.stopLossPrice = newStop;
      }
    } else {
      const candidate = currentPrice + trailDistance;
      const newStop = Math.min(updated.signal.stopLossPrice, candidate, entryPrice);
      if (newStop < updated.signal.stopLossPrice) {
        updated.signal.stopLossPrice = newStop;
      }
    }
    stopLoss = updated.signal.stopLossPrice;
  }

  // Time-stop exit
  const timeStopMinutes = updated.timeStopMinutes;
  if (timeStopMinutes) {
    const timeInMinutes = (now.getTime() - updated.entryTime.getTime()) / (1000 * 60);
    if (timeInMinutes >= timeStopMinutes) {
      updated.exitReason = 'TIME_STOP';
      updated.exitPrice = currentPrice;
    }
  }

  // Hard exits: TP / SL / Trailing
  if (!updated.exitReason) {
    if (updated.signal.tradeType === 'long') {
      if (currentPrice >= takeProfit) {
        updated.exitReason = 'TAKE_PROFIT';
        updated.exitPrice = takeProfit;
      } else if (currentPrice <= stopLoss) {
        updated.exitReason = updated.trailingActive ? 'TRAIL_STOP' : 'STOP_LOSS';
        updated.exitPrice = stopLoss;
      }
    } else {
      if (currentPrice <= takeProfit) {
        updated.exitReason = 'TAKE_PROFIT';
        updated.exitPrice = takeProfit;
      } else if (currentPrice >= stopLoss) {
        updated.exitReason = updated.trailingActive ? 'TRAIL_STOP' : 'STOP_LOSS';
        updated.exitPrice = stopLoss;
      }
    }
  }

  if (updated.exitReason && updated.exitPrice !== undefined) {
    updated.exitTime = now;
    updated.status = 'CLOSED';

    const remainingSize = updated.signal.positionSize || 0;
    const openPnl = updated.signal.tradeType === 'long'
      ? (updated.exitPrice - entryPrice) * remainingSize
      : (entryPrice - updated.exitPrice) * remainingSize;
    const totalPnl = (updated.realizedPnlUsd || 0) + openPnl;
    updated.pnlUsd = totalPnl;
    updated.feesUsd = Math.abs(totalPnl) * 0.0005;

    return { trade: updated, closed: true };
  }

  return { trade: updated, closed: false };
}
