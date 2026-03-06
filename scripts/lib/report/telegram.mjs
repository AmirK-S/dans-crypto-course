import fetch from 'node-fetch';

function getConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    openRouterKey: process.env.OPENROUTER_API_KEY,
  };
}

/**
 * Send scan report to Telegram.
 * Uses an LLM to write a plain-language summary that a non-expert can understand.
 * Only sends detailed alerts when something actually matters.
 */
export async function sendTelegramReport(results, score) {
  const { token, chatId, openRouterKey } = getConfig();
  if (!token || !chatId) {
    console.log('  ⚠ Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    return false;
  }

  let message;

  if (openRouterKey) {
    message = await generateSmartSummary(results, score, openRouterKey);
  } else {
    message = buildFallbackMessage(results, score);
  }

  // Split if too long (Telegram 4096 char limit)
  const chunks = splitMessage(message, 4000);
  for (const chunk of chunks) {
    await sendMessage(token, chatId, chunk);
    await new Promise((r) => setTimeout(r, 300));
  }

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
   - Score 30-49: "🟡 Quelques trucs à surveiller mais pas de quoi agir. Si t'es curieux, demande à Claude d'analyser [coins]."
   - Score 50-69: "🟢 Ça bouge. Va voir Claude et demande-lui de creuser [coins] avant de faire quoi que ce soit."
   - Score 70+: "🔥 Journée importante. Plusieurs signaux alignés sur [coins]. Parle à Claude AVANT d'agir."
   - Bear market/capitulation: "🐻 ALERTE: [explanation]. Parle à Claude immédiatement."

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

  // Outliers
  if (results.outliers?.active) {
    lines.push(`OUTLIER SIGNAL ACTIVE: BTC dumping but these coins held up:`);
    for (const o of results.outliers.outliers.slice(0, 5)) {
      lines.push(`  ${o.symbol} (${o.name}): ${o.change > 0 ? '+' : ''}${o.change.toFixed(1)}% while BTC did ${o.btcDrop.toFixed(1)}%. Market cap $${fmtNum(o.marketCap)}`);
    }
  }

  // Funding
  const fs = results.funding?.summary;
  if (fs) {
    lines.push(`Funding: ${fs.extremeCount} coins with extreme negative funding (traders heavily shorting them), ${fs.highCount} high`);
    const top = (results.funding?.signals ?? []).slice(0, 5);
    if (top.length) {
      lines.push(`Top negative funding (potential bounce candidates):`);
      for (const s of top) {
        lines.push(`  ${s.symbol}: avg ${s.avgRate.toFixed(4)}%${s.crossConfirmed ? ' (confirmed on multiple exchanges)' : ''}`);
      }
    }
  }

  // Capitulation
  if (results.capitulation?.active) {
    lines.push(`CAPITULATION DETECTED (${results.capitulation.severity}): ${results.capitulation.signalCount} of ${results.capitulation.requiredSignals} panic signals firing — historically a great buy zone`);
  }

  // New listings
  const nl = results.newListings;
  if (nl && !nl.isFirstRun && nl.totalNew > 0) {
    lines.push(`${nl.totalNew} new coins just listed on exchanges: ${[...(nl.newOnMexc ?? []), ...(nl.newOnKucoin ?? [])].slice(0, 5).join(', ')}`);
  }

  // Retracements
  const microRets = (results.retracements ?? []).filter(r => r.status === 'IN_ZONE' && r.category === 'Micro Cap');
  if (microRets.length) {
    lines.push(`${microRets.length} small-cap coins in potential buy zones (pulled back significantly from their highs):`);
    for (const r of microRets.slice(0, 5)) {
      lines.push(`  ${r.symbol}: down ${r.drawdown}% from all-time high of $${r.ath}`);
    }
  }

  // Dump gainers
  if (results.dumpGainers?.active) {
    lines.push(`Market is down but these coins are GREEN (sign of accumulation):`);
    for (const g of (results.dumpGainers.gainers ?? []).slice(0, 5)) {
      lines.push(`  ${g.symbol}: +${g.change24h.toFixed(1)}%, market cap $${fmtNum(g.marketCap)}`);
    }
  }

  // Portfolio
  if (results.portfolio?.totalPositions) {
    lines.push(`Portfolio: ${results.portfolio.totalPositions} positions, total P&L: ${results.portfolio.totalPnl >= 0 ? '+' : ''}$${results.portfolio.totalPnl}`);
  } else {
    lines.push(`Portfolio: empty, 7 slots available`);
  }

  // Bear market
  if (results.bearMarket?.active) {
    lines.push(`BEAR MARKET SIGNAL: BTC down ${results.bearMarket.drawdownPercent}% from all-time high — in the danger zone`);
  }

  // Exit alerts
  if (results.exitAlerts?.length) {
    for (const a of results.exitAlerts) lines.push(`EXIT ALERT: ${a.message}`);
  }

  return lines.join('\n');
}

/** Fallback if LLM is unavailable */
function buildFallbackMessage(results, score) {
  const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const emoji = score.total >= 60 ? '🟢' : score.total >= 40 ? '🟡' : '⚪';

  let msg = `📊 <b>DanScan — ${date}</b>\n\n`;
  msg += `${emoji} Score: ${score.total}/100\n`;

  if (score.total < 30) {
    msg += `\nQuiet day. Nothing to act on. Check back tomorrow.`;
  } else if (score.total < 60) {
    msg += `\nSome signals showing up — might be worth a look.`;
    const fs = results.funding?.summary;
    if (fs?.extremeCount) msg += `\n${fs.extremeCount} coins with heavy short interest (potential bounce).`;
  } else {
    msg += `\n<b>Notable day!</b> Multiple signals firing.`;
  }

  if (results.bearMarket?.active) {
    msg += `\n\n🐻 <b>Bear market warning</b> — BTC down ${results.bearMarket.drawdownPercent}% from ATH.`;
  }

  if (results.capitulation?.active) {
    msg += `\n\n🚨 <b>Capitulation detected</b> — historically a great time to buy.`;
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
