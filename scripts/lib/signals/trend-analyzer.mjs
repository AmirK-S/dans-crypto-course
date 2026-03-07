/**
 * Trend Analyzer — Multi-day memory for DanScan
 *
 * Compares current scan results with past scans to identify:
 * - Recurring coins (appearing in signals multiple days)
 * - Score trajectory (warming up / cooling down)
 * - Persistent funding anomalies
 * - New vs returning signals
 */

/**
 * Analyze trends from scan history
 * @param {object} currentResults - Today's scan results
 * @param {object} currentScore - Today's score
 * @param {Array} history - Past scan entries (enriched)
 * @returns {object} Trend analysis
 */
export function analyzeTrends(currentResults, currentScore, history) {
  if (!history || history.length === 0) {
    return { hasTrends: false, reason: 'first-scan' };
  }

  // Only look at last 7 days, one entry per day (most recent per day)
  const recentDays = deduplicateByDay(history).slice(-7);

  return {
    hasTrends: true,
    scoreTrajectory: analyzeScoreTrajectory(currentScore.total, recentDays),
    recurringFunding: findRecurringCoins(currentResults.funding?.signals, recentDays, 'fundingCoins'),
    recurringGainers: findRecurringCoins(currentResults.dumpGainers?.gainers, recentDays, 'dumpGainerCoins'),
    recurringOutliers: findRecurringCoins(currentResults.outliers?.outliers, recentDays, 'outlierCoins'),
    newListingsTrend: analyzeNewListings(currentResults.newListings, recentDays),
    daysOfData: recentDays.length,
  };
}

/**
 * Keep only the most recent scan per calendar day
 */
function deduplicateByDay(history) {
  const byDay = new Map();
  for (const entry of history) {
    const day = entry.date.slice(0, 10); // YYYY-MM-DD
    byDay.set(day, entry); // last one wins
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Score trajectory: is the market warming up, cooling down, or stable?
 */
function analyzeScoreTrajectory(currentScore, recentDays) {
  const scores = recentDays.map(d => d.score);
  scores.push(currentScore);

  if (scores.length < 2) return { direction: 'stable', scores };

  const last3 = scores.slice(-3);
  const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
  const prevAvg = scores.length >= 4
    ? scores.slice(-6, -3).reduce((a, b) => a + b, 0) / Math.min(3, scores.slice(-6, -3).length)
    : scores[0];

  let direction = 'stable';
  if (avg - prevAvg > 10) direction = 'warming';
  else if (prevAvg - avg > 10) direction = 'cooling';

  // Streak detection
  let streak = 0;
  let streakDir = null;
  for (let i = scores.length - 1; i >= 1; i--) {
    const diff = scores[i] - scores[i - 1];
    const dir = diff > 5 ? 'up' : diff < -5 ? 'down' : 'flat';
    if (i === scores.length - 1) {
      streakDir = dir;
      streak = 1;
    } else if (dir === streakDir && dir !== 'flat') {
      streak++;
    } else {
      break;
    }
  }

  return {
    direction,
    scores,
    currentScore,
    streak: streak >= 2 ? { direction: streakDir, days: streak } : null,
  };
}

/**
 * Find coins that appear in signals across multiple days
 */
function findRecurringCoins(currentCoins, recentDays, historyKey) {
  if (!currentCoins || currentCoins.length === 0) return [];

  const currentSymbols = new Set(currentCoins.map(c => c.symbol));

  // Count appearances in past days
  const appearances = new Map();
  for (const day of recentDays) {
    const pastCoins = day[historyKey] || [];
    for (const symbol of pastCoins) {
      if (currentSymbols.has(symbol)) {
        appearances.set(symbol, (appearances.get(symbol) || 0) + 1);
      }
    }
  }

  // Return coins that appeared at least 2 days (including today)
  const recurring = [];
  for (const [symbol, count] of appearances) {
    if (count >= 1) { // appeared at least once before + today = 2+ days
      recurring.push({
        symbol,
        daysAppeared: count + 1, // +1 for today
        totalDaysChecked: recentDays.length + 1,
      });
    }
  }

  return recurring.sort((a, b) => b.daysAppeared - a.daysAppeared);
}

/**
 * Track new listings trend
 */
function analyzeNewListings(currentListings, recentDays) {
  if (!currentListings || currentListings.isFirstRun) return null;

  const pastCounts = recentDays
    .filter(d => d.newListingsCount !== undefined)
    .map(d => d.newListingsCount);

  return {
    todayCount: currentListings.totalNew || 0,
    pastCounts,
    avgRecent: pastCounts.length ? (pastCounts.reduce((a, b) => a + b, 0) / pastCounts.length) : 0,
  };
}

/**
 * Format trends into a human-readable summary for the LLM
 */
export function formatTrendsForLLM(trends) {
  if (!trends.hasTrends) return 'Pas de données historiques (premier scan).';

  const lines = [];

  // Score trajectory
  const st = trends.scoreTrajectory;
  if (st.scores.length >= 2) {
    const scoreHistory = st.scores.map(s => `${s}`).join(' → ');
    lines.push(`Évolution du score (${st.scores.length} jours): ${scoreHistory}`);
    if (st.direction === 'warming') lines.push(`Tendance: le marché se RÉCHAUFFE`);
    else if (st.direction === 'cooling') lines.push(`Tendance: le marché se REFROIDIT`);
    if (st.streak) lines.push(`Série: score en ${st.streak.direction === 'up' ? 'hausse' : 'baisse'} depuis ${st.streak.days} jours`);
  }

  // Recurring funding coins
  if (trends.recurringFunding.length > 0) {
    lines.push(`Coins en funding négatif RÉCURRENT:`);
    for (const c of trends.recurringFunding.slice(0, 5)) {
      lines.push(`  ${c.symbol}: ${c.daysAppeared} jours d'affilée (sur ${c.totalDaysChecked} jours observés)`);
    }
  }

  // Recurring dump gainers
  if (trends.recurringGainers.length > 0) {
    lines.push(`Coins qui reviennent dans les "dump gainers":`);
    for (const c of trends.recurringGainers.slice(0, 5)) {
      lines.push(`  ${c.symbol}: apparu ${c.daysAppeared}/${c.totalDaysChecked} jours`);
    }
  }

  // Recurring outliers
  if (trends.recurringOutliers.length > 0) {
    lines.push(`Coins outliers récurrents:`);
    for (const c of trends.recurringOutliers.slice(0, 5)) {
      lines.push(`  ${c.symbol}: résiste depuis ${c.daysAppeared} jours`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'Pas de tendance notable sur les derniers jours.';
}

/**
 * Format trends for the Claude copy-paste block
 */
export function formatTrendsForClaude(trends) {
  if (!trends.hasTrends) return null;

  const lines = [];
  lines.push('MÉMOIRE — Tendances multi-jours:');

  const st = trends.scoreTrajectory;
  if (st.scores.length >= 2) {
    lines.push(`  Scores récents: ${st.scores.join(' → ')}`);
    lines.push(`  Tendance: ${st.direction === 'warming' ? 'HAUSSE' : st.direction === 'cooling' ? 'BAISSE' : 'STABLE'}`);
  }

  if (trends.recurringFunding.length > 0) {
    lines.push(`  Funding négatif persistant: ${trends.recurringFunding.map(c => `${c.symbol} (${c.daysAppeared}j)`).join(', ')}`);
  }

  if (trends.recurringGainers.length > 0) {
    lines.push(`  Dump gainers récurrents: ${trends.recurringGainers.map(c => `${c.symbol} (${c.daysAppeared}j)`).join(', ')}`);
  }

  if (trends.recurringOutliers.length > 0) {
    lines.push(`  Outliers récurrents: ${trends.recurringOutliers.map(c => `${c.symbol} (${c.daysAppeared}j)`).join(', ')}`);
  }

  return lines.length > 1 ? lines.join('\n') : null;
}
