import { CONFIG } from '../config.mjs';

/**
 * Hunter Algorithm: Funding Rate Monitor
 *
 * Dan's "only dataset without alpha decay."
 * Negative funding = shorts are paying longs = bearish consensus.
 * When everyone is short, that's the buy zone.
 *
 * Aggregates funding from Binance + Bybit for cross-exchange confirmation.
 */
export function analyzeFunding(binanceRates, bybitRates) {
  // Build a map of symbol -> rates from both exchanges
  const merged = new Map();

  for (const r of binanceRates) {
    merged.set(r.symbol, {
      symbol: r.symbol,
      binance: r.fundingRate,
      bybit: null,
      markPrice: r.markPrice,
    });
  }

  for (const r of bybitRates) {
    const existing = merged.get(r.symbol);
    if (existing) {
      existing.bybit = r.fundingRate;
    } else {
      merged.set(r.symbol, {
        symbol: r.symbol,
        binance: null,
        bybit: r.fundingRate,
        markPrice: r.markPrice,
      });
    }
  }

  const { moderate, high, extreme } = CONFIG.funding;

  const signals = [];
  for (const entry of merged.values()) {
    const avgRate = getAvgRate(entry);
    if (avgRate === null) continue;

    let severity = null;
    if (avgRate <= extreme) severity = 'EXTREME';
    else if (avgRate <= high) severity = 'HIGH';
    else if (avgRate <= moderate) severity = 'MODERATE';

    if (severity) {
      signals.push({
        ...entry,
        avgRate,
        severity,
        crossConfirmed: entry.binance !== null && entry.bybit !== null &&
          entry.binance < 0 && entry.bybit < 0,
      });
    }
  }

  // Sort by avg rate (most negative first)
  signals.sort((a, b) => a.avgRate - b.avgRate);

  // Summary stats
  const allRates = [...merged.values()].map(getAvgRate).filter((r) => r !== null);
  const avgMarketFunding = allRates.length
    ? allRates.reduce((s, r) => s + r, 0) / allRates.length
    : 0;

  return {
    signals: signals.slice(0, 30),
    summary: {
      totalPairs: merged.size,
      negativeFunding: allRates.filter((r) => r < 0).length,
      avgMarketFunding: round(avgMarketFunding),
      extremeCount: signals.filter((s) => s.severity === 'EXTREME').length,
      highCount: signals.filter((s) => s.severity === 'HIGH').length,
      moderateCount: signals.filter((s) => s.severity === 'MODERATE').length,
    },
  };
}

function getAvgRate(entry) {
  if (entry.binance !== null && entry.bybit !== null) {
    return (entry.binance + entry.bybit) / 2;
  }
  return entry.binance ?? entry.bybit;
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}
