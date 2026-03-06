// Dan's Crypto Course — Scanner Configuration
// All thresholds derived from course lessons

export const CONFIG = {
  // === Market Cap Focus ===
  maxMarketCap: 100_000_000, // $100M — Dan's sub-100M focus for <$2K capital
  minMarketCap: 500_000,     // Filter dust/dead coins

  // === BTC Dump Triggers ===
  btcDump24h: -5,   // % — triggers outlier scan
  btcDump7d: -10,   // % — triggers outlier scan (weekly)

  // === Funding Rate Thresholds (Hunter Algorithm) ===
  funding: {
    moderate: -0.01,   // % — early signal
    high: -0.05,       // % — strong buy zone
    extreme: -0.10,    // % — capitulation-level funding
  },

  // === Position Management ===
  maxPositions: 7,        // Dan's max: 2-3 long-term + 3-5 short-cycle
  maxLongTerm: 3,
  maxShortCycle: 5,

  // === Retracement Buy Zones (%) ===
  retracement: {
    btc:       { min: 18, max: 22 },   // BTC pullback buy zone
    eth:       { min: 23, max: 27 },   // ETH pullback buy zone
    sol:       { min: 30, max: 50 },   // SOL pullback buy zone
    largeCap:  { min: 20, max: 30 },   // >$1B market cap
    midCap:    { min: 25, max: 40 },   // $100M-$1B
    microCap:  { min: 38, max: 62 },   // <$100M — Dan's focus
    memecoin:  { min: 40, max: 60 },   // Memecoins
  },

  // === Exit Rally Ranges (x multiplier) ===
  exitRanges: {
    btc:       { min: 2, max: 3.5 },
    eth:       { min: 3, max: 5 },
    sol:       { min: 5, max: 10 },
    largeCap:  { min: 3, max: 7 },
    midCap:    { min: 5, max: 15 },
    microCap:  { min: 10, max: 100 },
    memecoin:  { min: 10, max: 100 },
  },

  // === Capitulation Confluence ===
  capitulation: {
    minSignals: 3,  // Need 3 of 5 to confirm
    signals: [
      'negativeFunding',
      'btcDump',
      'crossExchangeConfirmation',
      'highVolumeSpike',
      'extremeFearIndex',
    ],
  },

  // === Bear Market Detection (Fibonacci) ===
  bearMarket: {
    fibLow: 0.5,    // 50% retracement
    fibHigh: 0.618,  // 61.8% retracement
  },

  // === Signal Weights (for composite score) ===
  weights: {
    outlier: 0.30,
    funding: 0.20,
    capitulation: 0.20,
    newListings: 0.10,
    retracement: 0.10,
    dumpGainers: 0.10,
  },

  // === API Configuration ===
  api: {
    coingecko: {
      baseUrl: 'https://api.coingecko.com/api/v3',
      coinsPerPage: 250,     // max per request
      pages: 4,              // 4 pages × 250 = top 1000
    },
    binance: {
      baseUrl: 'https://fapi.binance.com',
    },
    bybit: {
      baseUrl: 'https://api.bybit.com',
    },
    mexc: {
      baseUrl: 'https://api.mexc.com',
    },
    kucoin: {
      baseUrl: 'https://api.kucoin.com',
    },
  },

  // === Output ===
  reportDir: 'output/reports',
  dataDir: 'scripts/data',
};
