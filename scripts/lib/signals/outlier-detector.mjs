import { CONFIG } from '../config.mjs';

/**
 * Dan's #1 Highest Hit-Rate Signal: Outlier Price Action
 *
 * When BTC dumps 5%+ (24h) or 10%+ (7d), find sub-100M coins that:
 * - Held their value (< half of BTC's drop)
 * - Went UP while BTC dumped
 *
 * These "outliers" show relative strength — someone is accumulating.
 */
export function detectOutliers(coins, btcData) {
  const btc24h = btcData.price_change_percentage_24h_in_currency ?? btcData.price_change_percentage_24h ?? 0;
  const btc7d = btcData.price_change_percentage_7d_in_currency ?? 0;

  const isDumping24h = btc24h <= CONFIG.btcDump24h;
  const isDumping7d = btc7d <= CONFIG.btcDump7d;
  const isDumping = isDumping24h || isDumping7d;

  const result = {
    active: isDumping,
    btcChange24h: btc24h,
    btcChange7d: btc7d,
    trigger: isDumping24h ? '24h' : isDumping7d ? '7d' : 'none',
    outliers: [],
  };

  if (!isDumping) return result;

  const btcDrop = isDumping24h ? btc24h : btc7d;
  const changeKey = isDumping24h
    ? 'price_change_percentage_24h_in_currency'
    : 'price_change_percentage_7d_in_currency';

  result.outliers = coins
    .filter((c) => {
      const mcap = c.market_cap ?? 0;
      const change = c[changeKey] ?? c.price_change_percentage_24h ?? null;
      if (change === null) return false;
      if (mcap > CONFIG.maxMarketCap || mcap < CONFIG.minMarketCap) return false;
      // Coin held better than half of BTC's drop or went positive
      return change > btcDrop / 2;
    })
    .map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price,
      marketCap: c.market_cap,
      change: c[changeKey] ?? c.price_change_percentage_24h,
      btcDrop,
      relativeStrength: (c[changeKey] ?? c.price_change_percentage_24h) - btcDrop,
    }))
    .sort((a, b) => b.relativeStrength - a.relativeStrength)
    .slice(0, 20);

  return result;
}
