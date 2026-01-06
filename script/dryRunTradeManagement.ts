// Dry-run harness for trade management logic
// Usage: npx tsx script/dryRunTradeManagement.ts

import { ActiveTrade, TradeSignal } from '../server/dataModels';
import { evaluateTradeExit, getTimeStopMinutes } from '../server/tradeManagement';

function buildTrade(tradeType: 'long' | 'short', interval: '5m' | '15m' | '1h' | '4h'): ActiveTrade {
  const entryPrice = tradeType === 'long' ? 100 : 100;
  const stopLossPrice = tradeType === 'long' ? 95 : 105;
  const takeProfitPrice = tradeType === 'long' ? 110 : 90;

  const signal: TradeSignal = {
    symbol: 'SPOT_TEST_USDT',
    strategy: 'dry-run',
    tradeType,
    interval,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    signalTime: new Date(),
    positionSize: 1,
    riskAmountUsd: 50
  };

  const timeStop = getTimeStopMinutes(interval);

  const trade: ActiveTrade = {
    signal,
    entryTime: new Date(),
    entryOrderId: `TEST_${tradeType}_${Date.now()}`,
    status: 'OPEN',
    realizedPnlUsd: 0,
    movedToBreakeven: false,
    partialTaken: false,
    trailingActive: false,
    highestPrice: entryPrice,
    lowestPrice: entryPrice,
    timeStopMinutes: timeStop
  };

  return trade;
}

async function runScenario(name: string, prices: number[], tradeType: 'long' | 'short', interval: '5m' | '15m' | '1h' | '4h') {
  console.log(`\n=== Scenario: ${name} (${tradeType}, ${interval}) ===`);

  const trade = buildTrade(tradeType, interval);
  let active: ActiveTrade | undefined = trade;
  let closed: ActiveTrade | undefined;

  for (const price of prices) {
    if (!active) {
      break;
    }

    const { trade: updated, closed: isClosed } = evaluateTradeExit(active, price, new Date());
    active = isClosed ? undefined : updated;
    if (isClosed) {
      closed = updated;
    }

    console.log(`Price=${price.toFixed(2)} | SL=${updated.signal.stopLossPrice.toFixed(2)} | TP=${updated.signal.takeProfitPrice.toFixed(2)} | Size=${(updated.signal.positionSize || 0).toFixed(4)} | BE=${updated.movedToBreakeven} | Partial=${updated.partialTaken} | Trail=${updated.trailingActive}`);

    if (isClosed && closed) {
      console.log(`Closed at ${closed.exitPrice?.toFixed(2)} for reason ${closed.exitReason}`);
      break;
    }
  }

  if (closed) {
    console.log('Closed trade summary:', {
      exitPrice: closed.exitPrice,
      exitReason: closed.exitReason,
      pnlUsd: closed.pnlUsd,
      feesUsd: closed.feesUsd,
      realizedPnlUsd: closed.realizedPnlUsd
    });
  }
}

async function main() {
  await runScenario('Long hits partial then trail', [100, 103, 107.5, 111, 109], 'long', '15m');
  await runScenario('Short stops out', [100, 99, 98, 101], 'short', '1h');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
