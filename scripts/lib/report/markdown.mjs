import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG } from '../config.mjs';

/**
 * Save scan report as markdown to output/reports/YYYY-MM-DD-scan.md
 */
export function saveMarkdownReport(results, score) {
  const dir = join(process.cwd(), CONFIG.reportDir);
  mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-scan.md`;
  const filepath = join(dir, filename);

  const md = generateMarkdown(results, score, date);
  writeFileSync(filepath, md);
  return filepath;
}

function generateMarkdown(results, score, date) {
  const lines = [];

  lines.push(`# Daily Crypto Scan — ${date}`);
  lines.push(`> Generated at ${new Date().toISOString()}`);
  lines.push('');

  // Score
  lines.push('## Composite Score');
  lines.push(`**${score.total}/100** — ${score.interpretation}`);
  lines.push('');
  lines.push('| Signal | Score | Weight | Weighted |');
  lines.push('|--------|-------|--------|----------|');
  for (const [key, val] of Object.entries(score.breakdown)) {
    lines.push(`| ${key} | ${val.score} | ${val.weight} | ${val.weighted} |`);
  }
  lines.push('');

  // Outliers
  lines.push('## Outlier Detection');
  if (results.outliers?.active) {
    lines.push(`BTC dump detected: **${results.outliers.btcChange24h.toFixed(1)}%** (${results.outliers.trigger})`);
    lines.push('');
    if (results.outliers.outliers.length) {
      lines.push('| Symbol | Price | Change | Market Cap | Relative Strength |');
      lines.push('|--------|-------|--------|------------|-------------------|');
      for (const o of results.outliers.outliers) {
        lines.push(`| ${o.symbol} | $${o.price} | ${o.change.toFixed(1)}% | $${fmtNum(o.marketCap)} | +${o.relativeStrength.toFixed(1)}% |`);
      }
    }
  } else {
    lines.push(`No BTC dump detected. BTC 24h: ${results.outliers?.btcChange24h?.toFixed(1) ?? '?'}%, 7d: ${results.outliers?.btcChange7d?.toFixed(1) ?? '?'}%`);
  }
  lines.push('');

  // Funding
  lines.push('## Funding Rates (Hunter Algorithm)');
  const fs = results.funding?.summary;
  if (fs) {
    lines.push(`- Market avg: **${fs.avgMarketFunding.toFixed(4)}%**`);
    lines.push(`- Negative funding: ${fs.negativeFunding}/${fs.totalPairs} pairs`);
    lines.push(`- Extreme: ${fs.extremeCount} | High: ${fs.highCount} | Moderate: ${fs.moderateCount}`);
    lines.push('');
    const top = (results.funding?.signals ?? []).slice(0, 15);
    if (top.length) {
      lines.push('| Severity | Symbol | Binance | Bybit | Avg | Cross |');
      lines.push('|----------|--------|---------|-------|-----|-------|');
      for (const s of top) {
        lines.push(`| ${s.severity} | ${s.symbol} | ${fmtRate(s.binance)} | ${fmtRate(s.bybit)} | ${fmtRate(s.avgRate)} | ${s.crossConfirmed ? 'Yes' : 'No'} |`);
      }
    }
  } else {
    lines.push('No funding data available.');
  }
  lines.push('');

  // Capitulation
  lines.push('## Capitulation Detector');
  const cap = results.capitulation;
  if (cap?.active) {
    lines.push(`**${cap.severity}** — ${cap.signalCount}/${cap.requiredSignals} signals firing`);
    for (const s of cap.signals) lines.push(`- **${s.name}**: ${s.detail}`);
  } else {
    lines.push(`${cap?.signalCount ?? 0}/${cap?.requiredSignals ?? 3} signals. Status: ${cap?.severity ?? 'NONE'}`);
  }
  lines.push('');

  // New Listings
  lines.push('## New Listings');
  const nl = results.newListings;
  if (nl?.isFirstRun) {
    lines.push('First run — baseline cached.');
  } else if (nl?.totalNew) {
    lines.push(`**${nl.totalNew}** new listings detected.`);
    if (nl.crossListed?.length) lines.push(`- Cross-listed: ${nl.crossListed.join(', ')}`);
    if (nl.newOnMexc?.length) lines.push(`- MEXC: ${nl.newOnMexc.join(', ')}`);
    if (nl.newOnKucoin?.length) lines.push(`- KuCoin: ${nl.newOnKucoin.join(', ')}`);
  } else {
    lines.push('No new listings since last scan.');
  }
  lines.push('');

  // Retracements
  lines.push('## Retracement Buy Zones');
  const rets = results.retracements ?? [];
  if (rets.length) {
    lines.push('| Status | Symbol | Price | ATH | Drawdown | Category | Zone |');
    lines.push('|--------|--------|-------|-----|----------|----------|------|');
    for (const r of rets.slice(0, 15)) {
      lines.push(`| ${r.status} | ${r.symbol} | $${r.price} | $${r.ath} | ${r.drawdown}% | ${r.category} | ${r.buyZone.min}-${r.buyZone.max}% |`);
    }
  } else {
    lines.push('No coins in buy zones.');
  }
  lines.push('');

  // Dump Gainers
  lines.push('## Dump Gainers');
  if (results.dumpGainers?.active) {
    lines.push('| Symbol | 24h Change | Market Cap | Sub-100M |');
    lines.push('|--------|-----------|------------|----------|');
    for (const g of (results.dumpGainers.gainers ?? []).slice(0, 10)) {
      lines.push(`| ${g.symbol} | ${g.change24h.toFixed(1)}% | $${fmtNum(g.marketCap)} | ${g.isSubHundredM ? 'Yes' : 'No'} |`);
    }
  } else {
    lines.push(results.dumpGainers?.message ?? 'No data.');
  }
  lines.push('');

  // Portfolio
  lines.push('## Portfolio');
  const port = results.portfolio;
  if (port?.totalPositions) {
    lines.push(`- Positions: ${port.totalPositions}/${port.maxPositions}`);
    lines.push(`- Value: $${port.totalValue} | P&L: $${port.totalPnl} (${port.totalPnlPercent}%)`);
    lines.push('');
    lines.push('| Symbol | Type | P&L | Multiplier | Thesis |');
    lines.push('|--------|------|-----|------------|--------|');
    for (const p of port.positions) {
      lines.push(`| ${p.symbol} | ${p.type} | ${p.pnl} | ${p.multiplier} | ${p.thesis} |`);
    }
  } else {
    lines.push(`No open positions. ${port?.slotsAvailable ?? 7} slots available.`);
  }
  lines.push('');

  // Bear Market
  if (results.bearMarket?.active) {
    lines.push('## ⚡ Bear Market Signal');
    lines.push(`**${results.bearMarket.severity}** — BTC at $${fmtNum(results.bearMarket.btcPrice)}, drawdown ${results.bearMarket.drawdownPercent}%`);
    lines.push('');
    lines.push('Recommendations:');
    for (const r of results.bearMarket.recommendations) lines.push(`- ${r}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by Dan\'s Crypto Course Scanner*`);
  return lines.join('\n');
}

function fmtNum(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n?.toFixed(2) ?? '0';
}

function fmtRate(v) {
  return v !== null && v !== undefined ? `${v.toFixed(4)}%` : 'N/A';
}
