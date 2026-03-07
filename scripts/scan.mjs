#!/usr/bin/env node

/**
 * Daily Crypto Scanner — Dan's Course Engine
 *
 * Usage:
 *   node scripts/scan.mjs              # Full daily scan
 *   node scripts/scan.mjs --portfolio  # View portfolio only
 *   node scripts/scan.mjs --dry-run    # Use cached data, no API calls
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env from project root (no dotenv dependency)
try {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { /* .env loading is best-effort */ }

import { CONFIG } from './lib/config.mjs';

// API clients
import { getTopCoins, getBtcData, getTrending, getGlobalData } from './lib/api/coingecko.mjs';
import { getFundingRates as getBinanceFunding } from './lib/api/binance.mjs';
import { getFundingRates as getBybitFunding } from './lib/api/bybit.mjs';
import { getSymbols as getMexcSymbols } from './lib/api/mexc.mjs';
import { getSymbols as getKucoinSymbols } from './lib/api/kucoin.mjs';

// Signal processors
import { detectOutliers } from './lib/signals/outlier-detector.mjs';
import { analyzeFunding } from './lib/signals/funding-monitor.mjs';
import { detectNewListings } from './lib/signals/new-listings.mjs';
import { detectCapitulation } from './lib/signals/capitulation.mjs';
import { scanRetracements } from './lib/signals/retracement.mjs';
import { findDumpGainers } from './lib/signals/dump-gainers.mjs';
import { analyzeTrends } from './lib/signals/trend-analyzer.mjs';

// Watchdog
import { loadPortfolio, savePortfolio, updatePositions, getPortfolioSummary } from './lib/watchdog/portfolio.mjs';
import { checkTheses } from './lib/watchdog/thesis-monitor.mjs';
import { checkExitAlerts } from './lib/watchdog/exit-alerts.mjs';
import { detectBearMarket } from './lib/watchdog/bear-signal.mjs';

// Report
import { formatReport } from './lib/report/formatter.mjs';
import { saveMarkdownReport } from './lib/report/markdown.mjs';
import { computeScore } from './lib/report/scorer.mjs';
import { sendTelegramReport } from './lib/report/telegram.mjs';

const args = process.argv.slice(2);
const portfolioOnly = args.includes('--portfolio');
const dryRun = args.includes('--dry-run');

const CACHE_FILE = join(process.cwd(), CONFIG.dataDir, 'scan-history.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const startTime = Date.now();
  console.log('\n🔍 Starting daily crypto scan...\n');

  // Load portfolio
  const portfolio = loadPortfolio();

  if (portfolioOnly) {
    const summary = getPortfolioSummary(portfolio);
    console.log(formatReport({ portfolio: summary }, { total: 0, breakdown: {}, interpretation: 'Portfolio view only' }));
    return;
  }

  let coins, btcData, globalData, binanceFunding, bybitFunding, mexcSymbols, kucoinSymbols;

  if (dryRun) {
    console.log('  [dry-run] Loading cached data...');
    try {
      const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      if (cache.lastScanData) {
        ({ coins, btcData, globalData, binanceFunding, bybitFunding, mexcSymbols, kucoinSymbols } = cache.lastScanData);
        console.log('  [dry-run] Cached data loaded.\n');
      } else {
        console.log('  [dry-run] No cached data found. Run without --dry-run first.\n');
        return;
      }
    } catch {
      console.log('  [dry-run] No cached data found. Run without --dry-run first.\n');
      return;
    }
  } else {
    // Fetch all data
    console.log('  Fetching market data...');

    // Phase 1: CoinGecko data (rate-limited, sequential to avoid 429)
    const cgDelay = process.env.COINGECKO_API_KEY ? 1200 : 7000;
    try {
      btcData = await fetchWithRetry('BTC data', getBtcData);
      await sleep(cgDelay);
      globalData = await fetchWithRetry('Global data', getGlobalData);
      await sleep(cgDelay);
      coins = await fetchWithRetry('Top 1000 coins', getTopCoins);
    } catch (err) {
      console.error(`  ✗ CoinGecko error: ${err.message}`);
      console.error('    Make sure COINGECKO_API_KEY is set in .env (free key from coingecko.com)');
      return;
    }

    // Phase 2: All other APIs in parallel (no rate limit concerns)
    console.log('  Fetching funding rates & exchange listings...');
    const [binRes, byRes, mexRes, kuRes] = await Promise.allSettled([
      fetchWithRetry('Binance funding', getBinanceFunding),
      fetchWithRetry('Bybit funding', getBybitFunding),
      fetchWithRetry('MEXC symbols', getMexcSymbols),
      fetchWithRetry('KuCoin symbols', getKucoinSymbols),
    ]);

    binanceFunding = binRes.status === 'fulfilled' ? binRes.value : [];
    bybitFunding = byRes.status === 'fulfilled' ? byRes.value : [];
    mexcSymbols = mexRes.status === 'fulfilled' ? mexRes.value : [];
    kucoinSymbols = kuRes.status === 'fulfilled' ? kuRes.value : [];

    if (binRes.status === 'rejected') console.log(`  ⚠ Binance: ${binRes.reason.message}`);
    if (byRes.status === 'rejected') console.log(`  ⚠ Bybit: ${byRes.reason.message}`);
    if (mexRes.status === 'rejected') console.log(`  ⚠ MEXC: ${mexRes.reason.message}`);
    if (kuRes.status === 'rejected') console.log(`  ⚠ KuCoin: ${kuRes.reason.message}`);

    // Cache data for dry-run
    try {
      const history = safeReadJSON(CACHE_FILE, { scans: [], lastScan: null });
      history.lastScanData = { coins, btcData, globalData, binanceFunding, bybitFunding, mexcSymbols, kucoinSymbols };
      history.lastScan = new Date().toISOString();
      writeFileSync(CACHE_FILE, JSON.stringify(history));
    } catch { /* non-critical */ }
  }

  console.log('  Processing signals...\n');

  // Run all signals
  const outliers = detectOutliers(coins, btcData);
  const funding = analyzeFunding(binanceFunding, bybitFunding);
  const newListings = detectNewListings(mexcSymbols, kucoinSymbols);
  const capitulation = detectCapitulation({ btcData, fundingAnalysis: funding, globalData });
  const retracements = scanRetracements(coins);
  const dumpGainers = findDumpGainers(coins, btcData);

  // Run watchdog
  const updatedPortfolio = updatePositions(portfolio, coins);
  const portfolioSummary = getPortfolioSummary(updatedPortfolio);
  const exitAlerts = checkExitAlerts(updatedPortfolio);
  const bearMarket = detectBearMarket(btcData);

  // Thesis check (only if positions exist with theses)
  let thesisAlerts = { checked: 0, alerts: [] };
  if (updatedPortfolio.positions.some((p) => p.thesis && p.invalidation)) {
    try {
      thesisAlerts = await checkTheses(updatedPortfolio, coins);
    } catch (err) {
      console.log(`  ⚠ Thesis monitor: ${err.message}`);
    }
  }

  savePortfolio(updatedPortfolio);

  // Compute composite score
  const results = {
    outliers,
    funding,
    newListings,
    capitulation,
    retracements,
    dumpGainers,
    portfolio: portfolioSummary,
    exitAlerts,
    thesisAlerts,
    bearMarket,
  };

  const score = computeScore(results);

  // Trend analysis (multi-day memory)
  const pastHistory = safeReadJSON(CACHE_FILE, { scans: [] }).scans || [];
  const trends = analyzeTrends(results, score, pastHistory);
  results.trends = trends;

  // Output
  console.log(formatReport(results, score));

  // Save markdown report
  const reportPath = saveMarkdownReport(results, score);
  console.log(`  Report saved: ${reportPath}`);

  // Send to Telegram
  try {
    const sent = await sendTelegramReport(results, score);
    if (sent) console.log('  ✓ Telegram report sent');
  } catch (err) {
    console.log(`  ⚠ Telegram: ${err.message}`);
  }

  // Save enriched scan history
  try {
    const history = safeReadJSON(CACHE_FILE, { scans: [], lastScan: null });
    history.scans.push({
      date: new Date().toISOString(),
      score: score.total,
      outlierActive: outliers.active,
      capitulationActive: capitulation.active,
      bearActive: bearMarket.active,
      btcPrice: btcData?.current_price,
      btcChange24h: outliers.btcChange24h,
      btcChange7d: outliers.btcChange7d,
      // Top coins per signal (symbols only, keeps history small)
      fundingCoins: (funding.signals || []).slice(0, 15).map(s => s.symbol),
      outlierCoins: (outliers.outliers || []).slice(0, 10).map(s => s.symbol),
      dumpGainerCoins: (dumpGainers.gainers || []).slice(0, 10).map(s => s.symbol),
      newListingsCount: newListings.isFirstRun ? undefined : (newListings.totalNew || 0),
      newListingCoins: [...(newListings.newOnMexc || []), ...(newListings.newOnKucoin || [])].slice(0, 10),
    });
    // Keep last 90 entries
    if (history.scans.length > 90) history.scans = history.scans.slice(-90);
    history.lastScan = new Date().toISOString();
    writeFileSync(CACHE_FILE, JSON.stringify(history, null, 2));
  } catch { /* non-critical */ }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Scan completed in ${elapsed}s\n`);
}

async function fetchWithRetry(label, fn, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await fn();
      console.log(`  ✓ ${label}`);
      return result;
    } catch (err) {
      if (i === retries) throw err;
      const wait = (i + 1) * 5000; // Exponential backoff: 5s, 10s
      console.log(`  ⚠ ${label} failed (attempt ${i + 1}), retrying in ${wait / 1000}s...`);
      await sleep(wait);
    }
  }
}

function safeReadJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

main().catch((err) => {
  console.error('\n✗ Scanner error:', err.message);
  process.exit(1);
});
