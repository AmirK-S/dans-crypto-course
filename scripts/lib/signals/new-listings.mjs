import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG } from '../config.mjs';

const CACHE_FILE = join(process.cwd(), CONFIG.dataDir, 'exchange-symbols.json');

/**
 * New Listing Detection
 *
 * Dan: "Best coins appear on small exchanges first."
 * Diffs current symbol lists against cached previous lists.
 * New symbols = recently listed coins worth investigating.
 */
export function detectNewListings(mexcSymbols, kucoinSymbols) {
  let previous = { mexc: [], kucoin: [], updatedAt: null };
  try {
    previous = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    // First run — everything is "new" but we won't report it
  }

  const isFirstRun = previous.updatedAt === null;

  // Normalize symbols for comparison
  const normMexc = new Set(mexcSymbols.map(normalizeSymbol));
  const normKucoin = new Set(kucoinSymbols.map(normalizeSymbol));
  const prevMexc = new Set((previous.mexc ?? []).map(normalizeSymbol));
  const prevKucoin = new Set((previous.kucoin ?? []).map(normalizeSymbol));

  const newOnMexc = isFirstRun ? [] : [...normMexc].filter((s) => !prevMexc.has(s));
  const newOnKucoin = isFirstRun ? [] : [...normKucoin].filter((s) => !prevKucoin.has(s));

  // Find coins listed on both (cross-exchange confirmation)
  const allNew = new Set([...newOnMexc, ...newOnKucoin]);
  const onBoth = newOnMexc.filter((s) => normKucoin.has(s) || newOnKucoin.includes(s));

  // Save current state for next diff
  writeFileSync(CACHE_FILE, JSON.stringify({
    mexc: mexcSymbols,
    kucoin: kucoinSymbols,
    updatedAt: new Date().toISOString(),
  }, null, 2));

  return {
    isFirstRun,
    newOnMexc: newOnMexc.slice(0, 20),
    newOnKucoin: newOnKucoin.slice(0, 20),
    crossListed: onBoth,
    totalNew: allNew.size,
    mexcTotal: mexcSymbols.length,
    kucoinTotal: kucoinSymbols.length,
  };
}

/** Normalize symbol: remove quote currency, dashes, lowercase. */
function normalizeSymbol(s) {
  return s.replace(/-/g, '').replace(/USDT$|USDC$|BTC$|ETH$/, '').toLowerCase();
}
