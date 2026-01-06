// ==============================================================================
// FILE: config.ts (Content)
// ==============================================================================
// Configuration for DepthSignals-Inspired Trading Bot
// ==============================================================================

// --- API Configuration ---
export const WOOFI_BASE_URL = "https://api.woo.org";
// TODO: Add your Woofi Pro API Key and Secret if using private endpoints
// export const WOOFI_API_KEY = process.env.WOOFI_API_KEY;
// export const WOOFI_API_SECRET = process.env.WOOFI_API_SECRET;

// --- Account & Risk Management ---
export const ACCOUNT_EQUITY_USD = 10000.0; // Total trading capital. ADJUST THIS!
export const RISK_PERCENTAGE_PER_TRADE = 0.01; // Risk 1% of equity per trade. ADJUST THIS!

// --- Data Fetching Parameters ---
export const CANDLE_LIMIT_FOR_SR_ANALYSIS = 100; // General S/R analysis lookback

// --- Pattern Recognition Parameters ---
export const WEDGE_LOOKBACK_CANDLES = 150; // Candles to look back for wedge patterns
export const WEDGE_MIN_PIVOTS_FOR_TRENDLINE = 3; // Min pivot points for trendline fit (lowered for aggressive mode)
export const WEDGE_APEX_PROXIMITY_THRESHOLD_RATIO = 0.5; // Nearness to apex for breakout (relaxed threshold)
export const WEDGE_MIN_R_SQUARED = 0.10; // Min R-squared for trendline validity (further lowered for aggressive trading)
export const TRENDLINE_SLOPE_DIFF_THRESHOLD = 0.00001; // Minimum slope difference for convergence (relaxed)

export const ORB_DURATION_MINUTES = 15; // Opening Range duration in minutes
export const ORB_BREAKOUT_BUFFER_FACTOR = 1.001; // Buffer for breakout (e.g., 0.1%)
export const ORB_RISK_REWARD_RATIO = 2.5; // Target profit as multiple of risk (aligned with wedge/5m targets)

// --- Bot Operation Parameters ---
export const MONITORED_SYMBOLS = ['SPOT_BTC_USDT', 'SPOT_ETH_USDT', 'SPOT_SOL_USDT', 'SPOT_ADA_USDT', 'SPOT_DOGE_USDT', 'SPOT_POL_USDT'];
export const ORB_SYMBOLS = ['SPOT_BTC_USDT', 'SPOT_ETH_USDT', 'SPOT_SOL_USDT']; // Symbols for ORB strategy

export const SCAN_INTERVAL_SECONDS = 60; // Scanning frequency in seconds

// --- Aggressive Trading Configuration ---
export const AUTO_TRADE_ON_PATTERN_DETECTION = true; // Automatically execute trades when patterns form
export const AUTO_TRADE_ON_BREAKOUT = true; // Automatically execute on pattern breakout
export const AGGRESSIVE_MODE = true; // Trade more patterns with relaxed thresholds
export const MAX_CONCURRENT_TRADES = 5; // Maximum number of simultaneous open positions
export const MAX_DAILY_TRADES = 20; // Maximum trades per day (quality over quantity)
export const MIN_MINUTES_BETWEEN_TRADES = 15; // Minimum 15 minutes between trades to avoid over-trading

// --- 5-Minute Conservative Trading Configuration (BTC & ETH Only) ---
export const AGGRESSIVE_5M_SYMBOLS = ['SPOT_BTC_USDT', 'SPOT_ETH_USDT']; // Trade 5-minute candles for these symbols
export const SCAN_5M_ENABLED = true; // Enable 5-minute candle scanning
export const SCAN_5M_INTERVAL_SECONDS = 30; // Check 5-minute patterns every 30 seconds (less frequent)
export const WEDGE_MIN_PIVOTS_5M = 4; // Require more pivots for better pattern quality
export const WEDGE_MIN_R_SQUARED_5M = 0.25; // Higher R-squared threshold for better trendlines
export const POSITION_SIZE_REDUCTION_5M = 0.3; // Use only 30% of normal position size for 5m trades (more conservative)
export const MIN_SIGNAL_CONFIDENCE_5M = 0.7; // Minimum confidence score for 5m signals
export const MAX_DAILY_5M_TRADES = 3; // Limit 5m trades per symbol per day
export const MIN_PATTERN_AGE_5M = 3; // Minimum pattern age in candles before breakout
export const MAX_SLIPPAGE_5M = 0.001; // Maximum allowed slippage (0.1%)

// --- Logging ---
export const LOG_LEVEL = "INFO"; // DEBUG, INFO, WARNING, ERROR
export const LOG_FILE = "trading_bot.log";

// --- EMA Parameters (for potential trend filtering/confirmation) ---
export const EMA_PERIODS = [13, 34, 244, 610]; // DepthSignals mentioned EMAs

// --- Pivot Point Detection Window ---
export const PIVOT_WINDOW_SIZE = 2; // Bars on each side for pivot point detection

// --- Trendline Convergence Check ---
export const TRENDLINE_SLOPE_DIFF_THRESHOLD_CONFIG = 1e-6;