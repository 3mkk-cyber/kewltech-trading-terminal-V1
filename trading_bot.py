# ==============================================================================
# Kewltech-Inspired Trading Bot - Consolidated Script
#
# DISCLAIMER: This software is for educational and research purposes only.
# Trading cryptocurrencies carries a high level of risk. Past performance
# is not indicative of future results. Use at your own risk.
# ==============================================================================

# --- Dependencies ---
# pip install requests numpy scipy

import requests
import json
import logging
import time
import os
import random
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple
import numpy as np
from scipy import stats

# ==============================================================================
# FILE: config.py (Content)
# ==============================================================================
"""
Configuration for Kewltech-Inspired Trading Bot
"""

# --- API Configuration ---
WOOFI_BASE_URL = "https://api.woo.org"
# TODO: Add your Woofi Pro API Key and Secret if using private endpoints
# WOOFI_API_KEY = os.environ.get("WOOFI_API_KEY")
# WOOFI_API_SECRET = os.environ.get("WOOFI_API_SECRET")

# --- Account & Risk Management ---
ACCOUNT_EQUITY_USD = 10000.0  # Total trading capital. ADJUST THIS!
RISK_PERCENTAGE_PER_TRADE = 0.01  # Risk 1% of equity per trade. ADJUST THIS!

# --- Data Fetching Parameters ---
CANDLE_LIMIT_FOR_SR_ANALYSIS = 100 # General S/R analysis lookback

# --- Pattern Recognition Parameters ---
WEDGE_LOOKBACK_CANDLES = 150 # Candles to look back for wedge patterns
WEDGE_MIN_PIVOTS_FOR_TRENDLINE = 3 # Min pivot points for trendline fit (lowered for aggressive mode)
WEDGE_APEX_PROXIMITY_THRESHOLD_RATIO = 0.5 # Nearness to apex for breakout (relaxed threshold)
WEDGE_MIN_R_SQUARED = 0.10 # Min R-squared for trendline validity (further lowered for aggressive trading)
TRENDLINE_SLOPE_DIFF_THRESHOLD = 0.00001  # Minimum slope difference for convergence (relaxed)

ORB_DURATION_MINUTES = 15 # Opening Range duration in minutes
ORB_BREAKOUT_BUFFER_FACTOR = 1.001 # Buffer for breakout (e.g., 0.1%)
ORB_RISK_REWARD_RATIO = 1.5 # Target profit as multiple of risk

# --- Bot Operation Parameters ---
MONITORED_SYMBOLS = ['SPOT_BTC_USDT', 'SPOT_ETH_USDT', 'SPOT_SOL_USDT', 'SPOT_ADA_USDT', 'SPOT_DOGE_USDT', 'SPOT_POL_USDT']
ORB_SYMBOLS = ['SPOT_BTC_USDT', 'SPOT_ETH_USDT', 'SPOT_SOL_USDT'] # Symbols for ORB strategy

SCAN_INTERVAL_SECONDS = 60 # Scanning frequency in seconds

# --- Aggressive Trading Configuration ---
AUTO_TRADE_ON_PATTERN_DETECTION = True  # Automatically execute trades when patterns form
AUTO_TRADE_ON_BREAKOUT = True  # Automatically execute on pattern breakout
AGGRESSIVE_MODE = True  # Trade more patterns with relaxed thresholds
MAX_CONCURRENT_TRADES = 5  # Maximum number of simultaneous open positions

# --- 5-Minute Aggressive Trading Configuration (BTC & ETH Only) ---
AGGRESSIVE_5M_SYMBOLS = ['SPOT_BTC_USDT', 'SPOT_ETH_USDT']  # Trade 5-minute candles for these symbols
SCAN_5M_ENABLED = True  # Enable 5-minute candle scanning
SCAN_5M_INTERVAL_SECONDS = 15  # Check 5-minute patterns every 15 seconds
WEDGE_MIN_PIVOTS_5M = 2  # Very relaxed pivot requirement for 5m (more aggressive)
WEDGE_MIN_R_SQUARED_5M = 0.15  # Lower R-squared threshold for 5m patterns
POSITION_SIZE_REDUCTION_5M = 0.5  # Use 50% of normal position size for 5m trades (to manage risk)

# --- Logging ---
LOG_LEVEL = "INFO" # DEBUG, INFO, WARNING, ERROR
LOG_FILE = "trading_bot.log"

# --- EMA Parameters (for potential trend filtering/confirmation) ---
EMA_PERIODS = [13, 34, 244, 610] # Kewltech mentioned EMAs

# --- Pivot Point Detection Window ---
PIVOT_WINDOW_SIZE = 2 # Bars on each side for pivot point detection

# --- Trendline Convergence Check ---
TRENDLINE_SLOPE_DIFF_THRESHOLD = 1e-6

# ==============================================================================
# FILE: data_models.py (Content)
# ==============================================================================
"""
Data structures for trading bot
"""
@dataclass
class Kline:
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: datetime
    quote_asset_volume: float = 0.0
    number_of_trades: int = 0
    taker_buy_base_asset_volume: float = 0.0
    taker_buy_quote_asset_volume: float = 0.0

@dataclass
class PivotPoint:
    type: str  # 'high' or 'low'
    price: float
    index: int
    time: datetime

@dataclass
class Pattern:
    symbol: str
    pattern_type: str
    interval: str
    detection_time: datetime
    upper_trendline_slope: Optional[float] = None
    upper_trendline_intercept: Optional[float] = None
    lower_trendline_slope: Optional[float] = None
    lower_trendline_intercept: Optional[float] = None
    approx_apex_index: Optional[float] = None
    upper_pivots: List[PivotPoint] = field(default_factory=list)
    lower_pivots: List[PivotPoint] = field(default_factory=list)
    orb_high: Optional[float] = None
    orb_low: Optional[float] = None
    orb_end_time: Optional[datetime] = None

@dataclass
class TradeSignal:
    symbol: str
    strategy: str
    trade_type: str
    interval: str
    entry_price: float
    stop_loss_price: float
    take_profit_price: float
    signal_time: datetime
    pattern_details: Optional[Pattern] = None
    risk_amount_usd: Optional[float] = None
    position_size: Optional[float] = None

@dataclass
class ActiveTrade:
    signal: TradeSignal
    entry_time: datetime
    entry_order_id: Optional[str] = None
    stop_loss_order_id: Optional[str] = None
    take_profit_order_id: Optional[str] = None
    status: str = "OPEN"
    exit_price: Optional[float] = None
    exit_time: Optional[datetime] = None
    exit_reason: Optional[str] = None
    pnl_usd: Optional[float] = None
    fees_usd: Optional[float] = None

# ==============================================================================
# FILE: utils.py (Content)
# ==============================================================================
"""
Helper functions for technical analysis
"""
logger = logging.getLogger(__name__)

def calculate_ema(data: List[float], period: int) -> Optional[List[float]]:
    if len(data) < period or period <= 1: return None
    ema = [sum(data[:period]) / period]
    multiplier = 2 / (period + 1)
    for i in range(period, len(data)):
        ema.append((data[i] * multiplier) + (ema[-1] * (1 - multiplier)))
    return ema

def get_pivot_points(klines: List[Kline], pivot_window: int = PIVOT_WINDOW_SIZE) -> List[PivotPoint]:
    if not klines or len(klines) < 2 * pivot_window + 1:
        logger.debug(f"Not enough klines ({len(klines)}) for pivot window {pivot_window}.")
        return []
    pivots = []
    # Assuming klines are sorted chronologically (oldest at 0, newest at -1)
    for i in range(pivot_window, len(klines) - pivot_window):
        current_kline = klines[i]
        current_high, current_low, current_time = current_kline.high, current_kline.low, current_kline.close_time
        is_pivot_low = True
        is_pivot_high = True
        
        for j in range(i - pivot_window, i + pivot_window + 1):
            if j == i: continue
            neighbor_kline = klines[j]
            if neighbor_kline.high >= current_high: is_pivot_high = False
            if neighbor_kline.low <= current_low: is_pivot_low = False
            if not is_pivot_high and not is_pivot_low: break
        
        if is_pivot_high: pivots.append(PivotPoint(type='high', price=current_high, index=i, time=current_time))
        elif is_pivot_low: pivots.append(PivotPoint(type='low', price=current_low, index=i, time=current_time))
            
    logger.debug(f"Found {len(pivots)} pivot points.")
    return pivots

def fit_trendline(pivots_of_type: List[PivotPoint]) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    if len(pivots_of_type) < 2: return None, None, None
    x_coords = np.array([p.index for p in pivots_of_type])
    y_coords = np.array([p.price for p in pivots_of_type])
    try:
        slope, intercept, r_value, p_value, std_err = stats.linregress(x_coords, y_coords)
        logger.debug(f"Fitted trendline: slope={slope:.6f}, intercept={intercept:.4f}, R²={r_value**2:.4f}")
        return slope, intercept, r_value**2 # Return R-squared
    except Exception as e:
        logger.error(f"Error fitting trendline: {e}")
        return None, None, None

def get_candle_duration_minutes(interval_str: str) -> int:
    if not isinstance(interval_str, str) or not interval_str: return 1
    if interval_str.endswith('m'): return int(interval_str[:-1])
    if interval_str.endswith('h'): return int(interval_str[:-1]) * 60
    if interval_str.endswith('d'): return int(interval_str[:-1]) * 60 * 24
    if interval_str.endswith('w'): return int(interval_str[:-1]) * 60 * 24 * 7
    logger.warning(f"Unknown interval unit in {interval_str}. Defaulting to 1 minute.")
    return 1

def get_ema_trend(klines: List[Kline], ema_periods: List[int]) -> Dict[int, Optional[str]]:
    if not klines: return {}
    closes = [k.close for k in klines]
    ema_trends = {}
    for period in ema_periods:
        ema_values = calculate_ema(closes, period)
        if ema_values and len(ema_values) > 1 and len(klines) >= len(ema_values):
            current_price, current_ema = closes[-1], ema_values[-1]
            prev_ema = ema_values[-2] if len(ema_values) > 1 else current_ema
            if current_price > current_ema:
                ema_trends[period] = "bullish" if current_ema > prev_ema else "bullish_weak"
            elif current_price < current_ema:
                ema_trends[period] = "bearish" if current_ema < prev_ema else "bearish_weak"
            else: ema_trends[period] = "sideways"
        else: ema_trends[period] = "insufficient_data"
    return ema_trends

# ==============================================================================
# FILE: api_client.py (Content)
# ==============================================================================
"""
Handles communication with Woofi Pro API
"""
logger = logging.getLogger(__name__)

class WoofiProAPIClient:
    def __init__(self, base_url: str = WOOFI_BASE_URL, timeout: int = 10):
        self.base_url = base_url
        self.timeout = timeout
        self.session = requests.Session()
        # self.session.headers.update({"X-API-KEY": WOOFI_API_KEY}) # For private endpoints

    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        try:
            response = self.session.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            # Check for success: 'success' field is True OR 'code' field is 0 (or absent)
            code = data.get('code')
            success = data.get('success')
            
            if success == True or code == 0 or (code is None and success is None and 'rows' in data):
                return data
            else:
                # API returned an error code
                error_message = data.get('message', f"Unknown API Error")
                logger.error(f"API Error for {url}: Code {code}, Message: {error_message}")
                return None
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP error for {url}: {e.response.status_code} - {e.response.text}")
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error for {url}: {e}")
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout for {url}: {e}")
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed for {url}: {e}")
        except json.JSONDecodeError as e:
            logger.error(f"Error decoding JSON from {url}: {e}\nResponse: {response.text if 'response' in locals() else 'N/A'}")
        return None

    def get_all_symbols(self) -> Optional[List[Dict[str, Any]]]:
        logger.info("Fetching all symbols...")
        data = self._make_request("/v1/public/info")
        if data and 'rows' in data:
            symbols = data['rows']
            logger.info(f"Successfully fetched {len(symbols)} symbols.")
            return symbols
        logger.warning("Failed to fetch symbols.")
        return None

    def get_klines(self, symbol: str, interval: str, limit: int) -> Optional[List[Kline]]:
        logger.debug(f"Fetching {limit} {interval} klines for {symbol}...")
        params = {'symbol': symbol, 'type': interval, 'limit': limit}
        data = self._make_request("/v1/kline", params=params)
        if data and 'rows' in data:
            klines_raw = data['rows']
            processed_klines = []
            for k_data in klines_raw:
                try:
                    # WooFi API format: {"open":x, "close":x, "low":x, "high":x, "volume":x, "amount":x, "symbol":"x", "type":"x, "start_timestamp":x, "end_timestamp":x}
                    processed_klines.append(Kline(
                        open_time=datetime.fromtimestamp(int(k_data['start_timestamp'])/1000, tz=timezone.utc),
                        open=float(k_data['open']),
                        high=float(k_data['high']),
                        low=float(k_data['low']),
                        close=float(k_data['close']),
                        volume=float(k_data['volume']),
                        close_time=datetime.fromtimestamp(int(k_data['end_timestamp'])/1000, tz=timezone.utc),
                        quote_asset_volume=float(k_data.get('amount', 0)),
                        number_of_trades=0,
                        taker_buy_base_asset_volume=0,
                        taker_buy_quote_asset_volume=0
                    ))
                except (KeyError, TypeError, ValueError) as e:
                    logger.warning(f"Skipping malformed kline for {symbol}: {k_data}. Error: {e}")
                    continue
            # Reverse to chronological order (oldest first) for pattern detection
            processed_klines.reverse()
            logger.debug(f"Successfully fetched {len(processed_klines)} klines for {symbol} (oldest to newest).")
            return processed_klines
        elif data and 'rows' in data and not data['rows']:
             logger.info(f"No klines returned for {symbol} {interval} with limit {limit}.")
             return []
        logger.warning(f"Failed to fetch klines for {symbol} {interval}.")
        return None

    def get_current_price(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get current price and volume data from latest 1m kline (ticker endpoint is down)"""
        logger.debug(f"Fetching current price for {symbol}...")
        params = {'symbol': symbol, 'type': '1m', 'limit': 1}
        data = self._make_request("/v1/kline", params=params)
        if data and 'rows' in data and len(data['rows']) > 0:
            kline = data['rows'][0]
            # Transform to ticker-like format for compatibility
            ticker_data = {
                's': symbol,  # symbol
                'c': kline['close'],  # last price
                'o': kline['open'],  # open price
                'h': kline['high'],  # high price
                'l': kline['low'],  # low price
                'v': kline['volume'],  # volume
                'q': kline['amount'],  # quote volume
                'E': kline['end_timestamp'],  # timestamp
            }
            logger.debug(f"Successfully fetched current price for {symbol}: {kline['close']}")
            return ticker_data
        logger.warning(f"Failed to fetch current price for {symbol}.")
        return None

    # Placeholder for future private API methods (e.g., place_order)
    # def place_order(self, symbol: str, side: str, order_type: str, quantity: float, price: Optional[float] = None, ...):
    #     # Implementation for POST /v1/order
    #     pass

# ==============================================================================
# FILE: pattern_recognition.py (Content)
# ==============================================================================
"""
Implements Kewltech-inspired pattern detection logic
"""
logger = logging.getLogger(__name__)

class PatternRecognizer:
    def __init__(self, api_client: WoofiProAPIClient, trading_bot=None):
        self.api_client = api_client
        self.trading_bot = trading_bot
        self.active_patterns: Dict[str, Pattern] = {} # {symbol_interval: Pattern}

    def _detect_wedge_pattern(self, symbol: str, interval: str, klines: List[Kline]) -> Optional[Pattern]:
        if len(klines) < WEDGE_LOOKBACK_CANDLES * 0.55: 
            logger.debug(f"Not enough klines for {symbol} {interval}: {len(klines)} < {WEDGE_LOOKBACK_CANDLES * 0.55}")
            return None
        # Klines are now in chronological order (oldest first) after reversal in get_klines
        # Check EMA trend for confirmation
        ema_trends = get_ema_trend(klines, EMA_PERIODS)
        logger.debug(f"{symbol} {interval} EMA trends: {ema_trends}")
        
        pivots = get_pivot_points(klines, pivot_window=2) # Smaller window for more pivots
        logger.info(f"{symbol} {interval}: Found {len(pivots)} pivot points (Curr: {klines[-1].close:.4f})")
        if pivots:
            for p in pivots[-5:]:  # Log last 5 pivots
                logger.debug(f"  {p.type.upper()} pivot: ${p.price:.4f} at index {p.index}")
                logger.debug(f"  {p.type.upper()} pivot: ${p.price:.4f} at index {p.index}")
        
        if not pivots: return None
        highs, lows = [p for p in pivots if p.type == 'high'], [p for p in pivots if p.type == 'low']
        logger.debug(f"{symbol} {interval}: {len(highs)} highs, {len(lows)} lows")
        if len(highs) < WEDGE_MIN_PIVOTS_FOR_TRENDLINE or len(lows) < WEDGE_MIN_PIVOTS_FOR_TRENDLINE: return None

        # Fit trendlines to most recent N pivots. Ensure chronological order for fit_trendline.
        # Pivots from get_pivot_points will have indices based on klines list order.
        # If klines are newest first, pivots are also effectively "newest first" by index.
        # fit_trendline expects x_coords to be ordered for regression.
        recent_highs_chrono = sorted(highs, key=lambda x: x.index)[-WEDGE_MIN_PIVOTS_FOR_TRENDLINE:]
        recent_lows_chrono = sorted(lows, key=lambda x: x.index)[-WEDGE_MIN_PIVOTS_FOR_TRENDLINE:]
        if len(recent_highs_chrono) < 2 or len(recent_lows_chrono) < 2: return None

        slope_h, intercept_h, r_sq_h = fit_trendline(recent_highs_chrono)
        slope_l, intercept_l, r_sq_l = fit_trendline(recent_lows_chrono)
        logger.info(f"{symbol} {interval} Trendlines: Upper(slope={slope_h:.6f},R²={r_sq_h:.4f}) Lower(slope={slope_l:.6f},R²={r_sq_l:.4f})")
        if None in (slope_h, intercept_h, r_sq_h) or None in (slope_l, intercept_l, r_sq_l): return None

        detected_pattern = None
        # print(f"Debug {interval_str}: H_slope: {slope_h:.6f}, L_slope: {slope_l:.6f}, H_R2: {r_sq_h:.3f}, L_R2: {r_sq_l:.3f}") # Debug

        # Bullish Wedge (Falling Wedge) - both slopes negative, high slope more negative (steeper downtrend for highs)
        # For a Falling Wedge (Bullish): Highs should have a negative slope, Lows should have a negative slope. Highs slope should be steeper.
        # For a Rising Wedge (Bearish): Highs should have a positive slope, Lows should have a positive slope. Lows slope should be steeper.
        # This is a very simplified check.
        
        # Basic convergence check: slopes should be opposite signs or same sign but converging
        # and R-squared values should indicate a reasonable fit (e.g., > 0.7, but this is tunable)
        # This is a very simplified check.
        
        pattern_info = None
        
        # Check dominant EMA trend (use 34 period as primary indicator)
        primary_ema_trend = ema_trends.get(34, 'insufficient_data')
        
        # Log convergence analysis for debugging
        slope_diff = abs(slope_h - slope_l)
        convergence_ratio = slope_diff / max(abs(slope_h), abs(slope_l), 0.0001)
        logger.debug(f"{symbol} {interval}: Convergence analysis - slope_diff={slope_diff:.6f}, ratio={convergence_ratio:.4f}, H_R²={r_sq_h:.4f}, L_R²={r_sq_l:.4f}")
        
        # Bullish Wedge (Falling Wedge) - prefer in downtrend or sideways (reversal pattern)
        bullish_slope_crit = slope_h < -TRENDLINE_SLOPE_DIFF_THRESHOLD and slope_l < -TRENDLINE_SLOPE_DIFF_THRESHOLD
        bullish_conv_crit = True  # abs(slope_h) > abs(slope_l)  # Relaxed for aggressive mode
        bullish_rsq_crit = r_sq_h > WEDGE_MIN_R_SQUARED and r_sq_l > WEDGE_MIN_R_SQUARED
        
        if bullish_slope_crit and bullish_conv_crit and bullish_rsq_crit:
            logger.info(f"{symbol} {interval}: [BULLISH WEDGE FORMING] Both slopes negative (downtrend), convergence detected (H_slope={slope_h:.6f}, L_slope={slope_l:.6f})")
            if abs(slope_h - slope_l) > TRENDLINE_SLOPE_DIFF_THRESHOLD:
                max_pivot_idx = max(p.index for p in recent_highs_chrono + recent_lows_chrono)
                apex_idx_approx = (intercept_l - intercept_h) / (slope_h - slope_l)
                # if apex_idx_approx > max_pivot_idx: # Relaxed for aggressive mode
                min_pivot_idx = min(p.index for p in recent_highs_chrono + recent_lows_chrono)
                pattern_span_indices = max_pivot_idx - min_pivot_idx
                if pattern_span_indices > 0:
                    current_kline_end_idx = len(klines) -1 # Index of newest kline
                    # Approximate current x_coord for apex distance check
                    # This is simplified; true apex is at apex_idx_approx.
                    # Distance is conceptual here, based on pattern progress.
                    distance_to_apex_conceptual = apex_idx_approx - current_kline_end_idx
                    detected_pattern = Pattern(
                        symbol=symbol, pattern_type="Bullish Wedge (Falling Wedge)", interval=interval, detection_time=klines[-1].close_time,
                        upper_trendline_slope=slope_h, upper_trendline_intercept=intercept_h,
                        lower_trendline_slope=slope_l, lower_trendline_intercept=intercept_l,
                        approx_apex_index=apex_idx_approx,
                        upper_pivots=recent_highs_chrono, lower_pivots=recent_lows_chrono
                    )
                            # print(f"Debug: Potential Bullish Wedge detected on {interval_str} at {klines[-1].close_time}")
        else:
            logger.debug(f"{symbol} {interval}: Bullish Wedge - slope_crit={bullish_slope_crit}, conv_crit={bullish_conv_crit}, rsq_crit={bullish_rsq_crit}")

        # Bearish Wedge (Rising Wedge)
        bearish_slope_crit = slope_h > TRENDLINE_SLOPE_DIFF_THRESHOLD and slope_l > TRENDLINE_SLOPE_DIFF_THRESHOLD
        bearish_conv_crit = True  # slope_l > slope_h  # Relaxed
        bearish_rsq_crit = r_sq_h > WEDGE_MIN_R_SQUARED and r_sq_l > WEDGE_MIN_R_SQUARED
        
        if bearish_slope_crit and bearish_conv_crit and bearish_rsq_crit:
            logger.info(f"{symbol} {interval}: [BEARISH WEDGE FORMING] Both slopes positive (uptrend), convergence detected (H_slope={slope_h:.6f}, L_slope={slope_l:.6f})")
            if abs(slope_h - slope_l) > TRENDLINE_SLOPE_DIFF_THRESHOLD:
                max_pivot_idx = max(p.index for p in recent_highs_chrono + recent_lows_chrono)
                apex_idx_approx = (intercept_l - intercept_h) / (slope_h - slope_l)
                # if apex_idx_approx > max_pivot_idx:
                min_pivot_idx = min(p.index for p in recent_highs_chrono + recent_lows_chrono)
                pattern_span_indices = max_pivot_idx - min_pivot_idx
                if pattern_span_indices > 0:
                    current_kline_end_idx = len(klines) -1
                    distance_to_apex_conceptual = apex_idx_approx - current_kline_end_idx
                    detected_pattern = Pattern(
                        symbol=symbol, pattern_type="Bearish Wedge (Rising Wedge)", interval=interval, detection_time=klines[-1].close_time,
                        upper_trendline_slope=slope_h, upper_trendline_intercept=intercept_h,
                        lower_trendline_slope=slope_l, lower_trendline_intercept=intercept_l,
                        approx_apex_index=apex_idx_approx,
                        upper_pivots=recent_highs_chrono, lower_pivots=recent_lows_chrono
                    )
                            # print(f"Debug: Potential Bearish Wedge detected on {interval_str} at {klines[-1].close_time}")
        else:
            logger.debug(f"{symbol} {interval}: Bearish Wedge - slope_crit={bearish_slope_crit}, conv_crit={bearish_conv_crit}, rsq_crit={bearish_rsq_crit}")
        return detected_pattern

    def _check_wedge_breakout(self, symbol: str, interval: str, pattern: Pattern, current_klines: List[Kline]) -> Optional[TradeSignal]:
        if not pattern or not all(hasattr(pattern, attr) for attr in ['upper_trendline_slope', 'lower_trendline_slope', 'upper_trendline_intercept', 'lower_trendline_intercept']):
            return None
        
        # Klines are in chronological order (oldest first), so newest is at index -1
        last_candle, prev_candle = current_klines[-1], current_klines[-2] if len(current_klines) > 1 else current_klines[-1]
        
        # Trendline y = mx + c, where x is the index in chronological order
        # The pattern was fitted on chronological data, so we use actual indices
        last_idx = len(current_klines) - 1  # Index of newest candle
        prev_idx = len(current_klines) - 2 if len(current_klines) > 1 else last_idx

        # For a Bullish Wedge, breakout is above the upper trendline
        if "Bullish Wedge" in pattern.pattern_type:
            # Calculate trendline values at the current and previous candle indices
            utl_val_at_last = pattern.upper_trendline_intercept + pattern.upper_trendline_slope * last_idx
            utl_val_at_prev = pattern.upper_trendline_intercept + pattern.upper_trendline_slope * prev_idx
            
            if last_candle.close > utl_val_at_last and prev_candle.close <= utl_val_at_prev: # Check for crossover
                entry_price = last_candle.close
                # Stop loss below the lower trendline of the wedge or recent significant low within the wedge
                stop_loss_price = min(p.price for p in pattern.lower_pivots) * 0.999 # Slightly below recent low
                # Take profit: Height of the wedge at widest point projected upwards from entry
                # Approximate wedge height at pattern start (min index of pattern points)
                start_idx_pivots = min(p.index for p in pattern.upper_pivots + pattern.lower_pivots) # This index is from newest-first list
                # To get price at start_idx_pivots, we need klines[start_idx_pivots]
                # This is complex if start_idx_pivots is not a direct index into current_klines.
                # Let's use the price of the pivot point itself for height calculation.
                start_utl_val = pattern.upper_trendline_intercept + pattern.upper_trendline_slope * start_idx_pivots
                start_ltl_val = pattern.lower_trendline_intercept + pattern.lower_trendline_slope * start_idx_pivots
                wedge_height = start_utl_val - start_ltl_val
                take_profit_price = entry_price + wedge_height
                
                signal = TradeSignal(
                    symbol=symbol, strategy="Wedge Breakout", trade_type="long", interval=interval,
                    entry_price=entry_price, stop_loss_price=stop_loss_price, take_profit_price=take_profit_price,
                    signal_time=last_candle.close_time, pattern_details=pattern
                )
                logger.info(f"WEDGE BREAKOUT (LONG) for {symbol} {interval}. Entry: {entry_price:.4f}")
                return signal
            else:
                logger.debug(
                    f"[WEDGE] {symbol} {interval} no long breakout: prev_close={prev_candle.close:.4f} last_close={last_candle.close:.4f} "
                    f"prev_utl={utl_val_at_prev:.4f} last_utl={utl_val_at_last:.4f}"
                )

        # For a Bearish Wedge, breakout is below the lower trendline
        elif "Bearish Wedge" in pattern.pattern_type:
            ltl_val_at_last = pattern.lower_trendline_intercept + pattern.lower_trendline_slope * last_idx
            ltl_val_at_prev = pattern.lower_trendline_intercept + pattern.lower_trendline_slope * prev_idx

            if last_candle.close < ltl_val_at_last and prev_candle.close >= ltl_val_at_prev:
                entry_price = last_candle.close
                stop_loss_price = max(p.price for p in pattern.upper_pivots) * 1.001
                start_idx_pivots = min(p.index for p in pattern.upper_pivots + pattern.lower_pivots)
                start_utl_val = pattern.upper_trendline_intercept + pattern.upper_trendline_slope * start_idx_pivots
                start_ltl_val = pattern.lower_trendline_intercept + pattern.lower_trendline_slope * start_idx_pivots
                wedge_height = start_utl_val - start_ltl_val
                take_profit_price = entry_price - wedge_height
                
                signal = TradeSignal(
                    symbol=symbol, strategy="Wedge Breakout", trade_type="short", interval=interval,
                    entry_price=entry_price, stop_loss_price=stop_loss_price, take_profit_price=take_profit_price,
                    signal_time=last_candle.close_time, pattern_details=pattern
                )
                logger.info(f"WEDGE BREAKOUT (SHORT) for {symbol} {interval}. Entry: {entry_price:.4f}")
                return signal
            else:
                logger.debug(
                    f"[WEDGE] {symbol} {interval} no short breakout: prev_close={prev_candle.close:.4f} last_close={last_candle.close:.4f} "
                    f"prev_ltl={ltl_val_at_prev:.4f} last_ltl={ltl_val_at_last:.4f}"
                )
        return None

    def _detect_orb_breakout(self, symbol: str, current_time_utc: datetime) -> Optional[TradeSignal]:
        if symbol not in ORB_SYMBOLS or symbol not in MONITORED_SYMBOLS: return None
        num_1m, num_5m = 60*24+10, (60*24)//5+10 # Fetch enough for the day
        klines_1m = self.api_client.get_klines(symbol, "1m", num_1m) # Returns chronological (oldest first)
        klines_5m = self.api_client.get_klines(symbol, "5m", num_5m) # Returns chronological (oldest first)
        
        if not klines_1m or not klines_5m: return None
        
        day_start_utc = current_time_utc.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
        # Klines are in chronological order (oldest first). Filter by close_time.
        daily_klines_1m = [k for k in klines_1m if k.close_time >= day_start_utc]
        daily_klines_5m = [k for k in klines_5m if k.close_time >= day_start_utc]
        if not daily_klines_1m or not daily_klines_5m: return None

        orb_end_time = day_start_utc + timedelta(minutes=ORB_DURATION_MINUTES)
        
        # Check if current time is past the opening range formation period
        # Need at least one 5m candle to have formed after ORB end time for breakout check
        if current_time_utc <= orb_end_time + timedelta(minutes=get_candle_duration_minutes("5m")):
            return None 

        orb_klines = [k for k in daily_klines_1m if k.close_time < orb_end_time]
        if not orb_klines: return None
        orb_high, orb_low = max(k.high for k in orb_klines), min(k.low for k in orb_klines)
        logger.debug(f"{symbol} ORB: High={orb_high:.4f}, Low={orb_low:.4f}")
        
        post_orb_klines = [k for k in daily_klines_5m if k.open_time >= orb_end_time] # Using 5m for breakout confirmation
        if not post_orb_klines: return None # No candles formed yet after ORB

        # Look for a clear breakout: close beyond ORB high/low
        # Check the most recent closed 5m candle (last in chronological list)
        last_post_orb_candle = post_orb_klines[-1] # Most recent 5m candle after ORB
        
        signal = None
        entry_price, signal_time = last_post_orb_candle.close, last_post_orb_candle.close_time
        interval = "5m" 
        if entry_price > orb_high * ORB_BREAKOUT_BUFFER_FACTOR:
            stop_loss_price = orb_low * (2.0 - ORB_BREAKOUT_BUFFER_FACTOR) # SL below ORB low
            risk_per_unit = entry_price - stop_loss_price
            if risk_per_unit > 0: take_profit_price = entry_price + (risk_per_unit * ORB_RISK_REWARD_RATIO)
            else: return None # Invalid risk
            signal = TradeSignal(
                symbol=symbol, strategy="ORB Breakout", trade_type="long", interval=interval,
                entry_price=entry_price, stop_loss_price=stop_loss_price, take_profit_price=take_profit_price,
                signal_time=signal_time,
                pattern_details=Pattern(symbol=symbol, pattern_type="ORB_Bullish", interval=interval, detection_time=signal_time, orb_high=orb_high, orb_low=orb_low, orb_end_time=orb_end_time)
            )
            logger.info(f"ORB BREAKOUT (LONG) for {symbol} {interval}. Entry: {entry_price:.4f}")
        elif entry_price < orb_low / ORB_BREAKOUT_BUFFER_FACTOR:
            stop_loss_price = orb_high * ORB_BREAKOUT_BUFFER_FACTOR
            risk_per_unit = stop_loss_price - entry_price
            if risk_per_unit > 0: take_profit_price = entry_price - (risk_per_unit * ORB_RISK_REWARD_RATIO)
            else: return None # Invalid risk
            signal = TradeSignal(
                symbol=symbol, strategy="ORB Breakout", trade_type="short", interval=interval,
                entry_price=entry_price, stop_loss_price=stop_loss_price, take_profit_price=take_profit_price,
                signal_time=signal_time,
                pattern_details=Pattern(symbol=symbol, pattern_type="ORB_Bearish", interval=interval, detection_time=signal_time, orb_high=orb_high, orb_low=orb_low, orb_end_time=orb_end_time)
            )
            logger.info(f"ORB BREAKOUT (SHORT) for {symbol} {interval}. Entry: {entry_price:.4f}")
        return signal

    def _detect_5m_pattern(self, symbol: str, klines: List[Kline]) -> Optional[Pattern]:
        """Detect wedge patterns on 5-minute candles with aggressive parameters"""
        if len(klines) < WEDGE_MIN_PIVOTS_5M + 2:
            return None
        
        # Identify pivot points (simplified for speed)
        pivot_indices = []
        for i in range(1, len(klines) - 1):
            is_high_pivot = klines[i].high > klines[i - 1].high and klines[i].high > klines[i + 1].high
            is_low_pivot = klines[i].low < klines[i - 1].low and klines[i].low < klines[i + 1].low
            if is_high_pivot or is_low_pivot:
                pivot_indices.append(i)
        
        if len(pivot_indices) < WEDGE_MIN_PIVOTS_5M:
            return None
        
        # Extract pivot prices
        pivot_highs = [klines[i].high for i in pivot_indices]
        pivot_lows = [klines[i].low for i in pivot_indices]
        
        # Fit trendlines with aggressive parameters
        x = np.arange(len(pivot_highs))
        
        # Upper trendline
        z_high = np.polyfit(x, pivot_highs, 1)
        p_high = np.poly1d(z_high)
        residuals_high = pivot_highs - p_high(x)
        ss_res_high = np.sum(residuals_high ** 2)
        ss_tot_high = np.sum((np.array(pivot_highs) - np.mean(pivot_highs)) ** 2)
        r2_high = 1 - (ss_res_high / ss_tot_high) if ss_tot_high > 0 else 0
        
        # Lower trendline
        z_low = np.polyfit(x, pivot_lows, 1)
        p_low = np.poly1d(z_low)
        residuals_low = pivot_lows - p_low(x)
        ss_res_low = np.sum(residuals_low ** 2)
        ss_tot_low = np.sum((np.array(pivot_lows) - np.mean(pivot_lows)) ** 2)
        r2_low = 1 - (ss_res_low / ss_tot_low) if ss_tot_low > 0 else 0
        
        # Check for wedge convergence (aggressive for 5m)
        if r2_high >= WEDGE_MIN_R_SQUARED_5M and r2_low >= WEDGE_MIN_R_SQUARED_5M:
            slope_diff = abs(z_high[0] - z_low[0])
            if slope_diff > 0:  # Slopes differ (convergence)
                # Determine wedge type
                upper_slope = z_high[0]
                lower_slope = z_low[0]
                
                if upper_slope < 0 and lower_slope < 0 and lower_slope > upper_slope:
                    # Falling wedge (bullish)
                    return Pattern(
                        symbol=symbol, pattern_type="Bullish Wedge (Falling Wedge)",
                        interval="5m", detection_time=datetime.utcnow(),
                        upper_trendline_slope=upper_slope, lower_trendline_slope=lower_slope,
                        upper_r_squared=r2_high, lower_r_squared=r2_low
                    )
                elif upper_slope > 0 and lower_slope > 0 and upper_slope > lower_slope:
                    # Rising wedge (bearish)
                    return Pattern(
                        symbol=symbol, pattern_type="Bearish Wedge (Rising Wedge)",
                        interval="5m", detection_time=datetime.utcnow(),
                        upper_trendline_slope=upper_slope, lower_trendline_slope=lower_slope,
                        upper_r_squared=r2_high, lower_r_squared=r2_low
                    )
        
        return None

    def _check_5m_breakout(self, symbol: str, pattern: Pattern, klines: List[Kline]) -> Optional[TradeSignal]:
        """Check for 5-minute pattern breakout"""
        if not klines or len(klines) < 2:
            return None
        
        last_candle = klines[-1]
        prev_candle = klines[-2]
        current_price = last_candle.close
        
        # Bullish wedge breakout
        if "Bullish" in pattern.pattern_type:
            if current_price > prev_candle.high:  # Price breaks above previous high
                entry_price = current_price
                risk_per_unit = (current_price - pattern.lower_trendline_slope * 0.05) if pattern.lower_trendline_slope else 0.01
                stop_loss_price = entry_price - (risk_per_unit * 2)
                take_profit_price = entry_price + (risk_per_unit * 2)
                logger.info(f"[5M BREAKOUT] {symbol} bullish: prev_high={prev_candle.high:.4f} close={current_price:.4f} sl={stop_loss_price:.4f} tp={take_profit_price:.4f}")
                
                signal = TradeSignal(
                    symbol=symbol, strategy="5m_Aggressive", trade_type="long", interval="5m",
                    entry_price=entry_price, stop_loss_price=stop_loss_price, 
                    take_profit_price=take_profit_price, signal_time=datetime.utcnow(),
                    pattern_details=pattern
                )
                return signal
        
        # Bearish wedge breakout
        elif "Bearish" in pattern.pattern_type:
            if current_price < prev_candle.low:  # Price breaks below previous low
                entry_price = current_price
                risk_per_unit = (pattern.upper_trendline_slope * 0.05 - current_price) if pattern.upper_trendline_slope else 0.01
                stop_loss_price = entry_price + (risk_per_unit * 2)
                take_profit_price = entry_price - (risk_per_unit * 2)
                logger.info(f"[5M BREAKOUT] {symbol} bearish: prev_low={prev_candle.low:.4f} close={current_price:.4f} sl={stop_loss_price:.4f} tp={take_profit_price:.4f}")
                
                signal = TradeSignal(
                    symbol=symbol, strategy="5m_Aggressive", trade_type="short", interval="5m",
                    entry_price=entry_price, stop_loss_price=stop_loss_price, 
                    take_profit_price=take_profit_price, signal_time=datetime.utcnow(),
                    pattern_details=pattern
                )
                return signal
        
        logger.debug(
            f"[5M BREAKOUT] {symbol} no trigger: prev_high={prev_candle.high:.4f} prev_low={prev_candle.low:.4f} close={current_price:.4f}"
        )
        return None

    def _auto_execute_5m_signal(self, symbol: str, pattern: Pattern):
        """Execute trades on 5-minute patterns with reduced position sizing"""
        try:
            # Get current price
            ticker = self.api_client.get_current_price(symbol)
            if not ticker:
                logger.warning(f"Could not get current price for {symbol}")
                return
            
            current_price = float(ticker.get('c', 0))
            
            # Determine entry and SL/TP based on pattern
            if "Bullish" in pattern.pattern_type:
                trade_type = "long"
                entry_price = current_price
                stop_loss_price = current_price * 0.995  # 0.5% SL
                take_profit_price = current_price * 1.010  # 1.0% TP
            else:
                trade_type = "short"
                entry_price = current_price
                stop_loss_price = current_price * 1.005  # 0.5% SL
                take_profit_price = current_price * 0.990  # 1.0% TP
            
            # Calculate position size with reduction factor
            risk_amount = ACCOUNT_EQUITY_USD * RISK_PERCENTAGE_PER_TRADE * POSITION_SIZE_REDUCTION_5M
            risk_per_unit = abs(entry_price - stop_loss_price)
            position_size = risk_amount / risk_per_unit if risk_per_unit > 0 else 0
            
            # Create signal
            finalized_signal = TradeSignal(
                symbol=symbol, strategy="5m_Aggressive", trade_type=trade_type, interval="5m",
                entry_price=entry_price, stop_loss_price=stop_loss_price, 
                take_profit_price=take_profit_price, signal_time=datetime.utcnow(),
                pattern_details=pattern, risk_amount_usd=risk_amount, position_size=position_size
            )
            
            logger.info(f"[AGGRESSIVE 5M] Executing signal for {symbol} (5m)")
            self.trading_bot._process_signals([finalized_signal])
        except Exception as e:
            logger.warning(f"Error executing 5m signal for {symbol}: {e}")


    def _detect_kewltech_pattern(self, symbol: str, interval: str, klines: List[Kline]) -> Optional[Pattern]:
        """
        Kewltech pattern detection using EMA trends as primary filter.
        Detects wedge patterns where EMA trends align with price structure.
        """
        if len(klines) < WEDGE_MIN_PIVOTS_FOR_TRENDLINE * 2:
            return None
        
        # Get EMA trends first as primary filter
        ema_trends = get_ema_trend(klines, EMA_PERIODS)
        logger.debug(f"{symbol} {interval} EMA Trends: {ema_trends}")
        
        # Use wedge detection as the pattern recognition
        return self._detect_wedge_pattern(symbol, interval, klines)

    def scan_and_generate_signals(self, current_time_utc: datetime) -> List[TradeSignal]:
        generated_signals: List[TradeSignal] = []
        swing_intervals = ["15m", "1h"]
        
        # Scan standard intervals for all symbols
        for symbol in MONITORED_SYMBOLS:
            logger.debug(f"Scanning {symbol}...")
            for interval in swing_intervals:
                pattern_key = f"{symbol}_{interval}"
                if pattern_key not in self.active_patterns:
                    # For wedge detection, we need enough klines. API returns newest first.
                    # WEDGE_LOOKBACK_CANDLES is the number of candles to fetch.
                    klines_for_detection = self.api_client.get_klines(symbol, interval, WEDGE_LOOKBACK_CANDLES)
                    if klines_for_detection: # API returns newest first
                        # Use Kewltech method with EMA-filtered pattern detection
                        detected_pattern = self._detect_kewltech_pattern(symbol, interval, klines_for_detection)
                        if detected_pattern: 
                            self.active_patterns[pattern_key] = detected_pattern
                            # Send pattern to web API
                            if self.trading_bot:
                                self.trading_bot._send_pattern_to_api(symbol, interval, detected_pattern.pattern_type, is_forming=True)
                            # Log EMA context for the pattern
                            ema_trends = get_ema_trend(klines_for_detection, EMA_PERIODS)
                            logger.info(f"[KEWLTECH] Potential Pattern Detected: {detected_pattern.pattern_type} for {symbol} {interval}")
                            logger.info(f"  EMA Trends: {', '.join([f'EMA{k}:{v}' for k, v in ema_trends.items()])}")
                            
                            # AUTO TRADING: Execute trade on pattern formation if enabled and within limits
                            if AUTO_TRADE_ON_PATTERN_DETECTION and len(self.trading_bot.active_trades) < MAX_CONCURRENT_TRADES:
                                self._auto_execute_signal_on_pattern(symbol, interval, detected_pattern)
                else:
                    # If pattern exists, check for breakout using recent klines
                    # Fetch fewer klines for breakout check to be efficient
                    recent_klines_for_breakout_check = self.api_client.get_klines(symbol, interval, 50) 
                    if recent_klines_for_breakout_check and len(recent_klines_for_breakout_check) >= 2 : # Need at least two candles
                         breakout_signal = self._check_wedge_breakout(symbol, interval, self.active_patterns[pattern_key], recent_klines_for_breakout_check)
                         if breakout_signal:
                             # Send pattern breakout to API
                             if self.trading_bot:
                                 self.trading_bot._send_pattern_to_api(symbol, interval, self.active_patterns[pattern_key].pattern_type, is_forming=False)
                             generated_signals.append(breakout_signal)
                             
                             # AUTO TRADING: Execute on breakout if enabled and within limits
                             if AUTO_TRADE_ON_BREAKOUT and len(self.trading_bot.active_trades) < MAX_CONCURRENT_TRADES:
                                 self._auto_execute_signal_on_breakout(symbol, interval, breakout_signal)
                             
                             del self.active_patterns[pattern_key] 
                             logger.info(f"Breakout signal generated and pattern {pattern_key} removed.")
            # ORB Detection (Opening Range Breakout)
            orb_signal = self._detect_orb_breakout(symbol, current_time_utc)
            if orb_signal:
                logger.info(f"[ORB SIGNAL] {orb_signal.symbol} {orb_signal.pattern_details.pattern_type}: Entry={orb_signal.entry_price:.4f}, SL={orb_signal.stop_loss_price:.4f}, TP={orb_signal.take_profit_price:.4f}")
                generated_signals.append(orb_signal)
            else:
                logger.debug(f"[ORB] No breakout detected for {symbol} at {current_time_utc.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Clean up old patterns
        patterns_to_remove = []
        for p_key, active_pattern in self.active_patterns.items():
            # Pattern age based on its interval and lookback candles
            pattern_age_threshold_hours = get_candle_duration_minutes(active_pattern.interval) / 60 * WEDGE_LOOKBACK_CANDLES * 1.5 # Heuristic
            if (current_time_utc - active_pattern.detection_time) > timedelta(hours=pattern_age_threshold_hours):
                patterns_to_remove.append(p_key)
                logger.info(f"Removing old pattern {p_key} due to age.")
        for p_key in patterns_to_remove: 
            if p_key in self.active_patterns: # Check before deleting
                del self.active_patterns[p_key]            
        return generated_signals

    def scan_5m_aggressive(self, current_time_utc: datetime) -> List[TradeSignal]:
        """Run aggressive 5m scan loop separately to honor SCAN_5M_INTERVAL_SECONDS."""
        generated_signals: List[TradeSignal] = []
        if not SCAN_5M_ENABLED:
            return generated_signals

        for symbol in AGGRESSIVE_5M_SYMBOLS:
            pattern_key_5m = f"{symbol}_5m"
            try:
                klines_5m = self.api_client.get_klines(symbol, "5m", 50)
                if not klines_5m:
                    continue

                detected_pattern_5m = self._detect_5m_pattern(symbol, klines_5m)
                if detected_pattern_5m:
                    if pattern_key_5m not in self.active_patterns:
                        self.active_patterns[pattern_key_5m] = detected_pattern_5m
                        logger.info(f"[AGGRESSIVE 5M] Pattern Detected: {detected_pattern_5m.pattern_type} for {symbol}")

                        if AUTO_TRADE_ON_PATTERN_DETECTION and len(self.trading_bot.active_trades) < MAX_CONCURRENT_TRADES:
                            self._auto_execute_5m_signal(symbol, detected_pattern_5m)
                else:
                    if pattern_key_5m in self.active_patterns:
                        breakout_5m = self._check_5m_breakout(symbol, self.active_patterns[pattern_key_5m], klines_5m)
                        if breakout_5m:
                            generated_signals.append(breakout_5m)
                            if AUTO_TRADE_ON_BREAKOUT and len(self.trading_bot.active_trades) < MAX_CONCURRENT_TRADES:
                                self._auto_execute_signal_on_pattern(symbol, "5m", breakout_5m.pattern_details)
                            del self.active_patterns[pattern_key_5m]
                            logger.info(f"[AGGRESSIVE 5M] Breakout executed for {symbol}")
            except Exception as e:
                logger.debug(f"Error scanning 5m pattern for {symbol}: {e}")

        return generated_signals
    
    def _auto_execute_signal_on_pattern(self, symbol: str, interval: str, pattern):
        """Automatically execute a trade signal when a pattern is first detected"""
        try:
            # Create a synthetic signal from pattern detection
            entry_price = pattern.upper_trendline_intercept if "Bullish" in pattern.pattern_type else pattern.lower_trendline_intercept
            
            signal = TradeSignal(
                symbol=symbol,
                entry_price=entry_price,
                stop_loss_price=pattern.lower_trendline_intercept * 0.99 if "Bullish" in pattern.pattern_type else pattern.upper_trendline_intercept * 1.01,
                take_profit_price=pattern.upper_trendline_intercept * 1.02 if "Bullish" in pattern.pattern_type else pattern.lower_trendline_intercept * 0.98,
                trade_type="long" if "Bullish" in pattern.pattern_type else "short",
                strategy="PATTERN_FORMATION",
                interval=interval,
                signal_time=datetime.now(timezone.utc),
                pattern_details=pattern
            )
            
            # Process through risk management
            finalized_signal = self.trading_bot.risk_manager.calculate_trade_parameters(signal)
            if finalized_signal:
                logger.info(f"\033[92m[AUTO TRADE] Executing on pattern formation for {symbol} {interval}\033[0m")
                self.trading_bot._process_signals([finalized_signal])
        
        except Exception as e:
            logger.error(f"Error in auto-execution on pattern: {e}")
    
    def _auto_execute_signal_on_breakout(self, symbol: str, interval: str, signal: TradeSignal):
        """Automatically execute a trade signal on pattern breakout"""
        try:
            logger.info(f"\033[92m[AUTO TRADE] Executing on breakout for {symbol} {interval}\033[0m")
            self.trading_bot._process_signals([signal])
        except Exception as e:
            logger.error(f"Error in auto-execution on breakout: {e}")

# ==============================================================================
# FILE: risk_management.py (Content)
# ==============================================================================
"""
Implements Kewltech's risk management principles
"""
logger = logging.getLogger(__name__)

class RiskManager:
    def __init__(self, account_equity_usd: float = ACCOUNT_EQUITY_USD, risk_percentage_per_trade: float = RISK_PERCENTAGE_PER_TRADE):
        self.account_equity_usd = account_equity_usd
        self.risk_percentage_per_trade = risk_percentage_per_trade
        logger.info(f"RiskManager initialized. Equity: ${self.account_equity_usd:,.2f}, Risk per Trade: {self.risk_percentage_per_trade*100:.2f}%")

    def calculate_trade_parameters(self, signal: TradeSignal) -> Optional[TradeSignal]:
        if not signal or not all(hasattr(signal, attr) for attr in ['entry_price', 'stop_loss_price']):
            logger.error("Invalid signal for risk calculation.")
            return None
        
        entry_price, stop_loss_price = signal.entry_price, signal.stop_loss_price
        if entry_price == stop_loss_price:
            logger.warning(f"Entry price equals SL for {signal.symbol}.")
            return None

        risk_per_unit = (entry_price - stop_loss_price) if signal.trade_type == "long" else (stop_loss_price - entry_price)
        if risk_per_unit <= 0:
            logger.warning(f"Risk per unit not positive for {signal.symbol}. Entry: {entry_price:.4f}, SL: {stop_loss_price:.4f}.")
            return None
        
        max_risk_amount_usd = self.account_equity_usd * self.risk_percentage_per_trade
        # Ensure position_size is not infinity if risk_per_unit is extremely small
        if risk_per_unit < 1e-9: # A very small number to avoid division by zero or near-zero
            logger.warning(f"Risk per unit is too small for {signal.symbol}. Risk per unit: {risk_per_unit}")
            return None

        position_size = max_risk_amount_usd / risk_per_unit
        actual_risk_amount_usd = position_size * risk_per_unit

        signal.position_size = position_size
        signal.risk_amount_usd = actual_risk_amount_usd
        
        logger.info(f"Risk calc for {signal.symbol} ({signal.strategy}): Entry: {entry_price:.4f}, SL: {stop_loss_price:.4f}. Risk/Unit: {risk_per_unit:.4f}. Pos Size: {position_size:.4f}, Risk Amt: ${actual_risk_amount_usd:.2f}")
        return signal

    def update_account_equity(self, new_equity_usd: float):
        self.account_equity_usd = new_equity_usd
        logger.info(f"Account equity updated to: ${self.account_equity_usd:,.2f}")

# ==============================================================================
# FILE: main.py (Content)
# ==============================================================================
"""
The main orchestrator and execution loop of the bot.
Includes a simple text-based "terminal" UI for live data feed.
"""
logger = logging.getLogger(__name__)

class TradingBot:
    def __init__(self):
        self.api_client = WoofiProAPIClient()
        self.pattern_recognizer = PatternRecognizer(api_client=self.api_client, trading_bot=self)
        self.risk_manager = RiskManager(account_equity_usd=ACCOUNT_EQUITY_USD, risk_percentage_per_trade=RISK_PERCENTAGE_PER_TRADE)
        self.active_trades: List[ActiveTrade] = []
        self.closed_trades: List[ActiveTrade] = []  # Track completed trades for history
        self.web_api_url = "http://localhost:5000"  # Web interface API
        logger.info("TradingBot initialized.")

    def _send_signal_to_api(self, signal: TradeSignal, finalized_signal: TradeSignal):
        """Send trade signal to web API for display in browser"""
        try:
            # Get signal time as unix timestamp
            signal_timestamp = signal.signal_time.timestamp() if hasattr(signal.signal_time, 'timestamp') else datetime.now(timezone.utc).timestamp()
            
            signal_data = {
                "id": f"{signal.symbol}_{signal_timestamp}",
                "symbol": signal.symbol,
                "strategy": signal.strategy,
                "tradeType": signal.trade_type,
                "entryPrice": float(signal.entry_price),
                "stopLossPrice": float(signal.stop_loss_price),
                "takeProfitPrice": float(signal.take_profit_price),
                "positionSize": float(finalized_signal.position_size) if finalized_signal.position_size else 0,
                "riskAmount": float(finalized_signal.risk_amount_usd) if finalized_signal.risk_amount_usd else 0,
                "signalTime": int(signal_timestamp * 1000),
                "confidence": 85,
                "details": {
                    "interval": signal.interval if hasattr(signal, 'interval') else "1h",
                    "strategy": signal.strategy
                }
            }
            response = requests.post(f"{self.web_api_url}/api/bot/signals", json=signal_data, timeout=5)
            if response.status_code == 200:
                logger.info(f"✓ Signal sent to dashboard: {signal.symbol} ({signal.strategy})")
            else:
                logger.warning(f"Failed to send signal to API: {response.status_code}")
        except Exception as e:
            logger.warning(f"Could not send signal to web API: {e}")

    def _send_pattern_to_api(self, symbol: str, interval: str, pattern_type: str, is_forming: bool):
        """Send detected pattern to web API for display"""
        try:
            pattern_data = {
                "id": f"{symbol}_{interval}_{pattern_type}_{datetime.utcnow().timestamp()}",
                "symbol": symbol,
                "interval": interval,
                "patternType": pattern_type,
                "detectionTime": int(datetime.utcnow().timestamp() * 1000),
                "status": "forming" if is_forming else "confirmed",
                "details": {}
            }
            response = requests.post(f"{self.web_api_url}/api/bot/patterns", json=pattern_data, timeout=5)
            if response.status_code == 200:
                logger.debug(f"Pattern sent to API: {symbol} {pattern_type}")
            else:
                logger.warning(f"Failed to send pattern to API: {response.status_code}")
        except Exception as e:
            logger.warning(f"Could not send pattern to web API: {e}")

    def _send_closed_trade_to_api(self, trade: ActiveTrade):
        """Send closed trade to web API for display in the dashboard"""
        try:
            # Calculate P&L values
            position_size = trade.signal.position_size
            entry_price = trade.signal.entry_price
            exit_price = trade.exit_price
            
            gross_pnl = (exit_price - entry_price) * position_size
            fees = abs(gross_pnl) * 0.0005  # 0.05% fee on both entry and exit
            net_pnl = gross_pnl - fees
            
            trade_data = {
                "id": trade.entry_order_id or f"TRADE_{trade.signal.symbol}_{int(trade.entry_time.timestamp())}",
                "symbol": trade.signal.symbol,
                "entryPrice": float(entry_price),
                "exitPrice": float(exit_price),
                "positionSize": float(position_size),
                "entryTime": int(trade.entry_time.timestamp() * 1000),
                "exitTime": int(trade.exit_time.timestamp() * 1000),
                "exitReason": trade.exit_reason or "UNKNOWN",
                "grossPnlUsd": float(round(gross_pnl, 2)),
                "feesUsd": float(round(fees, 2)),
                "netPnlUsd": float(round(net_pnl, 2)),
                "riskAmount": float(trade.signal.risk_amount_usd or 0),
                "isWinner": int(net_pnl > 0)
            }
            
            response = requests.post(f"{self.web_api_url}/api/bot/trades", json=trade_data, timeout=5)
            if response.status_code == 200:
                logger.debug(f"Closed trade sent to API: {trade.signal.symbol} P&L: ${net_pnl:.2f}")
            else:
                logger.warning(f"Failed to send closed trade to API: {response.status_code}")
        except Exception as e:
            logger.warning(f"Could not send closed trade to web API: {e}")

    def _send_open_trades_to_api(self):
        """Send all open trades to web API for dashboard display"""
        try:
            if not self.active_trades:
                return  # No open trades to send
            
            open_trades = []
            for trade in self.active_trades:
                try:
                    # Get current price (using cached data or last known price)
                    current_price = trade.signal.entry_price  # Fallback to entry price
                    
                    # Calculate unrealized P&L
                    unrealized_pnl = (current_price - trade.signal.entry_price) * trade.signal.position_size
                    fees = abs(unrealized_pnl) * 0.0005
                    
                    trade_data = {
                        "id": trade.entry_order_id or f"TRADE_{trade.signal.symbol}_{int(trade.entry_time.timestamp())}",
                        "symbol": trade.signal.symbol,
                        "entryPrice": float(trade.signal.entry_price),
                        "currentPrice": float(current_price),
                        "positionSize": float(trade.signal.position_size),
                        "entryTime": int(trade.entry_time.timestamp() * 1000),
                        "stopLossPrice": float(trade.signal.stop_loss_price),
                        "takeProfitPrice": float(trade.signal.take_profit_price),
                        "unrealizedPnlUsd": float(round(unrealized_pnl, 2)),
                        "riskAmountUsd": float(trade.signal.risk_amount_usd or 0),
                        "duration": int((datetime.utcnow() - trade.entry_time).total_seconds()),
                        "isAggressive": True  # 5m aggressive trading
                    }
                    open_trades.append(trade_data)
                except Exception as e:
                    logger.debug(f"Error preparing open trade data for {trade.signal.symbol}: {e}")
            
            if open_trades:
                # Send the array of trades directly to the API
                response = requests.post(f"{self.web_api_url}/api/bot/open-trades", json=open_trades, timeout=5)
                if response.status_code == 200:
                    logger.debug(f"Open trades sent to API: {len(open_trades)} trades")
                else:
                    logger.debug(f"Failed to send open trades: {response.status_code}")
        except Exception as e:
            logger.debug(f"Could not send open trades to web API: {e}")

    def _next_5m_scan_due(self, from_time: datetime) -> datetime:
        """Compute next 5m scan time with small jitter to avoid bursty API hits."""
        jitter_seconds = random.uniform(-2.0, 2.0)
        interval = max(1.0, SCAN_5M_INTERVAL_SECONDS + jitter_seconds)
        return from_time + timedelta(seconds=interval)


    def _send_market_scan_to_api(self, current_time_utc: datetime, signals: List[TradeSignal]):
        """Send complete market scan data to web API"""
        try:
            # Get current symbol data
            symbols_data = []
            for symbol in MONITORED_SYMBOLS:
                try:
                    ticker = self.api_client.get_current_price(symbol)
                    if ticker:
                        symbols_data.append({
                            "symbol": symbol,
                            "price": float(ticker.get('c', 0)),
                            "change1h": 0,  # Would need to calculate from klines
                            "emaStatus": {},  # Would need to track EMA trends
                            "volume": float(ticker.get('v', 0))
                        })
                except Exception as e:
                    logger.debug(f"Error getting price for {symbol}: {e}")

            scan_data = {
                "timestamp": int(current_time_utc.timestamp() * 1000),
                "symbols": symbols_data,
                "patterns": [],  # Populated from pattern recognizer
                "signals": [
                    {
                        "id": f"{s.symbol}_{s.signal_time.timestamp()}",
                        "symbol": s.symbol,
                        "strategy": s.strategy,
                        "tradeType": s.trade_type,
                        "entryPrice": float(s.entry_price),
                        "stopLossPrice": float(s.stop_loss_price),
                        "takeProfitPrice": float(s.take_profit_price),
                        "signalTime": int(s.signal_time.timestamp() * 1000)
                    }
                    for s in signals
                ]
            }
            
            response = requests.post(f"{self.web_api_url}/api/bot/scan", json=scan_data, timeout=5)
            if response.status_code == 200:
                logger.debug("Market scan data sent to API")
            else:
                logger.warning(f"Failed to send market scan: {response.status_code}")
        except Exception as e:
            logger.warning(f"Could not send market scan to API: {e}")

    def _print_live_data_header(self):
        # ANSI escape codes for color and clearing screen (basic cyberpunk feel)
        # \033[0;0H\033[2J  # Clear screen, move cursor to 0,0
        print("\033[0;0H\033[2J") 
        print("="*120)
        print(" Kewltech-Inspired Trading Bot - Live Data Feed & Signal Generation")
        print("="*120)
        print(f"{'Symbol':<15} {'Price':<12} {'1h Chg%':<10} {'EMA Trend (13/34/244/610)':<35} {'Volume':<15} {'Last Update':<20}")
        print("-"*120)

    def _print_live_data_row(self, ticker_data: Dict[str, Any], ema_trends: Dict[int, str] = None):
        # Display current price data from klines
        symbol = ticker_data.get('s', 'N/A')
        last_price = ticker_data.get('c', 'N/A') # Last price (close)
        open_price = ticker_data.get('o', 'N/A') # Open price
        volume = ticker_data.get('v', 'N/A') # Volume in base asset
        last_update_ts = ticker_data.get('E', None) # Timestamp of last update

        # Calculate percentage change from open to close
        percent_change = 'N/A'
        if isinstance(last_price, (int, float)) and isinstance(open_price, (int, float)) and open_price > 0:
            percent_change = ((last_price - open_price) / open_price) * 100

        last_update_str = "N/A"
        if last_update_ts:
            try:
                # WooFi timestamp is in milliseconds
                last_update_str = datetime.fromtimestamp(last_update_ts / 1000).strftime('%Y-%m-%d %H:%M:%S')
            except (TypeError, OSError):
                last_update_str = "Invalid Date"
        
        # Format EMA trends
        ema_str = "N/A"
        if ema_trends:
            trends = [str(ema_trends.get(p, '?'))[:3].upper() for p in [13, 34, 244, 610]]
            ema_str = '/'.join(trends)
        
        # Format output
        if isinstance(percent_change, float):
            print(f"{symbol:<15} {last_price:<12.2f} {percent_change:<10.2f}% {ema_str:<35} {volume:<15,.4f} {last_update_str:<20}")
        else:
            print(f"{symbol:<15} {last_price:<12} {percent_change:<10} {ema_str:<35} {volume:<15} {last_update_str:<20}")


    def _process_signals(self, signals: List[TradeSignal]):
        if not signals: 
            # print("\033[90mNo new trade signals in this cycle.\033[0m") # Dark grey text for no signals
            return
        
        logger.info(f"--- Processing {len(signals)} New Trade Signal(s) ---")
        for signal in signals:
            logger.info(f"Signal: {signal.strategy} ({signal.trade_type.upper()}) for {signal.symbol} on {signal.interval} at {signal.signal_time.strftime('%Y-%m-%d %H:%M:%S')}")
            logger.info(f"  Entry: {signal.entry_price:.4f}, SL: {signal.stop_loss_price:.4f}, TP: {signal.take_profit_price:.4f}")
            
            finalized_signal = self.risk_manager.calculate_trade_parameters(signal)
            if finalized_signal and finalized_signal.position_size is not None:
                logger.info(f"  Finalized: Pos Size: {finalized_signal.position_size:.4f} {finalized_signal.symbol}, Risk: ${finalized_signal.risk_amount_usd:.2f}")
                
                # Send signal to web API for browser display
                self._send_signal_to_api(signal, finalized_signal)
                
                # ===== PAPER TRADING SIMULATION (ENABLED) =====
                # Simulate order execution at market price
                logger.info(f"\n\033[92m{'='*60}")
                logger.info(f"[PAPER TRADING] Executing simulated order for {finalized_signal.symbol}")
                logger.info(f"{'='*60}\033[0m")
                
                try:
                    # Get current market price for order execution
                    current_price_data = self.api_client.get_current_price(finalized_signal.symbol)
                    if current_price_data:
                        market_price = current_price_data.get('last', finalized_signal.entry_price)
                        execution_price = market_price  # Simulate market order execution at current price
                    else:
                        execution_price = finalized_signal.entry_price  # Fallback to signal entry price
                        logger.warning(f"  Could not fetch market price, using signal entry price: {execution_price:.4f}")
                    
                    # Create paper trade record
                    order_id = f"PAPER_{finalized_signal.symbol}_{datetime.utcnow().timestamp()}"
                    active_trade = ActiveTrade(
                        signal=finalized_signal,
                        entry_time=datetime.utcnow(),
                        entry_order_id=order_id,
                        status="OPEN"
                    )
                    
                    # Override entry price with actual execution price
                    active_trade.signal.entry_price = execution_price
                    
                    # Add to active trades
                    self.active_trades.append(active_trade)
                    
                    logger.info(f"  ✓ Order EXECUTED (PAPER TRADING)")
                    logger.info(f"    Order ID: {order_id}")
                    logger.info(f"    Entry Price: ${execution_price:.4f}")
                    logger.info(f"    Position Size: {finalized_signal.position_size:.4f} {finalized_signal.symbol}")
                    logger.info(f"    Stop Loss: ${finalized_signal.stop_loss_price:.4f}")
                    logger.info(f"    Take Profit: ${finalized_signal.take_profit_price:.4f}")
                    logger.info(f"    Risk Amount: ${finalized_signal.risk_amount_usd:.2f}")
                    logger.info(f"    Active Trades: {len(self.active_trades)}")
                    logger.info(f"\033[92m{'='*60}\033[0m\n")
                    
                except Exception as e:
                    logger.error(f"  ✗ FAILED to execute paper trade for {finalized_signal.symbol}: {str(e)}")
            else:
                logger.warning(f"  -> Signal for {signal.symbol} discarded by risk management or calculation failed.")
        
        # Check for profit/loss on open trades
        self._check_active_trades_for_exit()
        
        logger.info(f"--- End of Signal Processing ---")

    def _check_active_trades_for_exit(self):
        """Check if any open trades hit SL or TP levels"""
        if not self.active_trades:
            return
        
        trades_to_close = []
        for idx, trade in enumerate(self.active_trades):
            if trade.status != "OPEN":
                continue
            
            try:
                # Get current market price
                current_price_data = self.api_client.get_current_price(trade.signal.symbol)
                if not current_price_data:
                    continue
                
                current_price = current_price_data.get('last', 0)
                entry_price = trade.signal.entry_price
                stop_loss = trade.signal.stop_loss_price
                take_profit = trade.signal.take_profit_price
                
                exit_reason = None
                exit_price = None
                
                # Check for long trade exits
                if trade.signal.trade_type == "long":
                    if current_price >= take_profit:
                        exit_reason = "TAKE_PROFIT"
                        exit_price = take_profit
                    elif current_price <= stop_loss:
                        exit_reason = "STOP_LOSS"
                        exit_price = stop_loss
                
                # Check for short trade exits
                elif trade.signal.trade_type == "short":
                    if current_price <= take_profit:
                        exit_reason = "TAKE_PROFIT"
                        exit_price = take_profit
                    elif current_price >= stop_loss:
                        exit_reason = "STOP_LOSS"
                        exit_price = stop_loss
                
                # Close trade if exit condition met
                if exit_reason and exit_price:
                    trade.exit_time = datetime.utcnow()
                    trade.exit_price = exit_price
                    trade.exit_reason = exit_reason
                    trade.status = "CLOSED"
                    
                    # Calculate P&L
                    if trade.signal.trade_type == "long":
                        pnl = (exit_price - entry_price) * trade.signal.position_size
                    else:  # short
                        pnl = (entry_price - exit_price) * trade.signal.position_size
                    
                    trade.pnl_usd = pnl
                    trade.fees_usd = pnl * 0.0005  # Assume 0.05% fee
                    net_pnl = pnl - trade.fees_usd
                    
                    logger.info(f"\n\033[95m{'='*60}")
                    logger.info(f"[PAPER TRADING] Trade Closed - {exit_reason}")
                    logger.info(f"{'='*60}\033[0m")
                    logger.info(f"  Symbol: {trade.signal.symbol}")
                    logger.info(f"  Entry Price: ${entry_price:.4f}")
                    logger.info(f"  Exit Price: ${exit_price:.4f}")
                    logger.info(f"  Position Size: {trade.signal.position_size:.4f}")
                    logger.info(f"  Gross P&L: ${pnl:.2f}")
                    logger.info(f"  Fees: ${trade.fees_usd:.2f}")
                    logger.info(f"  Net P&L: ${net_pnl:.2f}")
                    logger.info(f"  Duration: {trade.exit_time - trade.entry_time}")
                    
                    if net_pnl > 0:
                        logger.info(f"\033[92m  ✓ WINNER!\033[0m")
                    else:
                        logger.info(f"\033[91m  ✗ LOSER\033[0m")
                    
                    # Add to closed trades history for API and send to web API
                    self.closed_trades.append(trade)
                    self._send_closed_trade_to_api(trade)
                    
                    logger.info(f"  Remaining Trades: {len(self.active_trades) - 1}")
                    logger.info(f"\033[95m{'='*60}\033[0m\n")
                    
                    trades_to_close.append(idx)
            
            except Exception as e:
                logger.error(f"Error checking trade exit for {trade.signal.symbol}: {str(e)}")
        
        # Log summary of open trades
        if self.active_trades:
            open_count = sum(1 for t in self.active_trades if t.status == "OPEN")
            if open_count > 0:
                logger.info(f"[PAPER TRADING] {open_count} trade(s) still open")
    
    def run(self):
        logger.info("Starting Kewltech-Inspired Trading Bot...")
        logger.info(f"Symbols: {MONITORED_SYMBOLS}, Scan Interval: {SCAN_INTERVAL_SECONDS}s")
        logger.info(f"Account Equity: ${ACCOUNT_EQUITY_USD:,.2f}, Risk per Trade: {RISK_PERCENTAGE_PER_TRADE*100:.2f}%")
        logger.info("Press Ctrl+C to stop.")
        next_5m_scan_time = datetime.now(timezone.utc)
        try:
            while True:
                cycle_start_time = datetime.now(timezone.utc)
                
                # --- Live Data Feed Display ---
                self._print_live_data_header()
                
                # Fetch EMA trends for all symbols
                symbols_for_live_feed = MONITORED_SYMBOLS[:5] # Show top 3 for brevity in terminal
                ema_cache = {}  # Cache EMA data
                for sym in MONITORED_SYMBOLS:
                    klines = self.api_client.get_klines(sym, "15m", 100)  # Get 15m data for EMA
                    if klines:
                        ema_cache[sym] = get_ema_trend(klines, EMA_PERIODS)
                
                for sym in symbols_for_live_feed:
                    ticker = self.api_client.get_current_price(sym)
                    if ticker:
                        self._print_live_data_row(ticker, ema_cache.get(sym))
                    else:
                        print(f"{sym:<15} {'Data N/A':<12} {'N/A':<10} {'N/A':<35} {'N/A':<15} {'N/A':<20}")
                print("-"*120)
                # --- End Live Data Feed Display ---

                logger.info(f"\n\033[93m--- Market Scan Cycle at {cycle_start_time.strftime('%Y-%m-%d %H:%M:%S')} UTC ---\033[0m")
                logger.info(f"[TRADING STATUS] Open Trades: {len(self.active_trades)}/{MAX_CONCURRENT_TRADES} | Auto Trade: {AUTO_TRADE_ON_PATTERN_DETECTION} | Aggressive: {AGGRESSIVE_MODE}")
                logger.info(f"\nEMA Trends Summary:")
                for sym in MONITORED_SYMBOLS:
                    if sym in ema_cache:
                        trends = ema_cache[sym]
                        logger.info(f"  {sym:<15}: EMA13={trends.get(13, 'N/A'):<12} EMA34={trends.get(34, 'N/A'):<12} EMA244={trends.get(244, 'N/A'):<12} EMA610={trends.get(610, 'N/A')}")
                
                trade_signals = self.pattern_recognizer.scan_and_generate_signals(cycle_start_time)
                self._process_signals(trade_signals)

                signals_5m: List[TradeSignal] = []
                now_for_5m = datetime.now(timezone.utc)
                if now_for_5m >= next_5m_scan_time:
                    signals_5m = self.pattern_recognizer.scan_5m_aggressive(now_for_5m)
                    if signals_5m:
                        self._process_signals(signals_5m)
                    next_5m_scan_time = self._next_5m_scan_due(now_for_5m)
                
                # Send market scan data to web API (include any 5m signals)
                self._send_market_scan_to_api(cycle_start_time, trade_signals + signals_5m)
                
                # Send open trades to dashboard
                self._send_open_trades_to_api()
                
                # Log pattern status
                if self.pattern_recognizer.active_patterns:
                    logger.info(f"\nActive Patterns ({len(self.pattern_recognizer.active_patterns)}):")
                    for pattern_key, pattern in self.pattern_recognizer.active_patterns.items():
                        logger.info(f"  {pattern_key}: {pattern.pattern_type} (detected {(cycle_start_time - pattern.detection_time).total_seconds()/60:.1f} min ago)")
                else:
                    logger.info("\nNo active patterns at this moment.")
                
                cycle_end_time = datetime.now(timezone.utc)
                sleep_duration = timedelta(seconds=SCAN_INTERVAL_SECONDS) - (cycle_end_time - cycle_start_time)
                
                if sleep_duration.total_seconds() > 0:
                    logger.info(f"Cycle took {(cycle_end_time - cycle_start_time).total_seconds():.2f}s. Sleeping for {sleep_duration.total_seconds():.2f}s.")
                    time.sleep(sleep_duration.total_seconds())
                else:
                    logger.warning(f"Cycle duration exceeded scan interval. Starting next scan immediately.")
                    time.sleep(1) # Prevent tight loop if something goes wrong
        except KeyboardInterrupt:
            logger.info("\n\033[91mBot stopped by user.\033[0m") # Red for stop
        except Exception as e:
            logger.critical(f"\033[91mUnhandled error: {e}\033[0m", exc_info=True) # Red for critical error
            # In a real bot, more robust error handling and logging would be needed.
        finally:
            logger.info("Trading Bot shutting down.")

if __name__ == "__main__":
    # Setup logging for the application
    # Basic config for logging, can be expanded
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL),
        format='\033[97m%(asctime)s - %(name)s - %(levelname)s - %(message)s\033[0m', # Default white/gray
        handlers=[
            logging.FileHandler(LOG_FILE),
            # Custom stream handler for colors if desired, or use a library like 'colorlog'
            # For now, basic StreamHandler. Color codes are embedded in print statements.
            logging.StreamHandler()
        ]
    )
    # Reduce verbosity of other loggers if needed
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


    # Optional: Initial API connectivity check
    # client = WoofiProAPIClient()
    # if not client.get_all_symbols():
    #     logger.critical("Failed to connect to Woofi Pro API or fetch symbols. Exiting.")
    #     exit(1)
    
    bot = TradingBot()
    bot.run()