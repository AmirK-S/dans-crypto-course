import fetch from 'node-fetch';
import { CONFIG } from '../config.mjs';

const { baseUrl } = CONFIG.api.bybit;

/**
 * Fetch funding rates for all USDT linear perpetuals on Bybit.
 * Returns array of { symbol, fundingRate }.
 * No authentication required.
 */
export async function getFundingRates() {
  const res = await fetch(`${baseUrl}/v5/market/tickers?category=linear`);
  if (!res.ok) {
    throw new Error(`Bybit ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }
  return (data.result?.list ?? [])
    .filter((d) => d.symbol.endsWith('USDT'))
    .map((d) => ({
      symbol: d.symbol.replace('USDT', ''),
      fundingRate: parseFloat(d.fundingRate) * 100, // Convert to percentage
      markPrice: parseFloat(d.markPrice),
    }));
}
