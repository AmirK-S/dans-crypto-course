import { CONFIG } from '../config.mjs';

/**
 * Capitulation Detector — Multi-Signal Confluence
 *
 * Dan requires 3 of 5 confluence signals to confirm capitulation:
 * 1. Negative funding (market-wide)
 * 2. BTC dump (significant drawdown)
 * 3. Cross-exchange confirmation (negative funding on both Binance + Bybit)
 * 4. High volume spike (above average)
 * 5. Extreme fear (overall market sentiment)
 *
 * When 3+ fire simultaneously, it's a capitulation buy zone.
 */
export function detectCapitulation({ btcData, fundingAnalysis, globalData }) {
  const signals = [];

  // 1. Negative funding (market-wide average)
  const avgFunding = fundingAnalysis.summary.avgMarketFunding;
  const negativeFundingPct = fundingAnalysis.summary.negativeFunding / fundingAnalysis.summary.totalPairs;
  if (avgFunding < 0 && negativeFundingPct > 0.5) {
    signals.push({
      name: 'negativeFunding',
      detail: `Market avg funding: ${avgFunding.toFixed(4)}%, ${(negativeFundingPct * 100).toFixed(0)}% of pairs negative`,
    });
  }

  // 2. BTC dump
  const btc24h = btcData.price_change_percentage_24h_in_currency ?? btcData.price_change_percentage_24h ?? 0;
  const btc7d = btcData.price_change_percentage_7d_in_currency ?? 0;
  if (btc24h <= CONFIG.btcDump24h || btc7d <= CONFIG.btcDump7d) {
    signals.push({
      name: 'btcDump',
      detail: `BTC 24h: ${btc24h.toFixed(1)}%, 7d: ${btc7d.toFixed(1)}%`,
    });
  }

  // 3. Cross-exchange confirmation (many coins negative on both exchanges)
  const crossConfirmed = fundingAnalysis.signals.filter((s) => s.crossConfirmed).length;
  if (crossConfirmed >= 5) {
    signals.push({
      name: 'crossExchangeConfirmation',
      detail: `${crossConfirmed} coins with negative funding on both Binance + Bybit`,
    });
  }

  // 4. High volume spike — check if 24h volume is elevated vs market cap
  const totalVolume = globalData?.total_volume?.usd ?? 0;
  const totalMcap = globalData?.total_market_cap?.usd ?? 1;
  const volumeToMcap = totalVolume / totalMcap;
  if (volumeToMcap > 0.08) {
    signals.push({
      name: 'highVolumeSpike',
      detail: `Volume/MCap ratio: ${(volumeToMcap * 100).toFixed(1)}% (elevated)`,
    });
  }

  // 5. Extreme fear — BTC dominance rising + alts bleeding
  const btcDominance = globalData?.market_cap_percentage?.btc ?? 0;
  const mcapChange = globalData?.market_cap_change_percentage_24h_usd ?? 0;
  if (btcDominance > 55 && mcapChange < -3) {
    signals.push({
      name: 'extremeFearIndex',
      detail: `BTC dominance: ${btcDominance.toFixed(1)}%, market cap change: ${mcapChange.toFixed(1)}%`,
    });
  }

  const active = signals.length >= CONFIG.capitulation.minSignals;

  return {
    active,
    signalCount: signals.length,
    requiredSignals: CONFIG.capitulation.minSignals,
    signals,
    severity: active
      ? signals.length >= 4 ? 'EXTREME' : 'CONFIRMED'
      : signals.length >= 2 ? 'WARMING' : 'NONE',
  };
}
