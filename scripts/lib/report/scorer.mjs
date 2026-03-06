import { CONFIG } from '../config.mjs';

/**
 * Composite Signal Scoring Engine (0-100)
 *
 * Combines all signal outputs into a single "opportunity score"
 * using Dan's signal weights.
 */
export function computeScore(results) {
  const { weights } = CONFIG;
  let totalScore = 0;

  // Outlier signal (0-100)
  const outlierScore = results.outliers?.active
    ? Math.min(100, 30 + results.outliers.outliers.length * 5)
    : 0;
  totalScore += outlierScore * weights.outlier;

  // Funding signal (0-100)
  const fundingScore = computeFundingScore(results.funding);
  totalScore += fundingScore * weights.funding;

  // Capitulation signal (0-100)
  const capScore = results.capitulation?.active
    ? results.capitulation.signalCount >= 4 ? 100 : 70
    : results.capitulation?.signalCount >= 2 ? 30 : 0;
  totalScore += capScore * weights.capitulation;

  // New listings (0-100)
  const listingScore = results.newListings?.totalNew
    ? Math.min(100, results.newListings.totalNew * 10)
    : 0;
  totalScore += listingScore * weights.newListings;

  // Retracement (0-100)
  const retracementCount = (results.retracements ?? []).filter((r) => r.status === 'IN_ZONE').length;
  const retScore = Math.min(100, retracementCount * 8);
  totalScore += retScore * weights.retracement;

  // Dump gainers (0-100)
  const dumpScore = results.dumpGainers?.active
    ? Math.min(100, 20 + (results.dumpGainers.gainers?.length ?? 0) * 5)
    : 0;
  totalScore += dumpScore * weights.dumpGainers;

  return {
    total: Math.round(totalScore),
    breakdown: {
      outlier: { score: Math.round(outlierScore), weight: weights.outlier, weighted: Math.round(outlierScore * weights.outlier) },
      funding: { score: Math.round(fundingScore), weight: weights.funding, weighted: Math.round(fundingScore * weights.funding) },
      capitulation: { score: Math.round(capScore), weight: weights.capitulation, weighted: Math.round(capScore * weights.capitulation) },
      newListings: { score: Math.round(listingScore), weight: weights.newListings, weighted: Math.round(listingScore * weights.newListings) },
      retracement: { score: Math.round(retScore), weight: weights.retracement, weighted: Math.round(retScore * weights.retracement) },
      dumpGainers: { score: Math.round(dumpScore), weight: weights.dumpGainers, weighted: Math.round(dumpScore * weights.dumpGainers) },
    },
    interpretation: getInterpretation(Math.round(totalScore)),
  };
}

function computeFundingScore(funding) {
  if (!funding?.signals?.length) return 0;
  const extreme = funding.summary.extremeCount ?? 0;
  const high = funding.summary.highCount ?? 0;
  return Math.min(100, extreme * 20 + high * 10 + (funding.summary.avgMarketFunding < 0 ? 20 : 0));
}

function getInterpretation(score) {
  if (score >= 80) return 'STRONG BUY ZONE — Multiple signals aligned. High confluence.';
  if (score >= 60) return 'OPPORTUNITY — Several signals active. Worth investigating.';
  if (score >= 40) return 'MODERATE — Some signals present. Be selective.';
  if (score >= 20) return 'QUIET — Few signals. Patience recommended.';
  return 'NO SIGNAL — Market neutral. Focus on research and airdrop farming.';
}
