import fetch from 'node-fetch';
import { CONFIG } from '../config.mjs';

const { baseUrl } = CONFIG.api.kucoin;

/**
 * Fetch all trading symbols from KuCoin.
 * Returns array of symbol strings (e.g., ['BTC-USDT', 'ETH-USDT', ...]).
 * No authentication required.
 */
export async function getSymbols() {
  const res = await fetch(`${baseUrl}/api/v2/symbols`);
  if (!res.ok) {
    throw new Error(`KuCoin ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  if (data.code !== '200000') {
    throw new Error(`KuCoin API error: ${data.msg}`);
  }
  return (data.data ?? [])
    .filter((s) => s.enableTrading)
    .map((s) => s.symbol);
}
