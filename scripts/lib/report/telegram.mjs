import fetch from 'node-fetch';

function getConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatIds: (process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean),
    openRouterKey: process.env.OPENROUTER_API_KEY,
  };
}

/**
 * Send scan report to Telegram.
 * Message 1: Plain-language summary (for Amir)
 * Message 2: Copy-paste block for Claude (only when score >= 30)
 */
export async function sendTelegramReport(results, score) {
  const { token, chatIds, openRouterKey } = getConfig();
  if (!token || !chatIds.length) {
    console.log('  ⚠ Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    return false;
  }

  // Message 1: Human-friendly summary
  let summary;
  if (openRouterKey) {
    summary = await generateSmartSummary(results, score, openRouterKey);
  } else {
    summary = buildFallbackMessage(results, score);
  }

  // Message 2: Copy-paste block for Claude (separate message, easy to copy)
  const claudeBlock = score.total >= 30 ? buildClaudeBlock(results, score) : null;

  // Send to all recipients
  for (const chatId of chatIds) {
    const chunks = splitMessage(summary, 4000);
    for (const chunk of chunks) {
      await sendMessage(token, chatId, chunk);
      await new Promise((r) => setTimeout(r, 300));
    }
    if (claudeBlock) {
      await new Promise((r) => setTimeout(r, 500));
      await sendMessage(token, chatId, claudeBlock);
    }
  }

  console.log(`  ✓ Telegram sent to ${chatIds.length} recipient(s)`);
  return true;
}

async function sendMessage(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Telegram ${res.status}: ${err.slice(0, 200)}`);
  }
}

/**
 * Build the copy-paste message for Claude.
 * This is a SEPARATE Telegram message so Amir can just tap-and-copy the whole thing.
 * Contains all raw data + course context so Claude has full context.
 */
function buildClaudeBlock(results, score) {
  const lines = [];

  lines.push(`📋 Copie ce message et colle-le à Claude:`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`Mon scanner crypto (basé sur la formation de Dan) vient de tourner. Voici les données du jour. Analyse-les et dis-moi concrètement si je devrais agir ou pas. Je suis débutant avec moins de 2000$ à investir.`);
  lines.push(``);
  lines.push(`Score du jour: ${score.total}/100`);
  lines.push(`BTC 24h: ${results.outliers?.btcChange24h?.toFixed(1) ?? '?'}% | 7j: ${results.outliers?.btcChange7d?.toFixed(1) ?? '?'}%`);
  lines.push(``);

  // Outliers
  if (results.outliers?.active) {
    lines.push(`SIGNAL — Outliers (coins qui tiennent pendant que BTC chute):`);
    for (const o of results.outliers.outliers.slice(0, 5)) {
      lines.push(`  ${o.symbol} (${o.name}): ${o.change > 0 ? '+' : ''}${o.change.toFixed(1)}% vs BTC ${o.btcDrop.toFixed(1)}% | MCap $${fmtNum(o.marketCap)}`);
    }
    lines.push(``);
  }

  // Funding
  const fs = results.funding?.summary;
  if (fs && (fs.extremeCount > 0 || fs.highCount > 0)) {
    lines.push(`SIGNAL — Funding négatif (traders parient massivement à la baisse):`);
    lines.push(`  Marché: avg ${fs.avgMarketFunding.toFixed(4)}% | ${fs.negativeFunding}/${fs.totalPairs} paires négatives`);
    lines.push(`  Extrême: ${fs.extremeCount} | Élevé: ${fs.highCount} | Modéré: ${fs.moderateCount}`);
    for (const s of (results.funding?.signals ?? []).slice(0, 8)) {
      lines.push(`  ${s.symbol}: ${s.avgRate.toFixed(4)}% [${s.severity}]${s.crossConfirmed ? ' ✓ multi-exchange' : ''} | Binance: ${fmtRate(s.binance)} | Bybit: ${fmtRate(s.bybit)}`);
    }
    lines.push(``);
  }

  // Capitulation
  if (results.capitulation?.active) {
    lines.push(`SIGNAL — Capitulation détectée (${results.capitulation.severity}):`);
    for (const s of results.capitulation.signals) {
      lines.push(`  ${s.name}: ${s.detail}`);
    }
    lines.push(``);
  }

  // New listings
  const nl = results.newListings;
  if (nl && !nl.isFirstRun && nl.totalNew > 0) {
    lines.push(`SIGNAL — Nouveaux listings (${nl.totalNew}):`);
    if (nl.crossListed?.length) lines.push(`  Cross-listé: ${nl.crossListed.join(', ')}`);
    if (nl.newOnMexc?.length) lines.push(`  MEXC: ${nl.newOnMexc.slice(0, 8).join(', ')}`);
    if (nl.newOnKucoin?.length) lines.push(`  KuCoin: ${nl.newOnKucoin.slice(0, 8).join(', ')}`);
    lines.push(``);
  }

  // Retracements
  const rets = (results.retracements ?? []).filter(r => r.status === 'IN_ZONE');
  if (rets.length) {
    lines.push(`SIGNAL — Coins en zone d'achat (pullback depuis ATH):`);
    for (const r of rets.slice(0, 8)) {
      lines.push(`  ${r.symbol}: $${r.price} | ATH $${r.ath} | -${r.drawdown}% | ${r.category} (zone: ${r.buyZone.min}-${r.buyZone.max}%)`);
    }
    lines.push(``);
  }

  // Dump gainers
  if (results.dumpGainers?.active && results.dumpGainers.gainers?.length) {
    lines.push(`SIGNAL — Coins verts pendant le dump:`);
    for (const g of results.dumpGainers.gainers.slice(0, 5)) {
      lines.push(`  ${g.symbol}: +${g.change24h.toFixed(1)}% | MCap $${fmtNum(g.marketCap)}`);
    }
    lines.push(``);
  }

  // Bear market
  if (results.bearMarket?.active) {
    lines.push(`ALERTE — Bear market: BTC à $${fmtNum(results.bearMarket.btcPrice)} | -${results.bearMarket.drawdownPercent}% depuis ATH | Sévérité: ${results.bearMarket.severity}`);
    lines.push(``);
  }

  // Portfolio
  if (results.portfolio?.totalPositions) {
    lines.push(`Portfolio: ${results.portfolio.totalPositions}/${results.portfolio.maxPositions} positions | Valeur: $${results.portfolio.totalValue} | P&L: $${results.portfolio.totalPnl} (${results.portfolio.totalPnlPercent}%)`);
  } else {
    lines.push(`Portfolio: vide, 7 slots disponibles.`);
  }

  lines.push(``);
  lines.push(`Principes de Dan à appliquer: focus sub-100M market cap, max 7 positions, chercher les coins qui résistent quand BTC chute, funding négatif = zone d'achat historique, capitulation (3+ signaux) = meilleur moment pour acheter.`);
  lines.push(``);
  lines.push(`Dis-moi quoi faire concrètement.`);

  return lines.join('\n');
}

/** Use LLM to write a human-friendly summary */
async function generateSmartSummary(results, score, apiKey) {
  const dataSnapshot = buildDataSnapshot(results, score);

  const prompt = `You are DanScan, a daily crypto scanner bot. The user is a TOTAL BEGINNER. They have never traded. They have <$2K. They have an AI assistant called Claude they can go talk to for research.

Think of yourself like a weather app for crypto. The weather app doesn't say "barometric pressure dropping" — it says "bring an umbrella." That's your job.

Write a short Telegram message. Write in FRENCH (the user speaks French). Be casual, like texting a friend.

WHAT TO SAY:

1. <b>Météo du marché</b>: Is it sunny, cloudy, or storming? One line.
   - BTC up = sunny. BTC flat = cloudy. BTC down = rainy. BTC crash = storm.

2. <b>What the scanner found</b> — ONLY if there are actual signals. For each coin, explain it like this:
   - What's happening: "Tout le monde parie que X va baisser" (not "negative funding")
   - Why it matters: "Quand tout le monde parie à la baisse comme ça, souvent ça rebondit"
   - How strong: "Confirmé sur 2 exchanges" = stronger than 1
   - Keep it to 2-4 coins MAX, only the most interesting ones

3. <b>Verdict</b> — the MOST IMPORTANT part. Must match the score:
   - Score <30: "⚪ Rien à faire aujourd'hui. On surveille."
   - Score 30-49: "🟡 Quelques trucs à surveiller mais pas de quoi agir. Le message suivant contient les détails — copie-le à Claude si tu veux creuser."
   - Score 50-69: "🟢 Ça bouge. Copie le message suivant et envoie-le à Claude pour qu'il t'analyse tout ça."
   - Score 70+: "🔥 Journée importante. Copie le message suivant et envoie-le à Claude MAINTENANT."
   - Bear market/capitulation: "🐻 ALERTE. Copie le message suivant et parle à Claude immédiatement."

RULES:
- Write in FRENCH
- ZERO jargon. If you catch yourself writing "funding rate", "short squeeze", "retracement", "confluence" — rewrite it in normal words.
- Instead of "negative funding" → "les traders parient massivement à la baisse sur ce coin"
- Instead of "retracement buy zone" → "ce coin a perdu X% depuis son plus haut, c'est le genre de creux où les acheteurs reviennent souvent"
- Instead of "confirmed on multiple exchanges" → "le signal est visible sur plusieurs plateformes, ce qui le rend plus fiable"
- Instead of "short squeeze potential" → "quand tout le monde parie à la baisse, le prix a tendance à remonter d'un coup"
- Don't explain what DanScan is or how it works
- Quiet days = 4-5 lines max. Don't invent excitement.
- Keep under 1500 characters
- Use Telegram HTML: <b>bold</b>, <i>italic</i>
- Header: "📊 <b>DanScan</b> — [Jour, Mois Jour]"
- IMPORTANT: Do NOT include a copy-paste block or raw data. A separate message handles that.

Here's today's raw data:
${dataSnapshot}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.log(`  ⚠ OpenRouter ${res.status}: ${err.slice(0, 100)}`);
      return buildFallbackMessage(results, score);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return buildFallbackMessage(results, score);
    return text;
  } catch (err) {
    console.log(`  ⚠ LLM summary failed: ${err.message}`);
    return buildFallbackMessage(results, score);
  }
}

/** Build a compact data snapshot for the LLM */
function buildDataSnapshot(results, score) {
  const lines = [];
  lines.push(`Score: ${score.total}/100 — ${score.interpretation}`);
  lines.push(`BTC 24h: ${results.outliers?.btcChange24h?.toFixed(1) ?? '?'}%, 7d: ${results.outliers?.btcChange7d?.toFixed(1) ?? '?'}%`);

  if (results.outliers?.active) {
    lines.push(`OUTLIER SIGNAL ACTIVE: BTC dumping but these coins held up:`);
    for (const o of results.outliers.outliers.slice(0, 5)) {
      lines.push(`  ${o.symbol} (${o.name}): ${o.change > 0 ? '+' : ''}${o.change.toFixed(1)}% while BTC did ${o.btcDrop.toFixed(1)}%. Market cap $${fmtNum(o.marketCap)}`);
    }
  }

  const fs = results.funding?.summary;
  if (fs) {
    lines.push(`Funding: ${fs.extremeCount} extreme, ${fs.highCount} high`);
    for (const s of (results.funding?.signals ?? []).slice(0, 5)) {
      lines.push(`  ${s.symbol}: avg ${s.avgRate.toFixed(4)}%${s.crossConfirmed ? ' (confirmed multi-exchange)' : ''}`);
    }
  }

  if (results.capitulation?.active) {
    lines.push(`CAPITULATION (${results.capitulation.severity}): ${results.capitulation.signalCount}/${results.capitulation.requiredSignals} signals`);
  }

  const nl = results.newListings;
  if (nl && !nl.isFirstRun && nl.totalNew > 0) {
    lines.push(`${nl.totalNew} new listings: ${[...(nl.newOnMexc ?? []), ...(nl.newOnKucoin ?? [])].slice(0, 5).join(', ')}`);
  }

  const microRets = (results.retracements ?? []).filter(r => r.status === 'IN_ZONE' && r.category === 'Micro Cap');
  if (microRets.length) {
    lines.push(`${microRets.length} micro-caps in buy zones:`);
    for (const r of microRets.slice(0, 5)) {
      lines.push(`  ${r.symbol}: down ${r.drawdown}% from ATH $${r.ath}`);
    }
  }

  if (results.dumpGainers?.active) {
    lines.push(`Dump gainers (green during selloff):`);
    for (const g of (results.dumpGainers.gainers ?? []).slice(0, 5)) {
      lines.push(`  ${g.symbol}: +${g.change24h.toFixed(1)}%, mcap $${fmtNum(g.marketCap)}`);
    }
  }

  if (results.bearMarket?.active) {
    lines.push(`BEAR MARKET: BTC -${results.bearMarket.drawdownPercent}% from ATH`);
  }

  return lines.join('\n');
}

/** Fallback if LLM is unavailable */
function buildFallbackMessage(results, score) {
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric' });
  const emoji = score.total >= 60 ? '🟢' : score.total >= 40 ? '🟡' : '⚪';

  let msg = `📊 <b>DanScan — ${date}</b>\n\n`;
  msg += `${emoji} Score: ${score.total}/100\n`;

  if (score.total < 30) {
    msg += `\nRien à faire aujourd'hui. On surveille.`;
  } else if (score.total < 60) {
    msg += `\nQuelques signaux. Copie le message suivant et envoie-le à Claude si tu veux creuser.`;
  } else {
    msg += `\n<b>Journée notable!</b> Copie le message suivant et parle à Claude.`;
  }

  if (results.bearMarket?.active) {
    msg += `\n\n🐻 <b>Alerte bear market</b> — BTC -${results.bearMarket.drawdownPercent}% depuis ATH.`;
  }

  if (results.capitulation?.active) {
    msg += `\n\n🚨 <b>Capitulation détectée</b> — historiquement le meilleur moment pour acheter.`;
  }

  return msg;
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut === -1) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

function fmtNum(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n?.toFixed(2) ?? '0';
}

function fmtRate(v) {
  return v !== null && v !== undefined ? `${v.toFixed(4)}%` : 'N/A';
}
