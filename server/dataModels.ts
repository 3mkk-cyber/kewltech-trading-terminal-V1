// ==============================================================================
// FILE: dataModels.ts (Content)
// ==============================================================================
// Data structures for trading bot
// ==============================================================================

export interface Kline {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: Date;
  quoteAssetVolume: number;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: number;
  takerBuyQuoteAssetVolume: number;
}

export interface PivotPoint {
  type: 'high' | 'low';
  price: number;
  index: number;
  time: Date;
}

export interface Pattern {
  symbol: string;
  patternType: string;
  interval: string;
  detectionTime: Date;
  upperTrendlineSlope?: number;
  upperTrendlineIntercept?: number;
  lowerTrendlineSlope?: number;
  lowerTrendlineIntercept?: number;
  approxApexIndex?: number;
  upperPivots: PivotPoint[];
  lowerPivots: PivotPoint[];
  orbHigh?: number;
  orbLow?: number;
  orbEndTime?: Date;
  rSquaredUpper?: number;
  rSquaredLower?: number;
}

export interface TradeSignal {
  symbol: string;
  strategy: string;
  tradeType: 'long' | 'short';
  interval: string;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  signalTime: Date;
  patternDetails?: Pattern;
  riskAmountUsd?: number;
  positionSize?: number;
}

export interface ActiveTrade {
  signal: TradeSignal;
  entryTime: Date;
  entryOrderId?: string;
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: Date;
  exitReason?: string;
  pnlUsd?: number;
  feesUsd?: number;
}