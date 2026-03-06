import { CONFIG } from '../config.mjs';

/**
 * Fibonacci Bear Market Detector
 *
 * Dan's bear market confirmation:
 * BTC retraces 50-61.8% (0.5-0.618 Fibonacci) from ATH AND makes a lower low.
 *
 * When confirmed: reduce exposure, tighten stops, shift to stablecoins.
 */
export function detectBearMarket(btcData, btcDetail = null) {
  const ath = btcDetail?.market_data?.ath?.usd ?? btcData.ath ?? 0;
  const currentPrice = btcDetail?.market_data?.current_price?.usd ?? btcData.current_price ?? 0;
  const athDate = btcDetail?.market_data?.ath_date?.usd ?? btcData.ath_date;

  if (!ath || !currentPrice) {
    return { active: false, error: 'Missing BTC ATH or price data' };
  }

  const drawdown = (ath - currentPrice) / ath;
  const { fibLow, fibHigh } = CONFIG.bearMarket;

  const inFibZone = drawdown >= fibLow && drawdown <= fibHigh;
  const pastFibZone = drawdown > fibHigh;

  // Check for lower low using 30d change as proxy
  const change30d = btcData.price_change_percentage_30d_in_currency ?? 0;
  const lowerLowSignal = change30d < -15; // Sustained downtrend

  const bearConfirmed = (inFibZone || pastFibZone) && lowerLowSignal;

  return {
    active: bearConfirmed,
    severity: pastFibZone ? 'DEEP_BEAR' : inFibZone ? 'BEAR_ZONE' : drawdown >= fibLow * 0.8 ? 'WARNING' : 'NONE',
    btcPrice: currentPrice,
    btcAth: ath,
    athDate,
    drawdownPercent: Math.round(drawdown * 1000) / 10,
    fibZone: `${(fibLow * 100).toFixed(0)}%-${(fibHigh * 100).toFixed(0)}%`,
    inFibZone,
    lowerLowSignal,
    recommendations: bearConfirmed
      ? [
          'Reduce position sizes',
          'Tighten stop-losses',
          'Shift allocation toward stablecoins',
          'Focus on airdrop farming (no capital risk)',
          'Wait for accumulation signals before re-entering',
        ]
      : [],
  };
}
