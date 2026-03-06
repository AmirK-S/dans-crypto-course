import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG } from '../config.mjs';

const PORTFOLIO_FILE = join(process.cwd(), CONFIG.dataDir, 'portfolio.json');

const EMPTY_PORTFOLIO = {
  positions: [],
  watchlist: [],
  closedPositions: [],
  updatedAt: null,
};

/**
 * Portfolio State Manager
 *
 * Tracks up to 7 positions (Dan's max), watchlist, and closed positions.
 * Persists to scripts/data/portfolio.json.
 */
export function loadPortfolio() {
  try {
    return JSON.parse(readFileSync(PORTFOLIO_FILE, 'utf-8'));
  } catch {
    return { ...EMPTY_PORTFOLIO };
  }
}

export function savePortfolio(portfolio) {
  portfolio.updatedAt = new Date().toISOString();
  writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
}

/** Update positions with current market prices. */
export function updatePositions(portfolio, coins) {
  const priceMap = new Map();
  for (const c of coins) {
    priceMap.set(c.id, c.current_price);
    priceMap.set(c.symbol.toLowerCase(), c.current_price);
  }

  for (const pos of portfolio.positions) {
    const currentPrice = priceMap.get(pos.coinId) ?? priceMap.get(pos.symbol.toLowerCase());
    if (currentPrice) {
      pos.currentPrice = currentPrice;
      pos.pnlPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      pos.pnlUsd = (currentPrice - pos.entryPrice) * pos.quantity;
      pos.currentValue = currentPrice * pos.quantity;
      pos.multiplier = currentPrice / pos.entryPrice;
    }
  }

  return portfolio;
}

/** Get portfolio summary. */
export function getPortfolioSummary(portfolio) {
  const positions = portfolio.positions;
  if (positions.length === 0) {
    return {
      totalPositions: 0,
      maxPositions: CONFIG.maxPositions,
      totalInvested: 0,
      totalValue: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      positions: [],
      slotsAvailable: CONFIG.maxPositions,
    };
  }

  const totalInvested = positions.reduce((s, p) => s + (p.entryPrice * p.quantity), 0);
  const totalValue = positions.reduce((s, p) => s + (p.currentValue ?? p.entryPrice * p.quantity), 0);
  const totalPnl = totalValue - totalInvested;

  return {
    totalPositions: positions.length,
    maxPositions: CONFIG.maxPositions,
    totalInvested: Math.round(totalInvested * 100) / 100,
    totalValue: Math.round(totalValue * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalPnlPercent: totalInvested > 0 ? Math.round((totalPnl / totalInvested) * 10000) / 100 : 0,
    positions: positions.map((p) => ({
      symbol: p.symbol,
      type: p.type,
      entry: p.entryPrice,
      current: p.currentPrice,
      pnl: p.pnlPercent ? `${p.pnlPercent > 0 ? '+' : ''}${p.pnlPercent.toFixed(1)}%` : 'N/A',
      multiplier: p.multiplier ? `${p.multiplier.toFixed(2)}x` : 'N/A',
      thesis: p.thesis ?? '',
    })),
    slotsAvailable: CONFIG.maxPositions - positions.length,
  };
}
