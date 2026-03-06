import { CONFIG } from '../config.mjs';

/**
 * Dump Gainers — Top performers during market selloffs
 *
 * When BTC is red, sort entire top-1000 by 24h performance.
 * Coins that are GREEN during a dump show serious accumulation.
 * Focus on sub-100M market cap per Dan's strategy.
 */
export function findDumpGainers(coins, btcData) {
  const btc24h = btcData.price_change_percentage_24h_in_currency ?? btcData.price_change_percentage_24h ?? 0;
  const btc7d = btcData.price_change_percentage_7d_in_currency ?? 0;

  const marketDown = btc24h < -2 || btc7d < -5;

  if (!marketDown) {
    return {
      active: false,
      btcChange24h: btc24h,
      gainers: [],
      message: 'Market not in selloff — dump gainers signal inactive',
    };
  }

  const gainers = coins
    .filter((c) => {
      const change = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0;
      const mcap = c.market_cap ?? 0;
      return change > 0 && mcap >= CONFIG.minMarketCap;
    })
    .map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price,
      change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
      change7d: c.price_change_percentage_7d_in_currency ?? 0,
      marketCap: c.market_cap,
      isSubHundredM: (c.market_cap ?? 0) <= CONFIG.maxMarketCap,
      volume24h: c.total_volume,
    }))
    .sort((a, b) => b.change24h - a.change24h);

  // Separate sub-100M (Dan's focus) from larger caps
  const focused = gainers.filter((g) => g.isSubHundredM).slice(0, 15);
  const largeCap = gainers.filter((g) => !g.isSubHundredM).slice(0, 10);

  return {
    active: true,
    btcChange24h: btc24h,
    gainers: focused,
    largeCapGainers: largeCap,
    totalGreenCoins: gainers.length,
  };
}
