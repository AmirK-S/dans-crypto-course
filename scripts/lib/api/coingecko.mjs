import fetch from 'node-fetch';
import { CONFIG } from '../config.mjs';

const { baseUrl, coinsPerPage, pages } = CONFIG.api.coingecko;
// Without API key, CoinGecko allows ~5-10 calls/min; with demo key ~30/min
const rateLimit = process.env.COINGECKO_API_KEY ? 1200 : 7000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers() {
  const h = { accept: 'application/json' };
  if (process.env.COINGECKO_API_KEY) {
    h['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
  }
  return h;
}

async function get(path, params = {}) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CoinGecko ${res.status}: ${path} — ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Fetch top coins by market cap (up to 1000). Returns array of coin objects. */
export async function getTopCoins() {
  const allCoins = [];
  for (let page = 1; page <= pages; page++) {
    const data = await get('/coins/markets', {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: coinsPerPage,
      page,
      sparkline: 'false',
      price_change_percentage: '24h,7d,30d',
    });
    allCoins.push(...data);
    if (page < pages) await sleep(rateLimit);
  }
  return allCoins;
}

/** Fetch BTC data specifically. */
export async function getBtcData() {
  const [btc] = await get('/coins/markets', {
    vs_currency: 'usd',
    ids: 'bitcoin',
    sparkline: 'false',
    price_change_percentage: '24h,7d,30d',
  });
  return btc;
}

/** Fetch trending coins. */
export async function getTrending() {
  const data = await get('/search/trending');
  return data.coins?.map((c) => c.item) ?? [];
}

/** Fetch global market data (total market cap, BTC dominance, etc.). */
export async function getGlobalData() {
  const data = await get('/global');
  return data.data;
}

/** Fetch coin detail by id (for ATH data, Fibonacci calculations). */
export async function getCoinDetail(id) {
  return get(`/coins/${id}`, {
    localization: 'false',
    tickers: 'false',
    community_data: 'false',
    developer_data: 'false',
  });
}
