import Anthropic from '@anthropic-ai/sdk';

/**
 * AI-Powered Thesis Invalidation Monitor
 *
 * For each position with a defined thesis and invalidation condition,
 * uses Haiku to analyze whether current market data invalidates the thesis.
 */
export async function checkTheses(portfolio, coins) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { checked: 0, alerts: [], skipped: 'No ANTHROPIC_API_KEY' };
  }

  const positionsWithThesis = portfolio.positions.filter(
    (p) => p.thesis && p.invalidation
  );

  if (positionsWithThesis.length === 0) {
    return { checked: 0, alerts: [], skipped: 'No positions with thesis/invalidation' };
  }

  const client = new Anthropic();
  const alerts = [];

  for (const pos of positionsWithThesis) {
    const coinData = coins.find(
      (c) => c.id === pos.coinId || c.symbol.toLowerCase() === pos.symbol.toLowerCase()
    );

    const prompt = `You are a crypto position analyst. Evaluate whether this thesis is invalidated.

Position: ${pos.symbol} (${pos.name ?? pos.coinId})
Entry: $${pos.entryPrice} | Current: $${coinData?.current_price ?? 'unknown'}
Thesis: ${pos.thesis}
Invalidation condition: ${pos.invalidation}

Current data:
- Price: $${coinData?.current_price ?? 'N/A'}
- 24h change: ${coinData?.price_change_percentage_24h?.toFixed(1) ?? 'N/A'}%
- 7d change: ${coinData?.price_change_percentage_7d_in_currency?.toFixed(1) ?? 'N/A'}%
- Market cap: $${coinData?.market_cap?.toLocaleString() ?? 'N/A'}
- ATH: $${coinData?.ath ?? 'N/A'}

Respond with ONLY a JSON object (no markdown):
{"invalidated": true/false, "confidence": 0-100, "reason": "brief explanation"}`;

    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content[0]?.text ?? '';
      const result = JSON.parse(text);
      if (result.invalidated) {
        alerts.push({
          symbol: pos.symbol,
          thesis: pos.thesis,
          invalidation: pos.invalidation,
          ...result,
        });
      }
    } catch (err) {
      alerts.push({
        symbol: pos.symbol,
        error: `Analysis failed: ${err.message}`,
      });
    }
  }

  return {
    checked: positionsWithThesis.length,
    alerts,
  };
}
