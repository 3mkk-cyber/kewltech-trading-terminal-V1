#!/usr/bin/env python3
"""
Test script to demonstrate paper trading module functionality
"""
import logging
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import from trading bot
from trading_bot import (
    TradeSignal, 
    ActiveTrade, 
    RiskManager,
    ACCOUNT_EQUITY_USD,
    RISK_PERCENTAGE_PER_TRADE
)

def test_paper_trading():
    """Test paper trading simulation"""
    
    logger.info("\n" + "="*80)
    logger.info("KEWLTECH TRADING BOT - PAPER TRADING TEST")
    logger.info("="*80)
    
    # Initialize risk manager
    risk_manager = RiskManager(ACCOUNT_EQUITY_USD, RISK_PERCENTAGE_PER_TRADE)
    
    # Create test trade signals
    test_signals = [
        TradeSignal(
            symbol="SPOT_BTC_USDT",
            strategy="WEDGE_BREAKOUT",
            trade_type="long",
            interval="1h",
            entry_price=87000.00,
            stop_loss_price=86500.00,
            take_profit_price=87500.00,
            signal_time=datetime.now(timezone.utc),
            risk_amount_usd=None,
            position_size=None
        ),
        TradeSignal(
            symbol="SPOT_ETH_USDT",
            strategy="WEDGE_BREAKOUT",
            trade_type="long",
            interval="15m",
            entry_price=2970.00,
            stop_loss_price=2950.00,
            take_profit_price=3000.00,
            signal_time=datetime.now(timezone.utc),
            risk_amount_usd=None,
            position_size=None
        ),
    ]
    
    # Simulate trade processing
    active_trades = []
    
    logger.info(f"\nProcessing {len(test_signals)} test trade signals...\n")
    
    for signal in test_signals:
        logger.info(f"Signal: {signal.strategy} ({signal.trade_type.upper()}) for {signal.symbol} on {signal.interval}")
        logger.info(f"  Entry: {signal.entry_price:.2f}, SL: {signal.stop_loss_price:.2f}, TP: {signal.take_profit_price:.2f}")
        
        # Calculate trade parameters
        finalized_signal = risk_manager.calculate_trade_parameters(signal)
        
        if finalized_signal and finalized_signal.position_size is not None:
            logger.info(f"  ✓ Risk Check PASSED")
            logger.info(f"    Position Size: {finalized_signal.position_size:.4f} {finalized_signal.symbol}")
            logger.info(f"    Risk Amount: ${finalized_signal.risk_amount_usd:.2f}")
            
            # === PAPER TRADING EXECUTION ===
            logger.info(f"\n{'='*70}")
            logger.info(f"[PAPER TRADING] Executing simulated order for {finalized_signal.symbol}")
            logger.info(f"{'='*70}")
            
            # Simulate market execution
            execution_price = finalized_signal.entry_price
            order_id = f"PAPER_{finalized_signal.symbol}_{datetime.utcnow().timestamp()}"
            
            # Create active trade record
            active_trade = ActiveTrade(
                signal=finalized_signal,
                entry_time=datetime.utcnow(),
                entry_order_id=order_id,
                status="OPEN"
            )
            
            active_trades.append(active_trade)
            
            logger.info(f"  ✓ Order EXECUTED (PAPER TRADING)")
            logger.info(f"    Order ID: {order_id}")
            logger.info(f"    Entry Price: ${execution_price:.2f}")
            logger.info(f"    Position Size: {finalized_signal.position_size:.4f} {finalized_signal.symbol}")
            logger.info(f"    Stop Loss: ${finalized_signal.stop_loss_price:.2f}")
            logger.info(f"    Take Profit: ${finalized_signal.take_profit_price:.2f}")
            logger.info(f"    Active Trades: {len(active_trades)}")
            logger.info(f"{'='*70}\n")
        else:
            logger.warning(f"  ✗ Risk Check FAILED - Signal discarded")
    
    # Simulate trade exit scenarios
    logger.info("\n" + "="*70)
    logger.info("[PAPER TRADING] Simulating Trade Exits")
    logger.info("="*70 + "\n")
    
    # Simulate a winning trade (take profit)
    if active_trades:
        trade = active_trades[0]
        logger.info(f"Scenario 1: Price reaches Take Profit level")
        logger.info(f"  Symbol: {trade.signal.symbol}")
        logger.info(f"  Entry: ${trade.signal.entry_price:.2f}")
        logger.info(f"  TP Level: ${trade.signal.take_profit_price:.2f}")
        logger.info(f"  Current Price: ${trade.signal.take_profit_price:.2f}")
        
        # Simulate close
        trade.exit_time = datetime.utcnow()
        trade.exit_price = trade.signal.take_profit_price
        trade.status = "CLOSED"
        
        pnl = (trade.exit_price - trade.signal.entry_price) * trade.signal.position_size
        trade.pnl_usd = pnl
        trade.fees_usd = pnl * 0.0005
        net_pnl = pnl - trade.fees_usd
        
        logger.info(f"\n{'='*70}")
        logger.info(f"[PAPER TRADING] Trade Closed - TAKE_PROFIT")
        logger.info(f"{'='*70}")
        logger.info(f"  Exit Price: ${trade.exit_price:.2f}")
        logger.info(f"  Gross P&L: ${pnl:.2f}")
        logger.info(f"  Fees: ${trade.fees_usd:.2f}")
        logger.info(f"  Net P&L: ${net_pnl:.2f}")
        logger.info(f"\033[92m  ✓ WINNER! +${net_pnl:.2f}\033[0m")
        logger.info(f"{'='*70}\n")
    
    # Simulate a losing trade (stop loss)
    if len(active_trades) > 1:
        trade = active_trades[1]
        logger.info(f"Scenario 2: Price hits Stop Loss level")
        logger.info(f"  Symbol: {trade.signal.symbol}")
        logger.info(f"  Entry: ${trade.signal.entry_price:.2f}")
        logger.info(f"  SL Level: ${trade.signal.stop_loss_price:.2f}")
        logger.info(f"  Current Price: ${trade.signal.stop_loss_price:.2f}")
        
        # Simulate close
        trade.exit_time = datetime.utcnow()
        trade.exit_price = trade.signal.stop_loss_price
        trade.status = "CLOSED"
        
        pnl = (trade.exit_price - trade.signal.entry_price) * trade.signal.position_size
        trade.pnl_usd = pnl
        trade.fees_usd = abs(pnl) * 0.0005
        net_pnl = pnl - trade.fees_usd
        
        logger.info(f"\n{'='*70}")
        logger.info(f"[PAPER TRADING] Trade Closed - STOP_LOSS")
        logger.info(f"{'='*70}")
        logger.info(f"  Exit Price: ${trade.exit_price:.2f}")
        logger.info(f"  Gross P&L: ${pnl:.2f}")
        logger.info(f"  Fees: ${trade.fees_usd:.2f}")
        logger.info(f"  Net P&L: ${net_pnl:.2f}")
        logger.info(f"\033[91m  ✗ LOSER: -${abs(net_pnl):.2f}\033[0m")
        logger.info(f"{'='*70}\n")
    
    # Summary
    closed_trades = [t for t in active_trades if t.status == "CLOSED"]
    total_pnl = sum(t.pnl_usd - t.fees_usd for t in closed_trades)
    winners = [t for t in closed_trades if (t.pnl_usd - t.fees_usd) > 0]
    losers = [t for t in closed_trades if (t.pnl_usd - t.fees_usd) < 0]
    
    logger.info("\n" + "="*80)
    logger.info("PAPER TRADING SUMMARY")
    logger.info("="*80)
    logger.info(f"Total Trades: {len(closed_trades)}")
    logger.info(f"Winners: {len(winners)} ({len(winners)/len(closed_trades)*100:.1f}%)")
    logger.info(f"Losers: {len(losers)} ({len(losers)/len(closed_trades)*100:.1f}%)")
    logger.info(f"Total Net P&L: ${total_pnl:.2f}")
    logger.info(f"Account Equity: ${ACCOUNT_EQUITY_USD + total_pnl:.2f}")
    logger.info("="*80 + "\n")

if __name__ == "__main__":
    test_paper_trading()
