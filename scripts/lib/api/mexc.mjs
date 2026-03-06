import fetch from 'node-fetch';
import { CONFIG } from '../config.mjs';

const { baseUrl } = CONFIG.api.mexc;

/**
 * Fetch all trading symbols from MEXC.
 * Returns array of symbol strings (e.g., ['BTCUSDT', 'ETHUSDT', ...]).
 * No authentication required.
 */
export async function getSymbols() {
  const res = await fetch(`${baseUrl}/api/v3/defaultSymbols`);
  if (!res.ok) {
    // Fallback to exchangeInfo
    const res2 = await fetch(`${baseUrl}/api/v3/exchangeInfo`);
    if (!res2.ok) {
      throw new Error(`MEXC ${res2.status}: ${await res2.text().catch(() => '')}`);
    }
    const data = await res2.json();
    return (data.symbols ?? [])
      .filter((s) => s.status === 'ENABLED' || s.isSpotTradingAllowed)
      .map((s) => s.symbol);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? [];
}
