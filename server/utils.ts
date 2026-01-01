// ==============================================================================
// FILE: utils.ts (Content)
// ==============================================================================
// Helper functions for technical analysis
// ==============================================================================

import { EMA_PERIODS, PIVOT_WINDOW_SIZE } from './config';
import { Kline, PivotPoint } from './dataModels';

export function calculateEMA(data: number[], period: number): number[] | null {
  if (data.length < period || period <= 1) return null;
  const ema: number[] = [data.slice(0, period).reduce((sum, val) => sum + val, 0) / period];
  const multiplier = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    ema.push((data[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier)));
  }
  return ema;
}

export function getPivotPoints(klines: Kline[], pivotWindow: number = PIVOT_WINDOW_SIZE): PivotPoint[] {
  if (!klines || klines.length < 2 * pivotWindow + 1) {
    return [];
  }
  const pivots: PivotPoint[] = [];
  // Assuming klines are sorted chronologically (oldest at 0, newest at -1)
  for (let i = pivotWindow; i < klines.length - pivotWindow; i++) {
    const currentKline = klines[i];
    const currentHigh = currentKline.high;
    const currentLow = currentKline.low;
    const currentTime = currentKline.closeTime;
    let isPivotLow = true;
    let isPivotHigh = true;

    for (let j = i - pivotWindow; j <= i + pivotWindow; j++) {
      if (j === i) continue;
      const neighborKline = klines[j];
      if (neighborKline.high >= currentHigh) isPivotHigh = false;
      if (neighborKline.low <= currentLow) isPivotLow = false;
      if (!isPivotHigh && !isPivotLow) break;
    }

    if (isPivotHigh) pivots.push({ type: 'high', price: currentHigh, index: i, time: currentTime });
    else if (isPivotLow) pivots.push({ type: 'low', price: currentLow, index: i, time: currentTime });
  }
  return pivots;
}

export function fitTrendline(pivotsOfType: PivotPoint[]): [number | null, number | null, number | null] {
  if (pivotsOfType.length < 2) return [null, null, null];
  const xCoords = pivotsOfType.map(p => p.index);
  const yCoords = pivotsOfType.map(p => p.price);

  try {
    // Simple linear regression
    const n = xCoords.length;
    const sumX = xCoords.reduce((sum, x) => sum + x, 0);
    const sumY = yCoords.reduce((sum, y) => sum + y, 0);
    const sumXY = xCoords.reduce((sum, x, i) => sum + x * yCoords[i], 0);
    const sumXX = xCoords.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const yMean = sumY / n;
    const ssRes = yCoords.reduce((sum, y, i) => {
      const predicted = slope * xCoords[i] + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    const ssTot = yCoords.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    return [slope, intercept, rSquared];
  } catch (e) {
    console.error('Error fitting trendline:', e);
    return [null, null, null];
  }
}

export function getCandleDurationMinutes(intervalStr: string): number {
  if (!intervalStr) return 1;
  if (intervalStr.endsWith('m')) return parseInt(intervalStr.slice(0, -1));
  if (intervalStr.endsWith('h')) return parseInt(intervalStr.slice(0, -1)) * 60;
  if (intervalStr.endsWith('d')) return parseInt(intervalStr.slice(0, -1)) * 60 * 24;
  if (intervalStr.endsWith('w')) return parseInt(intervalStr.slice(0, -1)) * 60 * 24 * 7;
  console.warn(`Unknown interval unit in ${intervalStr}. Defaulting to 1 minute.`);
  return 1;
}

export function getEMATrend(klines: Kline[], emaPeriods: number[]): Record<number, string | null> {
  if (!klines) return {};
  const closes = klines.map(k => k.close);
  const emaTrends: Record<number, string | null> = {};
  for (const period of emaPeriods) {
    const emaValues = calculateEMA(closes, period);
    if (emaValues && emaValues.length > 1 && klines.length >= emaValues.length) {
      const currentPrice = closes[closes.length - 1];
      const currentEMA = emaValues[emaValues.length - 1];
      const prevEMA = emaValues[emaValues.length - 2];
      if (currentPrice > currentEMA) {
        emaTrends[period] = currentEMA > prevEMA ? "bullish" : "bullish_weak";
      } else if (currentPrice < currentEMA) {
        emaTrends[period] = currentEMA < prevEMA ? "bearish" : "bearish_weak";
      } else {
        emaTrends[period] = "sideways";
      }
    } else {
      emaTrends[period] = "insufficient_data";
    }
  }
  return emaTrends;
}