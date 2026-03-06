import { CONFIG } from '../config.mjs';

/**
 * Retracement Scanner — Dan's Buy-Zone Pullback Levels
 *
 * Identifies coins currently sitting in their buy zone based on
 * how far they've pulled back from their all-time high.
 *
 * Dan's zones: BTC -20%, ETH -25%, SOL -30-50%, memecoins -40-60%.
 */
export function scanRetracements(coins) {
  const results = [];

  for (const coin of coins) {
    const ath = coin.ath;
    const price = coin.current_price;
    if (!ath || !price || ath <= 0) continue;

    const drawdown = ((ath - price) / ath) * 100;
    const zone = getZone(coin);
    if (!zone) continue;

    const inBuyZone = drawdown >= zone.min && drawdown <= zone.max;
    const nearBuyZone = drawdown >= zone.min * 0.85 && drawdown < zone.min;

    if (inBuyZone || nearBuyZone) {
      results.push({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price,
        ath,
        athDate: coin.ath_date,
        drawdown: Math.round(drawdown * 10) / 10,
        buyZone: zone,
        status: inBuyZone ? 'IN_ZONE' : 'APPROACHING',
        marketCap: coin.market_cap,
        category: zone.category,
      });
    }
  }

  return results.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'IN_ZONE' ? -1 : 1;
    return a.drawdown - b.drawdown;
  }).slice(0, 25);
}

function getZone(coin) {
  const id = coin.id;
  const mcap = coin.market_cap ?? 0;

  if (id === 'bitcoin') return { ...CONFIG.retracement.btc, category: 'BTC' };
  if (id === 'ethereum') return { ...CONFIG.retracement.eth, category: 'ETH' };
  if (id === 'solana') return { ...CONFIG.retracement.sol, category: 'SOL' };
  if (mcap > 1_000_000_000) return { ...CONFIG.retracement.largeCap, category: 'Large Cap' };
  if (mcap > CONFIG.maxMarketCap) return { ...CONFIG.retracement.midCap, category: 'Mid Cap' };
  if (mcap >= CONFIG.minMarketCap) return { ...CONFIG.retracement.microCap, category: 'Micro Cap' };
  return null;
}
