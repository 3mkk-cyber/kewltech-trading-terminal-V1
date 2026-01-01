#!/usr/bin/env python3
"""
Send test paper trading results to the API
"""
import requests
import json
from datetime import datetime

API_URL = "http://localhost:5000/api/bot/trades"

# Test trade 1: Winner (Take Profit)
trade1 = {
    "id": "PAPER_BTC_001",
    "symbol": "BTCUSDT",
    "entryPrice": 87000,
    "exitPrice": 87500,
    "positionSize": 0.2,
    "entryTime": int(datetime.utcnow().timestamp() * 1000),
    "exitTime": int(datetime.utcnow().timestamp() * 1000) + 45000,
    "exitReason": "TAKE_PROFIT",
    "grossPnlUsd": 100,
    "feesUsd": 0.05,
    "netPnlUsd": 99.95,
    "riskAmount": 100,
    "isWinner": True
}

# Test trade 2: Loser (Stop Loss)
trade2 = {
    "id": "PAPER_ETH_001",
    "symbol": "ETHUSDT",
    "entryPrice": 2970,
    "exitPrice": 2950,
    "positionSize": 5,
    "entryTime": int(datetime.utcnow().timestamp() * 1000) + 50000,
    "exitTime": int(datetime.utcnow().timestamp() * 1000) + 95000,
    "exitReason": "STOP_LOSS",
    "grossPnlUsd": -100,
    "feesUsd": 0.05,
    "netPnlUsd": -100.05,
    "riskAmount": 100,
    "isWinner": False
}

trades = [trade1, trade2]

print("Sending test paper trading results to API...\n")

for i, trade in enumerate(trades, 1):
    try:
        response = requests.post(API_URL, json=trade)
        if response.status_code == 200:
            print(f"✓ Trade {i} sent successfully ({trade['symbol']} {trade['exitReason']})")
            print(f"  P&L: ${trade['netPnlUsd']:.2f}")
        else:
            print(f"✗ Trade {i} failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Error sending trade {i}: {e}")

print("\nFetching trades from API...\n")

try:
    response = requests.get(API_URL)
    result = response.json()
    
    if result.get("success"):
        trades = result.get("data", [])
        stats = result.get("stats", {})
        
        print(f"Total Trades: {stats.get('totalTrades', 0)}")
        print(f"Winners: {stats.get('winners', 0)}")
        print(f"Losers: {stats.get('losers', 0)}")
        print(f"Win Rate: {stats.get('winRate', 0):.1f}%")
        print(f"Total P&L: ${stats.get('totalNetPnl', 0):.2f}")
        print(f"Avg P&L: ${stats.get('averagePnl', 0):.2f}")
        
        print(f"\nTrades in History: {len(trades)}")
        for trade in trades:
            print(f"  - {trade['symbol']}: ${trade['netPnlUsd']:.2f} ({trade['exitReason']})")
    else:
        print(f"Error: {result.get('message', 'Unknown error')}")
        
except Exception as e:
    print(f"Error fetching trades: {e}")
