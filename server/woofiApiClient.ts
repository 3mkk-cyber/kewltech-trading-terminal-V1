// ==============================================================================
// FILE: woofiApiClient.ts (Content)
// ==============================================================================
// Handles communication with Woofi Pro API
// ==============================================================================

import axios, { AxiosInstance } from 'axios';
import { Kline } from './dataModels';
import { WOOFI_BASE_URL } from './config';

export class WoofiProAPIClient {
  private baseUrl: string;
  private timeout: number;
  private client: AxiosInstance;

  constructor(baseUrl: string = WOOFI_BASE_URL, timeout: number = 10000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        // 'X-API-KEY': WOOFI_API_KEY, // For private endpoints
      }
    });
  }

  private async makeRequest(endpoint: string, params?: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;
    try {
      const response = await this.client.get(url, { params });
      const data = response.data;

      // Check for success: 'success' field is True OR 'code' field is 0 (or absent)
      const code = data.code;
      const success = data.success;

      if (success === true || code === 0 || (code == null && success == null && 'rows' in data)) {
        return data;
      } else {
        // API returned an error code
        const errorMessage = data.message || `Unknown API Error`;
        console.error(`API Error for ${url}: Code ${code}, Message: ${errorMessage}`);
        return null;
      }
    } catch (error: any) {
      if (error.response) {
        console.error(`HTTP error for ${url}: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.code === 'ECONNABORTED') {
        console.error(`Timeout for ${url}: ${error.message}`);
      } else {
        console.error(`Request failed for ${url}: ${error.message}`);
      }
      return null;
    }
  }

  async getAllSymbols(): Promise<any[] | null> {
    console.log("Fetching all symbols...");
    const data = await this.makeRequest("/v1/public/info");
    if (data && 'rows' in data) {
      const symbols = data.rows;
      console.log(`Successfully fetched ${symbols.length} symbols.`);
      return symbols;
    }
    console.warn("Failed to fetch symbols.");
    return null;
  }

  async getKlines(symbol: string, interval: string, limit: number): Promise<Kline[] | null> {
    console.debug(`Fetching ${limit} ${interval} klines for ${symbol}...`);
    const params = { symbol, type: interval, limit };
    const data = await this.makeRequest("/v1/kline", params);
    if (data && 'rows' in data) {
      const klinesRaw = data.rows;
      const processedKlines: Kline[] = [];
      for (const kData of klinesRaw) {
        try {
          // WooFi API format: {"open":x, "close":x, "low":x, "high":x, "volume":x, "amount":x, "symbol":"x", "type":"x, "start_timestamp":x, "end_timestamp":x}
          processedKlines.push({
            openTime: new Date(kData.start_timestamp),
            open: parseFloat(kData.open),
            high: parseFloat(kData.high),
            low: parseFloat(kData.low),
            close: parseFloat(kData.close),
            volume: parseFloat(kData.volume),
            closeTime: new Date(kData.end_timestamp),
            quoteAssetVolume: parseFloat(kData.amount || 0),
            numberOfTrades: 0,
            takerBuyBaseAssetVolume: 0,
            takerBuyQuoteAssetVolume: 0
          });
        } catch (e) {
          console.warn(`Skipping malformed kline for ${symbol}:`, kData, 'Error:', e);
          continue;
        }
      }
      // Reverse to chronological order (oldest first) for pattern detection
      processedKlines.reverse();
      console.debug(`Successfully fetched ${processedKlines.length} klines for ${symbol} (oldest to newest).`);
      return processedKlines;
    } else if (data && 'rows' in data && !data.rows) {
      console.info(`No klines returned for ${symbol} ${interval} with limit ${limit}.`);
      return [];
    }
    console.warn(`Failed to fetch klines for ${symbol} ${interval}.`);
    return null;
  }

  async getCurrentPrice(symbol: string): Promise<any | null> {
    console.debug(`Fetching current price for ${symbol}...`);
    const params = { symbol, type: '1m', limit: 1 };
    const data = await this.makeRequest("/v1/kline", params);
    if (data && 'rows' in data && data.rows.length > 0) {
      const kline = data.rows[0];
      // Transform to ticker-like format for compatibility
      const tickerData = {
        s: symbol,  // symbol
        c: kline.close,  // last price
        o: kline.open,  // open price
        h: kline.high,  // high price
        l: kline.low,  // low price
        v: kline.volume,  // volume
        q: kline.amount,  // quote volume
        E: kline.end_timestamp,  // timestamp
      };
      console.debug(`Successfully fetched current price for ${symbol}: ${kline.close}`);
      return tickerData;
    }
    console.warn(`Failed to fetch current price for ${symbol}.`);
    return null;
  }

  // Placeholder for future private API methods (e.g., place_order)
  // async placeOrder(symbol: string, side: string, orderType: string, quantity: number, price?: number): Promise<any> {
  //   // Implementation for POST /v1/order
  //   return null;
  // }
}