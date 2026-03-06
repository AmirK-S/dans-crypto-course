import { CONFIG } from '../config.mjs';

/**
 * Exit Range Alerts
 *
 * Dan's expected rally ranges by coin type:
 * - Memecoins: 10-100x
 * - Micro caps: 10-100x
 * - Mid caps: 5-15x
 * - Large caps: 3-7x
 * - ETH: 3-5x
 * - BTC: 2-3.5x
 *
 * Alerts when a position enters its expected exit range.
 */
export function checkExitAlerts(portfolio) {
  const alerts = [];

  for (const pos of portfolio.positions) {
    if (!pos.multiplier || !pos.entryPrice) continue;

    const range = getExitRange(pos);
    if (!range) continue;

    const inExitZone = pos.multiplier >= range.min;
    const pastExitZone = pos.multiplier >= range.max;
    const approaching = pos.multiplier >= range.min * 0.8;

    if (pastExitZone) {
      alerts.push({
        symbol: pos.symbol,
        multiplier: pos.multiplier,
        status: 'PAST_EXIT_RANGE',
        range,
        message: `${pos.symbol} at ${pos.multiplier.toFixed(1)}x — PAST exit range (${range.min}-${range.max}x). Consider taking profit.`,
      });
    } else if (inExitZone) {
      alerts.push({
        symbol: pos.symbol,
        multiplier: pos.multiplier,
        status: 'IN_EXIT_RANGE',
        range,
        message: `${pos.symbol} at ${pos.multiplier.toFixed(1)}x — IN exit range (${range.min}-${range.max}x). Start scaling out.`,
      });
    } else if (approaching) {
      alerts.push({
        symbol: pos.symbol,
        multiplier: pos.multiplier,
        status: 'APPROACHING',
        range,
        message: `${pos.symbol} at ${pos.multiplier.toFixed(1)}x — approaching exit range (${range.min}-${range.max}x).`,
      });
    }
  }

  return alerts;
}

function getExitRange(pos) {
  const type = (pos.category ?? pos.type ?? '').toLowerCase();
  if (type.includes('meme')) return CONFIG.exitRanges.memecoin;
  if (type.includes('micro')) return CONFIG.exitRanges.microCap;
  if (type.includes('mid')) return CONFIG.exitRanges.midCap;
  if (type.includes('large')) return CONFIG.exitRanges.largeCap;

  const id = (pos.coinId ?? '').toLowerCase();
  if (id === 'bitcoin') return CONFIG.exitRanges.btc;
  if (id === 'ethereum') return CONFIG.exitRanges.eth;
  if (id === 'solana') return CONFIG.exitRanges.sol;

  return CONFIG.exitRanges.microCap; // Default for unknown
}
