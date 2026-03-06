/**
 * Terminal Report Formatter — Colored output for daily scan results.
 */

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const hr = () => C.dim + '─'.repeat(60) + C.reset;
const heading = (text) => `\n${C.bold}${C.cyan}▸ ${text}${C.reset}\n${hr()}`;
const warn = (text) => `${C.yellow}⚠ ${text}${C.reset}`;
const ok = (text) => `${C.green}✓ ${text}${C.reset}`;
const alert = (text) => `${C.red}⚡ ${text}${C.reset}`;
const pnl = (v) => (v >= 0 ? `${C.green}+${v.toFixed(1)}%${C.reset}` : `${C.red}${v.toFixed(1)}%${C.reset}`);
const usd = (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function formatReport(results, score) {
  const lines = [];
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Header
  lines.push('');
  lines.push(`${C.bold}${C.magenta}╔════════════════════════════════════════════════╗${C.reset}`);
  lines.push(`${C.bold}${C.magenta}║   DAILY CRYPTO SCANNER — Dan's Course Engine   ║${C.reset}`);
  lines.push(`${C.bold}${C.magenta}╚════════════════════════════════════════════════╝${C.reset}`);
  lines.push(`${C.dim}${date}${C.reset}`);

  // Composite Score
  lines.push(heading('COMPOSITE SCORE'));
  const scoreColor = score.total >= 60 ? C.green : score.total >= 40 ? C.yellow : C.dim;
  lines.push(`  ${C.bold}Score: ${scoreColor}${score.total}/100${C.reset}`);
  lines.push(`  ${score.interpretation}`);
  lines.push('');
  for (const [key, val] of Object.entries(score.breakdown)) {
    const bar = '█'.repeat(Math.round(val.score / 10)) + '░'.repeat(10 - Math.round(val.score / 10));
    lines.push(`  ${pad(key, 14)} ${bar} ${val.score} (×${val.weight} = ${val.weighted})`);
  }

  // Outlier Detection
  lines.push(heading('OUTLIER DETECTION'));
  if (results.outliers?.active) {
    lines.push(alert(`BTC dumping ${results.outliers.btcChange24h.toFixed(1)}% — outlier scan active`));
    for (const o of results.outliers.outliers.slice(0, 10)) {
      lines.push(`  ${C.bold}${pad(o.symbol, 10)}${C.reset} ${pnl(o.change)} | MCap ${usd(o.marketCap)} | Strength: ${C.green}+${o.relativeStrength.toFixed(1)}%${C.reset}`);
    }
  } else {
    lines.push(`  ${C.dim}No BTC dump detected (24h: ${results.outliers?.btcChange24h?.toFixed(1) ?? '?'}%, 7d: ${results.outliers?.btcChange7d?.toFixed(1) ?? '?'}%). Signal inactive.${C.reset}`);
  }

  // Funding Rates
  lines.push(heading('FUNDING RATES (Hunter Algorithm)'));
  const fs = results.funding?.summary;
  if (fs) {
    lines.push(`  Market avg: ${fs.avgMarketFunding < 0 ? C.green : C.dim}${fs.avgMarketFunding.toFixed(4)}%${C.reset} | Negative: ${fs.negativeFunding}/${fs.totalPairs}`);
    if (fs.extremeCount) lines.push(alert(`${fs.extremeCount} coins with EXTREME negative funding`));
    for (const s of (results.funding?.signals ?? []).slice(0, 10)) {
      const sev = s.severity === 'EXTREME' ? C.red : s.severity === 'HIGH' ? C.yellow : C.dim;
      lines.push(`  ${sev}${pad(s.severity, 9)}${C.reset} ${C.bold}${pad(s.symbol, 10)}${C.reset} Binance: ${fmt(s.binance)}% | Bybit: ${fmt(s.bybit)}% | Avg: ${fmt(s.avgRate)}%${s.crossConfirmed ? ` ${C.green}✓ cross${C.reset}` : ''}`);
    }
  } else {
    lines.push(`  ${C.dim}No funding data available.${C.reset}`);
  }

  // Capitulation
  lines.push(heading('CAPITULATION DETECTOR'));
  const cap = results.capitulation;
  if (cap?.active) {
    lines.push(alert(`CAPITULATION ${cap.severity} — ${cap.signalCount}/${cap.requiredSignals} signals`));
    for (const s of cap.signals) lines.push(`  ${C.yellow}• ${s.name}${C.reset}: ${s.detail}`);
  } else {
    lines.push(`  ${C.dim}${cap?.signalCount ?? 0}/${cap?.requiredSignals ?? 3} signals. ${cap?.severity === 'WARMING' ? warn('Warming — watch closely') : 'No capitulation detected.'}${C.reset}`);
  }

  // New Listings
  lines.push(heading('NEW LISTINGS'));
  const nl = results.newListings;
  if (nl?.isFirstRun) {
    lines.push(`  ${C.dim}First run — baseline cached. New listings will appear on next scan.${C.reset}`);
  } else if (nl?.totalNew) {
    lines.push(ok(`${nl.totalNew} new listings detected`));
    if (nl.crossListed?.length) lines.push(alert(`Cross-listed: ${nl.crossListed.join(', ')}`));
    if (nl.newOnMexc?.length) lines.push(`  MEXC: ${nl.newOnMexc.slice(0, 8).join(', ')}`);
    if (nl.newOnKucoin?.length) lines.push(`  KuCoin: ${nl.newOnKucoin.slice(0, 8).join(', ')}`);
  } else {
    lines.push(`  ${C.dim}No new listings since last scan.${C.reset}`);
  }

  // Retracements
  lines.push(heading('RETRACEMENT BUY ZONES'));
  const rets = results.retracements ?? [];
  const inZone = rets.filter((r) => r.status === 'IN_ZONE');
  if (inZone.length) {
    for (const r of inZone.slice(0, 10)) {
      lines.push(`  ${C.green}IN ZONE${C.reset}  ${C.bold}${pad(r.symbol, 8)}${C.reset} ${usd(r.price)} | ATH ${usd(r.ath)} | Down ${r.drawdown}% | ${r.category} (${r.buyZone.min}-${r.buyZone.max}%)`);
    }
  }
  const approaching = rets.filter((r) => r.status === 'APPROACHING');
  if (approaching.length) {
    for (const r of approaching.slice(0, 5)) {
      lines.push(`  ${C.yellow}NEAR${C.reset}     ${pad(r.symbol, 8)} ${usd(r.price)} | Down ${r.drawdown}% | Zone: ${r.buyZone.min}-${r.buyZone.max}%`);
    }
  }
  if (!rets.length) lines.push(`  ${C.dim}No coins in buy zones currently.${C.reset}`);

  // Dump Gainers
  lines.push(heading('DUMP GAINERS'));
  if (results.dumpGainers?.active) {
    for (const g of (results.dumpGainers.gainers ?? []).slice(0, 8)) {
      lines.push(`  ${C.green}▲${C.reset} ${C.bold}${pad(g.symbol, 10)}${C.reset} ${pnl(g.change24h)} | MCap ${usd(g.marketCap)}${g.isSubHundredM ? ` ${C.cyan}★ sub-100M${C.reset}` : ''}`);
    }
  } else {
    lines.push(`  ${C.dim}${results.dumpGainers?.message ?? 'No data.'}${C.reset}`);
  }

  // Portfolio
  lines.push(heading('PORTFOLIO'));
  const port = results.portfolio;
  if (port?.totalPositions) {
    lines.push(`  Positions: ${port.totalPositions}/${port.maxPositions} | Value: ${usd(port.totalValue)} | P&L: ${port.totalPnl >= 0 ? C.green : C.red}${usd(port.totalPnl)} (${port.totalPnlPercent}%)${C.reset}`);
    for (const p of port.positions) {
      lines.push(`  ${pad(p.symbol, 8)} ${p.pnl} (${p.multiplier}) | ${C.dim}${p.thesis}${C.reset}`);
    }
  } else {
    lines.push(`  ${C.dim}No open positions. ${port?.slotsAvailable ?? 7} slots available.${C.reset}`);
  }

  // Exit Alerts
  if (results.exitAlerts?.length) {
    lines.push(heading('EXIT ALERTS'));
    for (const a of results.exitAlerts) {
      const color = a.status === 'PAST_EXIT_RANGE' ? C.red : a.status === 'IN_EXIT_RANGE' ? C.yellow : C.dim;
      lines.push(`  ${color}${a.message}${C.reset}`);
    }
  }

  // Thesis Alerts
  if (results.thesisAlerts?.alerts?.length) {
    lines.push(heading('THESIS INVALIDATION ALERTS'));
    for (const a of results.thesisAlerts.alerts) {
      if (a.error) {
        lines.push(warn(`${a.symbol}: ${a.error}`));
      } else {
        lines.push(alert(`${a.symbol}: ${a.reason} (confidence: ${a.confidence}%)`));
      }
    }
  }

  // Bear Market
  if (results.bearMarket?.active) {
    lines.push(heading('BEAR MARKET SIGNAL'));
    lines.push(alert(`Bear market ${results.bearMarket.severity}`));
    lines.push(`  BTC: ${usd(results.bearMarket.btcPrice)} | ATH: ${usd(results.bearMarket.btcAth)} | Drawdown: ${results.bearMarket.drawdownPercent}%`);
    for (const r of results.bearMarket.recommendations) lines.push(`  ${C.yellow}→ ${r}${C.reset}`);
  }

  lines.push('');
  lines.push(hr());
  lines.push(`${C.dim}Scan complete at ${new Date().toLocaleTimeString()}${C.reset}`);
  lines.push('');

  return lines.join('\n');
}

function pad(s, n) {
  return (s ?? '').toString().padEnd(n);
}

function fmt(v) {
  return v !== null && v !== undefined ? v.toFixed(4) : '  N/A ';
}
