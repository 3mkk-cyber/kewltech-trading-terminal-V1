"""
Data Persistence Module - Stores trading signals and patterns in PostgreSQL
Runs independently from trading_bot.py while bot collects data
"""

import os
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
import time

# Load environment variables from .env.local
env_path = Path(__file__).parent / ".env.local"
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://app_user:app_pass123@localhost:5432/kewltech_trading")

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("data_persistence.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages PostgreSQL database operations for trading data"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.conn = None
        self.cursor = None
        self.connect()
        self.init_schema()
    
    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(self.db_url)
            self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            logger.info("✓ Connected to PostgreSQL database")
        except psycopg2.Error as e:
            logger.error(f"✗ Database connection failed: {e}")
            raise
    
    def init_schema(self):
        """Initialize database schema if not exists"""
        try:
            self.cursor.execute("""
                CREATE TABLE IF NOT EXISTS patterns (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    pattern_type VARCHAR(50) NOT NULL,
                    interval VARCHAR(10) NOT NULL,
                    detection_time TIMESTAMP WITH TIME ZONE NOT NULL,
                    slope_upper FLOAT,
                    slope_lower FLOAT,
                    r_squared_upper FLOAT,
                    r_squared_lower FLOAT,
                    pivot_count INT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS signals (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    strategy VARCHAR(50) NOT NULL,
                    trade_type VARCHAR(10) NOT NULL,
                    interval VARCHAR(10) NOT NULL,
                    entry_price FLOAT NOT NULL,
                    stop_loss_price FLOAT NOT NULL,
                    take_profit_price FLOAT NOT NULL,
                    signal_time TIMESTAMP WITH TIME ZONE NOT NULL,
                    pattern_id INT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (pattern_id) REFERENCES patterns(id)
                );
                
                CREATE TABLE IF NOT EXISTS ema_trends (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    interval VARCHAR(10) NOT NULL,
                    ema_13 VARCHAR(20),
                    ema_34 VARCHAR(20),
                    ema_244 VARCHAR(20),
                    ema_610 VARCHAR(20),
                    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS orb_data (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    orb_high FLOAT NOT NULL,
                    orb_low FLOAT NOT NULL,
                    orb_end_time TIMESTAMP WITH TIME ZONE NOT NULL,
                    breakout_price FLOAT,
                    breakout_type VARCHAR(10),
                    breakout_time TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS trades (
                    id SERIAL PRIMARY KEY,
                    signal_id INT,
                    symbol VARCHAR(20) NOT NULL,
                    entry_price FLOAT NOT NULL,
                    entry_time TIMESTAMP WITH TIME ZONE NOT NULL,
                    stop_loss_price FLOAT NOT NULL,
                    take_profit_price FLOAT NOT NULL,
                    position_size FLOAT,
                    risk_amount_usd FLOAT,
                    exit_price FLOAT,
                    exit_time TIMESTAMP WITH TIME ZONE,
                    status VARCHAR(20),
                    pnl FLOAT,
                    pnl_percent FLOAT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (signal_id) REFERENCES signals(id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_patterns_symbol_time ON patterns(symbol, detection_time);
                CREATE INDEX IF NOT EXISTS idx_signals_symbol_time ON signals(symbol, signal_time);
                CREATE INDEX IF NOT EXISTS idx_ema_trends_symbol_time ON ema_trends(symbol, recorded_at);
                CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
            """)
            self.conn.commit()
            logger.info("✓ Database schema initialized")
        except psycopg2.Error as e:
            logger.error(f"✗ Schema initialization failed: {e}")
            self.conn.rollback()
            raise
    
    def insert_pattern(self, symbol: str, pattern_type: str, interval: str, 
                      detection_time: datetime, slope_upper: float, slope_lower: float,
                      r_squared_upper: float, r_squared_lower: float, pivot_count: int) -> int:
        """Insert a detected pattern into database"""
        try:
            self.cursor.execute("""
                INSERT INTO patterns 
                (symbol, pattern_type, interval, detection_time, slope_upper, slope_lower, 
                 r_squared_upper, r_squared_lower, pivot_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
            """, (symbol, pattern_type, interval, detection_time, slope_upper, slope_lower,
                  r_squared_upper, r_squared_lower, pivot_count))
            pattern_id = self.cursor.fetchone()['id']
            self.conn.commit()
            logger.info(f"[PATTERN] {symbol} {pattern_type} ({interval}) stored - ID: {pattern_id}")
            return pattern_id
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to insert pattern: {e}")
            self.conn.rollback()
            return None
    
    def insert_signal(self, symbol: str, strategy: str, trade_type: str, interval: str,
                     entry_price: float, stop_loss_price: float, take_profit_price: float,
                     signal_time: datetime, pattern_id: int = None) -> int:
        """Insert a trade signal into database"""
        try:
            self.cursor.execute("""
                INSERT INTO signals
                (symbol, strategy, trade_type, interval, entry_price, stop_loss_price, 
                 take_profit_price, signal_time, pattern_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
            """, (symbol, strategy, trade_type, interval, entry_price, stop_loss_price,
                  take_profit_price, signal_time, pattern_id))
            signal_id = self.cursor.fetchone()['id']
            self.conn.commit()
            logger.info(f"[SIGNAL] {strategy} {trade_type.upper()} {symbol} @ {entry_price:.4f} - ID: {signal_id}")
            return signal_id
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to insert signal: {e}")
            self.conn.rollback()
            return None
    
    def insert_ema_trend(self, symbol: str, interval: str, ema_13: str, ema_34: str,
                        ema_244: str, ema_610: str, recorded_at: datetime):
        """Insert EMA trend data"""
        try:
            self.cursor.execute("""
                INSERT INTO ema_trends
                (symbol, interval, ema_13, ema_34, ema_244, ema_610, recorded_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """, (symbol, interval, ema_13, ema_34, ema_244, ema_610, recorded_at))
            self.conn.commit()
            logger.debug(f"[EMA] {symbol} {interval} trend recorded")
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to insert EMA trend: {e}")
            self.conn.rollback()
    
    def insert_orb_data(self, symbol: str, orb_high: float, orb_low: float, 
                       orb_end_time: datetime):
        """Insert ORB (Opening Range Breakout) data"""
        try:
            self.cursor.execute("""
                INSERT INTO orb_data
                (symbol, orb_high, orb_low, orb_end_time)
                VALUES (%s, %s, %s, %s)
                RETURNING id;
            """, (symbol, orb_high, orb_low, orb_end_time))
            orb_id = self.cursor.fetchone()['id']
            self.conn.commit()
            logger.info(f"[ORB] {symbol} High={orb_high:.4f}, Low={orb_low:.4f} - ID: {orb_id}")
            return orb_id
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to insert ORB data: {e}")
            self.conn.rollback()
            return None
    
    def update_orb_breakout(self, orb_id: int, breakout_price: float, 
                           breakout_type: str, breakout_time: datetime):
        """Update ORB record with breakout information"""
        try:
            self.cursor.execute("""
                UPDATE orb_data
                SET breakout_price = %s, breakout_type = %s, breakout_time = %s
                WHERE id = %s;
            """, (breakout_price, breakout_type, breakout_time, orb_id))
            self.conn.commit()
            logger.info(f"[ORB BREAKOUT] ID={orb_id} {breakout_type.upper()} @ {breakout_price:.4f}")
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to update ORB breakout: {e}")
            self.conn.rollback()
    
    def insert_trade(self, signal_id: int, symbol: str, entry_price: float, 
                    entry_time: datetime, stop_loss_price: float, 
                    take_profit_price: float, position_size: float, risk_amount_usd: float):
        """Insert a trade execution record"""
        try:
            self.cursor.execute("""
                INSERT INTO trades
                (signal_id, symbol, entry_price, entry_time, stop_loss_price,
                 take_profit_price, position_size, risk_amount_usd, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
            """, (signal_id, symbol, entry_price, entry_time, stop_loss_price,
                  take_profit_price, position_size, risk_amount_usd, 'OPEN'))
            trade_id = self.cursor.fetchone()['id']
            self.conn.commit()
            logger.info(f"[TRADE] {symbol} OPEN - Entry: {entry_price:.4f}, Size: {position_size:.4f} - ID: {trade_id}")
            return trade_id
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to insert trade: {e}")
            self.conn.rollback()
            return None
    
    def close_trade(self, trade_id: int, exit_price: float, exit_time: datetime):
        """Close a trade with exit price"""
        try:
            # Get trade details for PnL calculation
            self.cursor.execute("SELECT entry_price, position_size FROM trades WHERE id = %s", (trade_id,))
            trade = self.cursor.fetchone()
            
            if trade:
                entry_price = trade['entry_price']
                position_size = trade['position_size']
                pnl = (exit_price - entry_price) * position_size
                pnl_percent = ((exit_price - entry_price) / entry_price) * 100
                
                self.cursor.execute("""
                    UPDATE trades
                    SET exit_price = %s, exit_time = %s, status = %s, pnl = %s, pnl_percent = %s
                    WHERE id = %s;
                """, (exit_price, exit_time, 'CLOSED', pnl, pnl_percent, trade_id))
                self.conn.commit()
                logger.info(f"[TRADE CLOSED] ID={trade_id} Exit: {exit_price:.4f}, PnL: {pnl:.2f} ({pnl_percent:.2f}%)")
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to close trade: {e}")
            self.conn.rollback()
    
    def get_patterns_summary(self, symbol: str = None, limit: int = 20):
        """Get summary of detected patterns"""
        try:
            if symbol:
                self.cursor.execute("""
                    SELECT symbol, pattern_type, interval, detection_time, slope_upper, slope_lower,
                           r_squared_upper, r_squared_lower
                    FROM patterns
                    WHERE symbol = %s
                    ORDER BY detection_time DESC
                    LIMIT %s;
                """, (symbol, limit))
            else:
                self.cursor.execute("""
                    SELECT symbol, pattern_type, interval, detection_time, slope_upper, slope_lower,
                           r_squared_upper, r_squared_lower
                    FROM patterns
                    ORDER BY detection_time DESC
                    LIMIT %s;
                """, (limit,))
            
            return self.cursor.fetchall()
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to fetch patterns: {e}")
            return []
    
    def get_signals_summary(self, symbol: str = None, limit: int = 20):
        """Get summary of generated signals"""
        try:
            if symbol:
                self.cursor.execute("""
                    SELECT id, symbol, strategy, trade_type, interval, entry_price,
                           stop_loss_price, take_profit_price, signal_time
                    FROM signals
                    WHERE symbol = %s
                    ORDER BY signal_time DESC
                    LIMIT %s;
                """, (symbol, limit))
            else:
                self.cursor.execute("""
                    SELECT id, symbol, strategy, trade_type, interval, entry_price,
                           stop_loss_price, take_profit_price, signal_time
                    FROM signals
                    ORDER BY signal_time DESC
                    LIMIT %s;
                """, (limit,))
            
            return self.cursor.fetchall()
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to fetch signals: {e}")
            return []
    
    def get_open_trades(self):
        """Get all open trades"""
        try:
            self.cursor.execute("""
                SELECT id, symbol, entry_price, entry_time, stop_loss_price,
                       take_profit_price, position_size, risk_amount_usd
                FROM trades
                WHERE status = 'OPEN'
                ORDER BY entry_time DESC;
            """)
            return self.cursor.fetchall()
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to fetch open trades: {e}")
            return []
    
    def get_trade_statistics(self):
        """Get trading statistics"""
        try:
            self.cursor.execute("""
                SELECT 
                    COUNT(*) as total_trades,
                    SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_trades,
                    SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed_trades,
                    SUM(CASE WHEN status = 'CLOSED' AND pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
                    SUM(CASE WHEN status = 'CLOSED' AND pnl <= 0 THEN 1 ELSE 0 END) as losing_trades,
                    ROUND(SUM(CASE WHEN status = 'CLOSED' THEN pnl ELSE 0 END)::numeric, 2) as total_pnl,
                    ROUND(AVG(CASE WHEN status = 'CLOSED' THEN pnl_percent END)::numeric, 2) as avg_pnl_percent
                FROM trades;
            """)
            return self.cursor.fetchone()
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to fetch statistics: {e}")
            return None
    
    def close(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        logger.info("Database connection closed")


def print_dashboard(db_manager: DatabaseManager):
    """Print trading dashboard from database"""
    print("\n" + "="*80)
    print("DEPTHSIGNALS TRADING BOT - DATABASE DASHBOARD")
    print("="*80)
    
    # Recent patterns
    print("\n[RECENT PATTERNS (Last 10)]")
    print("-" * 80)
    patterns = db_manager.get_patterns_summary(limit=10)
    if patterns:
        for p in patterns:
            print(f"  {p['symbol']:12} {p['pattern_type']:20} {p['interval']:8} "
                  f"Upper(slope={p['slope_upper']:8.4f}, R²={p['r_squared_upper']:.4f}) "
                  f"Lower(slope={p['slope_lower']:8.4f}, R²={p['r_squared_lower']:.4f})")
    else:
        print("  No patterns recorded yet")
    
    # Recent signals
    print("\n[RECENT SIGNALS (Last 10)]")
    print("-" * 80)
    signals = db_manager.get_signals_summary(limit=10)
    if signals:
        for s in signals:
            print(f"  {s['symbol']:12} {s['strategy']:20} {s['trade_type']:8} "
                  f"Entry={s['entry_price']:.4f} SL={s['stop_loss_price']:.4f} "
                  f"TP={s['take_profit_price']:.4f}")
    else:
        print("  No signals generated yet")
    
    # Open trades
    print("\n[OPEN TRADES]")
    print("-" * 80)
    open_trades = db_manager.get_open_trades()
    if open_trades:
        for t in open_trades:
            print(f"  {t['symbol']:12} Entry={t['entry_price']:.4f} SL={t['stop_loss_price']:.4f} "
                  f"TP={t['take_profit_price']:.4f} Size={t['position_size']:.4f}")
    else:
        print("  No open trades")
    
    # Statistics
    print("\n[TRADING STATISTICS]")
    print("-" * 80)
    stats = db_manager.get_trade_statistics()
    if stats and stats['total_trades'] > 0:
        print(f"  Total Trades:    {stats['total_trades']}")
        print(f"  Open Trades:     {stats['open_trades']}")
        print(f"  Closed Trades:   {stats['closed_trades']}")
        print(f"  Winning Trades:  {stats['winning_trades']}")
        print(f"  Losing Trades:   {stats['losing_trades']}")
        print(f"  Total PnL:       ${stats['total_pnl']}")
        print(f"  Avg PnL %:       {stats['avg_pnl_percent']}%")
    else:
        print("  No trades recorded yet")
    
    print("\n" + "="*80 + "\n")


def main():
    """Main function - initialize database and print dashboard"""
    logger.info("Starting DepthSignals Trading Bot - Data Persistence Module")
    
    try:
        # Initialize database manager
        db_manager = DatabaseManager(DATABASE_URL)
        
        # Keep running and periodically display dashboard
        while True:
            print_dashboard(db_manager)
            
            # Wait before next update
            logger.info("Dashboard updated. Next update in 60 seconds...")
            time.sleep(60)
    
    except KeyboardInterrupt:
        logger.info("Shutting down data persistence module...")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
    finally:
        if 'db_manager' in locals():
            db_manager.close()


if __name__ == "__main__":
    main()
