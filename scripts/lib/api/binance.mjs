import fetch from 'node-fetch';
import { CONFIG } from '../config.mjs';

const { baseUrl } = CONFIG.api.binance;

/**
 * Fetch funding rates for all USDT perpetual contracts on Binance Futures.
 * Returns array of { symbol, fundingRate, fundingTime, markPrice }.
 * No authentication required.
 */
export async function getFundingRates() {
  const res = await fetch(`${baseUrl}/fapi/v1/premiumIndex`);
  if (!res.ok) {
    throw new Error(`Binance ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  return data
    .filter((d) => d.symbol.endsWith('USDT'))
    .map((d) => ({
      symbol: d.symbol.replace('USDT', ''),
      fundingRate: parseFloat(d.lastFundingRate) * 100, // Convert to percentage
      markPrice: parseFloat(d.markPrice),
      nextFundingTime: d.nextFundingTime,
    }));
}
