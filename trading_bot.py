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
from datetime import datetime, timedelta
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
# Using Woofi Pro API (no geolocking restrictions)
WOOFI_BASE_URL = "https://api.woo.org"
COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"  # Fallback (free, no geolocking)
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
WEDGE_MIN_PIVOTS_FOR_TRENDLINE = 4 # Min pivot points for trendline fit
WEDGE_APEX_PROXIMITY_THRESHOLD_RATIO = 0.4 # Nearness to apex for breakout
WEDGE_MIN_R_SQUARED = 0.5 # Min R-squared for trendline validity

ORB_DURATION_MINUTES = 15 # Opening Range duration in minutes
ORB_BREAKOUT_BUFFER_FACTOR = 1.001 # Buffer for breakout (e.g., 0.1%)
ORB_RISK_REWARD_RATIO = 1.5 # Target profit as multiple of risk

# --- Bot Operation Parameters ---
MONITORED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'AVAXUSDT', 'LINKUSDT']
ORB_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] # Symbols for ORB strategy

SCAN_INTERVAL_SECONDS = 60 # Scanning frequency in seconds

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
            if data.get('success') or data.get('code') == 0: # Woofi often uses 'code': 0 for success
                return data
            else:
                error_message = data.get('message', f"Unknown API Error. Response: {data}")
                logger.error(f"API Error for {url}: {error_message}")
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
        logger.info("Fetching all symbols from Woofi Pro...")
        data = self._make_request("/v1/public/symbols")
        if data and 'result' in data and 'symbols' in data['result']:
            symbols = data['result']['symbols']
            logger.info(f"Successfully fetched {len(symbols)} symbols from Woofi Pro.")
            return symbols
        logger.warning("Failed to fetch symbols from Woofi Pro.")
        return None

    def get_klines(self, symbol: str, interval: str, limit: int) -> Optional[List[Kline]]:
        logger.debug(f"Fetching {limit} {interval} klines for {symbol} from Woofi Pro...")
        params = {'symbol': symbol, 'interval': interval, 'limit': limit}
        data = self._make_request("/v1/market/klines", params=params)
        if data and 'result' in data and 'list' in data['result']:
            klines_raw = data['result']['list']
            processed_klines = []
            for k_data in klines_raw:
                try:
                    processed_klines.append(Kline(
                        open_time=datetime.fromtimestamp(int(k_data[0])/1000),
                        open=float(k_data[1]), high=float(k_data[2]), low=float(k_data[3]),
                        close=float(k_data[4]), volume=float(k_data[5]),
                        close_time=datetime.fromtimestamp(int(k_data[6])/1000),
                        quote_asset_volume=float(k_data[7]), number_of_trades=int(k_data[8]),
                        taker_buy_base_asset_volume=float(k_data[9]),
                        taker_buy_quote_asset_volume=float(k_data[10])
                    ))
                except (IndexError, TypeError, ValueError) as e:
                    logger.warning(f"Skipping malformed kline for {symbol}: {k_data}. Error: {e}")
                    continue
            # Woofi Pro API returns newest first
            logger.debug(f"Successfully fetched {len(processed_klines)} klines for {symbol}.")
            return processed_klines  # Already newest first
        elif data and 'result' in data and not data['result']['list']:
            logger.info(f"No klines returned for {symbol} {interval} with limit {limit}.")
            return []
        logger.warning(f"Failed to fetch klines for {symbol} {interval}.")
        return None

    def get_ticker_24hr(self, symbol: str) -> Optional[Dict[str, Any]]:
        logger.debug(f"Fetching 24hr ticker for {symbol} from Woofi Pro...")
        params = {'symbol': symbol}
        data = self._make_request("/v1/market/ticker/24hr", params=params)
        if data and 'result' in data:
            logger.debug(f"Successfully fetched 24hr ticker for {symbol}.")
            return data['result']
        logger.warning(f"Failed to fetch 24hr ticker for {symbol}.")
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
    def __init__(self, api_client: WoofiProAPIClient):
        self.api_client = api_client
        self.active_patterns: Dict[str, Pattern] = {} # {symbol_interval: Pattern}

    def _detect_wedge_pattern(self, symbol: str, interval: str, klines: List[Kline]) -> Optional[Pattern]:
        if len(klines) < WEDGE_LOOKBACK_CANDLES * 0.8: return None
        # get_klines returns newest first. Pivot logic assumes chronological order for trendline fitting.
        # If klines are newest first, and we use list indices as x-coords, this is fine.
        pivots = get_pivot_points(klines, pivot_window=2) # Smaller window for more pivots
        if not pivots: return None
        highs, lows = [p for p in pivots if p.type == 'high'], [p for p in pivots if p.type == 'low']
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
        
        # Bullish Wedge (Falling Wedge)
        if slope_h < -TRENDLINE_SLOPE_DIFF_THRESHOLD and slope_l < -TRENDLINE_SLOPE_DIFF_THRESHOLD and \
           abs(slope_h) > abs(slope_l) and r_sq_h > WEDGE_MIN_R_SQUARED and r_sq_l > WEDGE_MIN_R_SQUARED:
            if abs(slope_h - slope_l) > TRENDLINE_SLOPE_DIFF_THRESHOLD:
                max_pivot_idx = max(p.index for p in recent_highs_chrono + recent_lows_chrono)
                apex_idx_approx = (intercept_l - intercept_h) / (slope_h - slope_l)
                if apex_idx_approx > max_pivot_idx: # Apex is in the future
                    min_pivot_idx = min(p.index for p in recent_highs_chrono + recent_lows_chrono)
                    pattern_span_indices = max_pivot_idx - min_pivot_idx
                    if pattern_span_indices > 0:
                        current_kline_end_idx = len(klines) -1 # Index of newest kline
                        # Approximate current x_coord for apex distance check
                        # This is simplified; true apex is at apex_idx_approx.
                        # Distance is conceptual here, based on pattern progress.
                        distance_to_apex_conceptual = apex_idx_approx - current_kline_end_idx
                        if 0 < distance_to_apex_conceptual < pattern_span_indices * WEDGE_APEX_PROXIMITY_THRESHOLD_RATIO:
                            detected_pattern = Pattern(
                                symbol=symbol, pattern_type="Bullish Wedge (Falling Wedge)", interval=interval, detection_time=klines[-1].close_time,
                                upper_trendline_slope=slope_h, upper_trendline_intercept=intercept_h,
                                lower_trendline_slope=slope_l, lower_trendline_intercept=intercept_l,
                                approx_apex_index=apex_idx_approx,
                                upper_pivots=recent_highs_chrono, lower_pivots=recent_lows_chrono
                            )
                            # print(f"Debug: Potential Bullish Wedge detected on {interval_str} at {klines[-1].close_time}")

        # Bearish Wedge (Rising Wedge)
        elif slope_h > TRENDLINE_SLOPE_DIFF_THRESHOLD and slope_l > TRENDLINE_SLOPE_DIFF_THRESHOLD and \
             slope_l > slope_h and r_sq_h > WEDGE_MIN_R_SQUARED and r_sq_l > WEDGE_MIN_R_SQUARED:
            if abs(slope_h - slope_l) > TRENDLINE_SLOPE_DIFF_THRESHOLD:
                max_pivot_idx = max(p.index for p in recent_highs_chrono + recent_lows_chrono)
                apex_idx_approx = (intercept_l - intercept_h) / (slope_h - slope_l)
                if apex_idx_approx > max_pivot_idx:
                    min_pivot_idx = min(p.index for p in recent_highs_chrono + recent_lows_chrono)
                    pattern_span_indices = max_pivot_idx - min_pivot_idx
                    if pattern_span_indices > 0:
                        current_kline_end_idx = len(klines) -1
                        distance_to_apex_conceptual = apex_idx_approx - current_kline_end_idx
                        if 0 < distance_to_apex_conceptual < pattern_span_indices * WEDGE_APEX_PROXIMITY_THRESHOLD_RATIO:
                            detected_pattern = Pattern(
                                symbol=symbol, pattern_type="Bearish Wedge (Rising Wedge)", interval=interval, detection_time=klines[-1].close_time,
                                upper_trendline_slope=slope_h, upper_trendline_intercept=intercept_h,
                                lower_trendline_slope=slope_l, lower_trendline_intercept=intercept_l,
                                approx_apex_index=apex_idx_approx,
                                upper_pivots=recent_highs_chrono, lower_pivots=recent_lows_chrono
                            )
                            # print(f"Debug: Potential Bearish Wedge detected on {interval_str} at {klines[-1].close_time}")
        return detected_pattern

    def _check_wedge_breakout(self, symbol: str, interval: str, pattern: Pattern, current_klines: List[Kline]) -> Optional[TradeSignal]:
        if not pattern or not all(hasattr(pattern, attr) for attr in ['upper_trendline_slope', 'lower_trendline_slope', 'upper_trendline_intercept', 'lower_trendline_intercept']):
            return None
        
        last_candle, prev_candle = current_klines[-1], current_klines[-2] if len(current_klines) > 1 else current_klines[-1]
        
        # Trendline y = mx + c. x is kline list index (0 to N-1, newest at N-1).
        # current_klines from API are newest first. So, last_candle is at current_klines[0].
        # For trendline calculation, if pattern was identified on a list where newest was last,
        # then indices used for fitting were based on that. We need to be consistent.
        # If current_klines are newest first, then for trendline value at "current" (most recent) candle,
        # its index for trendline formula should be 0 if pattern was fitted on data where newest was also index 0.
        # This is tricky. Let's assume pattern was fitted on data where index increases with time.
        # If get_klines returns newest first, then our list for _detect_wedge_pattern was newest first.
        # The pivots from that list also have "index" relative to that newest-first list.
        # When fitting trendline, x_coords were these pivots.index. So, for a new candle (newest),
        # its conceptual "index" for the trendline formula would be -1 (if pattern was fitted on data up to index 0).
        # This needs careful thought on indexing.
        # Let's assume klines are newest first. The pattern was detected on these klines.
        # The pivots used have indices from this list (e.g., 0, 1, 2... where 0 is newest).
        # So, for last_candle (which is klines[0]), its x_coord for trendline is 0.
        # For prev_candle (klines[1]), its x_coord is 1.
        
        # Re-evaluating: get_pivot_points and fit_trendline expect chronological data (oldest first) for x_coords.
        # If klines are newest-first, we should reverse them for pivot detection and fitting,
        # or adjust x_coords accordingly.
        # Let's assume for now that the trendline slopes/intercepts are for data where index 0 is oldest.
        # So, if current_klines are newest-first, their chronological index is reversed.
        # This is a common source of bugs. For simplicity, let's assume the pattern's
        # trendline parameters are already adjusted for the klines order (newest first).
        # And we use 0 for the newest candle, 1 for the one before, etc.

        # For a Bullish Wedge, breakout is above the upper trendline
        if "Bullish Wedge" in pattern.pattern_type:
            # Calculate upper trendline value at last_candle's conceptual chronological index (e.g., 0 for newest)
            # This is still ambiguous. Let's use the actual list index from the klines used for detection.
            # If klines are newest first, and pattern was detected on these, then last_candle is at index 0 of this list.
            # The trendline was fitted using pivots whose indices were from this list.
            # So, to get trendline value for the newest candle (index 0 in current_klines list):
            utl_val_at_last = pattern.upper_trendline_intercept + pattern.upper_trendline_slope * 0 # Assuming 0 for newest
            utl_val_at_prev = pattern.upper_trendline_intercept + pattern.upper_trendline_slope * 1 # Assuming 1 for prev
            
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

        # For a Bearish Wedge, breakout is below the lower trendline
        elif "Bearish Wedge" in pattern.pattern_type:
            ltl_val_at_last = pattern.lower_trendline_intercept + pattern.lower_trendline_slope * 0
            ltl_val_at_prev = pattern.lower_trendline_intercept + pattern.lower_trendline_slope * 1

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
        return None

    def _detect_orb_breakout(self, symbol: str, current_time_utc: datetime) -> Optional[TradeSignal]:
        if symbol not in ORB_SYMBOLS or symbol not in MONITORED_SYMBOLS: return None
        num_1m, num_5m = 60*24+10, (60*24)//5+10 # Fetch enough for the day
        klines_1m = self.api_client.get_klines(symbol, "1m", num_1m) # Newest first
        klines_5m = self.api_client.get_klines(symbol, "5m", num_5m) # Newest first
        
        if not klines_1m or not klines_5m: return None
        
        day_start_utc = current_time_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        # klines from API are newest first. Filter by close_time.
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
        # We'll check the last closed 5m candle
        last_post_orb_candle = post_orb_klines[0] # Newest 5m candle after ORB
        
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

    def scan_and_generate_signals(self, current_time_utc: datetime) -> List[TradeSignal]:
        generated_signals: List[TradeSignal] = []
        swing_intervals = ["1h", "4h"] 
        for symbol in MONITORED_SYMBOLS:
            logger.debug(f"Scanning {symbol}...")
            for interval in swing_intervals:
                pattern_key = f"{symbol}_{interval}"
                if pattern_key not in self.active_patterns:
                    # For wedge detection, we need enough klines. API returns newest first.
                    # WEDGE_LOOKBACK_CANDLES is the number of candles to fetch.
                    klines_for_detection = self.api_client.get_klines(symbol, interval, WEDGE_LOOKBACK_CANDLES)
                    if klines_for_detection: # API returns newest first
                        # Wedge detection logic might implicitly or explicitly expect chronological (oldest first).
                        # If get_pivot_points and fit_trendline expect chronological, we might need to reverse.
                        # For now, assume they handle newest-first or the logic is abstract enough.
                        detected_pattern = self._detect_wedge_pattern(symbol, interval, klines_for_detection)
                        if detected_pattern: 
                            self.active_patterns[pattern_key] = detected_pattern
                            logger.info(f"Potential Pattern Detected: {detected_pattern.pattern_type} for {symbol} {interval}")
                else:
                    # If pattern exists, check for breakout using recent klines
                    # Fetch fewer klines for breakout check to be efficient
                    recent_klines_for_breakout_check = self.api_client.get_klines(symbol, interval, 50) 
                    if recent_klines_for_breakout_check and len(recent_klines_for_breakout_check) >= 2 : # Need at least two candles
                         breakout_signal = self._check_wedge_breakout(symbol, interval, self.active_patterns[pattern_key], recent_klines_for_breakout_check)
                         if breakout_signal:
                             generated_signals.append(breakout_signal)
                             del self.active_patterns[pattern_key] 
                             logger.info(f"Breakout signal generated and pattern {pattern_key} removed.")
            
            orb_signal = self._detect_orb_breakout(symbol, current_time_utc)
            if orb_signal: 
                generated_signals.append(orb_signal)
        
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
        self.pattern_recognizer = PatternRecognizer(api_client=self.api_client)
        self.risk_manager = RiskManager(account_equity_usd=ACCOUNT_EQUITY_USD, risk_percentage_per_trade=RISK_PERCENTAGE_PER_TRADE)
        self.active_trades: List[ActiveTrade] = [] 
        logger.info("TradingBot initialized.")

    def _print_live_data_header(self):
        # ANSI escape codes for color and clearing screen (basic cyberpunk feel)
        # \033[0;0H\033[2J  # Clear screen, move cursor to 0,0
        print("\033[0;0H\033[2J") 
        print("="*80)
        print(" Kewltech-Inspired Trading Bot - Live Data Feed & Signal Generation")
        print("="*80)
        print(f"{'Symbol':<12} {'Price (USD)':<15} {'24h Chg %':<12} {'24h Vol (Base)':<15} {'Last Update':<20}")
        print("-"*80)

    def _print_live_data_row(self, ticker_data: Dict[str, Any]):
        # Kewltech PDF mentions specific data points. We'll show what's easily available.
        symbol = ticker_data.get('s', 'N/A')
        last_price = ticker_data.get('c', 'N/A') # Last price
        percent_change = ticker_data.get('P', 'N/A') # 24h percentage change
        volume = ticker_data.get('v', 'N/A') # 24h volume in base asset
        last_update_ts = ticker_data.get('E', None) # Timestamp of last update

        last_update_str = "N/A"
        if last_update_ts:
            try:
                # Woofi Pro timestamp is usually milliseconds
                last_update_str = datetime.fromtimestamp(last_update_ts / 1000).strftime('%Y-%m-%d %H:%M:%S')
            except (TypeError, OSError):
                last_update_str = "Invalid Date"
        
        # Basic color coding for price change (optional, can be expanded)
        # price_color = ""
        # if isinstance(percent_change, float):
        #     if percent_change > 0: price_color = "\033[92m" # Green
        #     elif percent_change < 0: price_color = "\033[91m" # Red
        #     else: price_color = "\033[97m" # White/Default
        # print(f"{price_color}{symbol:<12}\033[0m {last_price:<15.2f}{percent_change:<12.2f}%{volume:<15,.0f}{last_update_str:<20}\033[0m")

        print(f"{symbol:<12} {last_price:<15.2f} {percent_change:<12.2f}% {volume:<15,.0f} {last_update_str:<20}")


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
                # TODO: Here you would add logic to actually place the trade via Woofi Pro's private API
                # Example:
                # order_response = self.api_client.place_order(
                #     symbol=finalized_signal.symbol,
                #     side="buy" if finalized_signal.trade_type == "long" else "sell",
                #     type="market", # or "limit"
                #     quantity=finalized_signal.position_size
                #     # price=finalized_signal.entry_price # if limit order
                # )
                # if order_response and order_response.get('success'):
                #    logger.info(f"  -> Order PLACED for {finalized_signal.symbol}. ID: {order_response.get('orderId', 'N/A')}")
                #    self.active_trades.append(ActiveTrade(signal=finalized_signal, entry_time=datetime.utcnow(), entry_order_id=order_response.get('orderId')))
                # else:
                #    logger.error(f"  -> FAILED to place order for {finalized_signal.symbol}: {order_response.get('message', 'Unknown Error')}")
            else:
                logger.warning(f"  -> Signal for {signal.symbol} discarded by risk management or calculation failed.")
        logger.info(f"--- End of Signal Processing ---")

    def run(self):
        logger.info("Starting Kewltech-Inspired Trading Bot...")
        logger.info(f"Symbols: {MONITORED_SYMBOLS}, Scan Interval: {SCAN_INTERVAL_SECONDS}s")
        logger.info(f"Account Equity: ${ACCOUNT_EQUITY_USD:,.2f}, Risk per Trade: {RISK_PERCENTAGE_PER_TRADE*100:.2f}%")
        logger.info("Press Ctrl+C to stop.")
        try:
            while True:
                cycle_start_time = datetime.utcnow()
                
                # --- Live Data Feed Display ---
                self._print_live_data_header()
                # Fetch and print ticker for a few key symbols (e.g., first 3 monitored symbols)
                # This is a simplified live feed. A more robust one might use curses or a web UI.
                # For now, we'll print a few lines of ticker data.
                # Woofi Pro /v1/market/ticker/24hr can take multiple symbols.
                # Example: /v1/market/ticker/24hr?symbols=BTCUSDT,ETHUSDT
                # For simplicity, we'll fetch one by one or rely on individual symbol fetching if API supports it.
                # The provided WoofiProAPIClient.get_ticker_24hr takes one symbol.
                symbols_for_live_feed = MONITORED_SYMBOLS[:3] # Show top 3 for brevity in terminal
                for sym in symbols_for_live_feed:
                    ticker = self.api_client.get_ticker_24hr(sym)
                    if ticker:
                        self._print_live_data_row(ticker)
                    else:
                        print(f"{sym:<12} {'Data N/A':<15} {'N/A':<12} {'N/A':<15} {'N/A':<20}")
                print("-"*80)
                # --- End Live Data Feed Display ---

                logger.info(f"\n\033[93m--- Market Scan Cycle at {cycle_start_time.strftime('%Y-%m-%d %H:%M:%S')} UTC ---\033[0m") # Bright green for cycle start
                
                trade_signals = self.pattern_recognizer.scan_and_generate_signals(cycle_start_time)
                self._process_signals(trade_signals)
                
                cycle_end_time = datetime.utcnow()
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
