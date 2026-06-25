import type { AssetMarketData, AssetSymbol, MarketSnapshot } from "@/lib/types";
import { ASSETS, assetMeta } from "@/lib/market/assets";
import { clamp, clamp01, round } from "@/lib/util/num";
import { isUsMarketOpen } from "@/lib/util/time";

// LIVE market data — real tokenized-stock prices from Bitget + real underlying
// equity prices from Yahoo Finance. This is what makes the product real: the
// fair-value gap is an actual tokenized-vs-underlying tracking error, the spread
// is the real Bitget order-book spread, and velocity/volatility come from real
// candles.
//
// Signals we cannot source for free in real time (news catalysts, social hype,
// macro/earnings events) are DERIVED from real price action and clearly labeled
// as such — never fabricated. Macro/earnings event flags are off in live mode.
//
// Everything is wrapped in timeouts + a 60s cache, and any failure lets the
// caller fall back to the reproducible simulation so the app never breaks.

const BITGET_BASE = "https://api.bitget.com/api/v2/spot/market";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

interface LiveMap {
  bitget: string; // Bitget tokenized-stock symbol
  yahoo: string; // Yahoo underlying ticker
}

const LIVE_MAP: Record<AssetSymbol, LiveMap> = {
  NVDAx: { bitget: "RNVDAUSDT", yahoo: "NVDA" },
  TSLAx: { bitget: "RTSLAUSDT", yahoo: "TSLA" },
  AAPLx: { bitget: "RAAPLUSDT", yahoo: "AAPL" },
  COINx: { bitget: "RCOINUSDT", yahoo: "COIN" },
  HOODx: { bitget: "RHOODUSDT", yahoo: "HOOD" },
};

async function fetchJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 CounterFlowOS" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// --- Bitget --------------------------------------------------------------

interface BitgetTicker {
  symbol: string;
  lastPr: string;
  bidPr: string;
  askPr: string;
  baseVolume: string;
  change24h: string; // fraction, e.g. "-0.0104"
}

async function getBitgetTickers(): Promise<Map<string, BitgetTicker>> {
  const j = await fetchJson<{ code: string; data: BitgetTicker[] }>(
    `${BITGET_BASE}/tickers`,
  );
  const map = new Map<string, BitgetTicker>();
  for (const t of j.data ?? []) map.set(t.symbol, t);
  return map;
}

interface CandleStats {
  velocityPct: number; // % move over the recent window
  volatilityPct: number; // realized hourly vol, %
  volSpike: number; // last-bar volume vs average (1 = neutral)
}

async function getCandleStats(bitgetSym: string): Promise<CandleStats> {
  try {
    // [ ts, open, high, low, close, baseVol, quoteVol ]
    const j = await fetchJson<{ data: string[][] }>(
      `${BITGET_BASE}/candles?symbol=${bitgetSym}&granularity=1h&limit=24`,
    );
    const rows = [...(j.data ?? [])].sort((a, b) => Number(a[0]) - Number(b[0]));
    const closes = rows.map((r) => Number(r[4])).filter((n) => n > 0);
    const vols = rows.map((r) => Number(r[5]));
    if (closes.length < 4) return { velocityPct: 0, volatilityPct: 1.5, volSpike: 1 };

    const lookback = Math.min(6, closes.length - 1);
    const base = closes[closes.length - 1 - lookback];
    const last = closes[closes.length - 1];
    const velocityPct = base > 0 ? ((last - base) / base) * 100 : 0;

    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const volatilityPct = Math.sqrt(variance) * 100;

    const nonZeroVols = vols.filter((v) => v > 0);
    const avgVol =
      nonZeroVols.length > 0
        ? nonZeroVols.reduce((a, b) => a + b, 0) / nonZeroVols.length
        : 0;
    const lastVol = vols[vols.length - 1] || avgVol;
    const volSpike = avgVol > 0 ? lastVol / avgVol : 1;

    return {
      velocityPct: round(velocityPct, 2),
      volatilityPct: round(clamp(volatilityPct, 0.3, 8), 2),
      volSpike: round(clamp(volSpike, 0.3, 4), 2),
    };
  } catch {
    return { velocityPct: 0, volatilityPct: 1.5, volSpike: 1 };
  }
}

// --- Yahoo ---------------------------------------------------------------

interface YahooQuote {
  price: number;
  prevClose: number;
}

async function getYahooQuote(sym: string): Promise<YahooQuote | null> {
  try {
    const j = await fetchJson<{
      chart: { result: { meta: { regularMarketPrice: number; chartPreviousClose: number } }[] };
    }>(`${YAHOO_BASE}/${encodeURIComponent(sym)}?interval=1d&range=2d`);
    const m = j.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice) return null;
    return { price: m.regularMarketPrice, prevClose: m.chartPreviousClose ?? m.regularMarketPrice };
  } catch {
    return null;
  }
}

function changePct(q: YahooQuote | null): number {
  if (!q || !q.prevClose) return 0;
  return round(((q.price - q.prevClose) / q.prevClose) * 100, 2);
}

// --- Snapshot assembly ---------------------------------------------------

function sameSign(a: number, b: number): boolean {
  return (a >= 0 && b >= 0) || (a < 0 && b < 0);
}

function buildSnapshot(
  symbol: AssetSymbol,
  ticker: BitgetTicker,
  candles: CandleStats,
  underlying: YahooQuote | null,
  cross: { qqqPct: number; nqPct: number; dxyPct: number },
  timestamp: string,
): MarketSnapshot {
  const base = ASSETS[symbol];
  const tokenPrice = Number(ticker.lastPr);
  const bid = Number(ticker.bidPr);
  const ask = Number(ticker.askPr);
  const spreadPct = tokenPrice > 0 ? round(((ask - bid) / tokenPrice) * 100, 3) : 0.2;
  const token24hPct = round(Number(ticker.change24h) * 100, 2);

  const marketOpen = isUsMarketOpen(new Date(timestamp));
  const underlyingPrice = underlying?.price ?? tokenPrice;

  // After hours the underlying tape is stale, so fair value leans on futures.
  const futuresAdj = marketOpen ? 0 : (cross.nqPct / 100) * base.beta * 0.5;
  const estimatedFairValue = round(underlyingPrice * (1 + futuresAdj), 2);

  // Sector confirmation: does the broad index (QQQ) agree with the token move?
  const aligned = sameSign(candles.velocityPct, cross.qqqPct);
  const sectorConfirmation = round(
    aligned
      ? clamp01(0.55 + Math.abs(cross.qqqPct) / 4)
      : clamp01(0.4 - Math.abs(cross.qqqPct) / 6),
    2,
  );

  // Derived activity proxies (from real price/volume — labeled as such). We have
  // no news feed in live mode, so we do NOT treat a price move as a catalyst:
  // news intensity tracks real volume spikes only, leaving genuine fair-value
  // gaps free to route to convergence.
  const newsSentiment = round(clamp(token24hPct / 5, -1, 1), 2);
  const newsIntensity = round(clamp01(0.12 + (candles.volSpike - 1) * 0.45), 2);
  const socialHypeSpike = round(clamp01(Math.abs(candles.velocityPct) / 6), 2);

  const avgVolume = base.baseVolume;
  const volume = Math.round(avgVolume * candles.volSpike);

  return {
    symbol,
    timestamp,
    tokenPrice: round(tokenPrice, 2),
    estimatedFairValue,
    underlyingPrice: round(underlyingPrice, 2),
    underlyingMarketOpen: marketOpen,
    spreadPct,
    volume,
    avgVolume,
    priceVelocityPct: candles.velocityPct,
    volatilityPct: candles.volatilityPct,
    sectorIndexChangePct: cross.qqqPct,
    sectorConfirmation,
    nasdaqFuturesChangePct: cross.nqPct,
    newsIntensity,
    newsSentiment,
    newsEvidenceQuality: 0.5, // unknown in live mode — neutral, honest
    socialHypeSpike,
    macroEventActive: false, // not detected in live mode
    earningsEventActive: false,
    yieldsChangeBps: 0,
    dxyChangePct: cross.dxyPct,
    dataFreshnessSec: 15,
  };
}

export interface PricePt {
  t: number; // epoch ms
  price: number;
}

export interface PriceHistory {
  token: PricePt[];
  underlying: PricePt[];
  source: "live" | "sim";
}

/** Real recent price history: token (Bitget candles, 24/7) + underlying (Yahoo
 *  intraday, market-hours only). The gap between them IS the tracking error, and
 *  the underlying's session gaps show the 24/7-vs-limited-hours wedge. */
export async function getPriceHistory(symbol: AssetSymbol): Promise<PriceHistory> {
  const map = LIVE_MAP[symbol];

  const [tokRes, ulRes] = await Promise.all([
    fetchJson<{ data: string[][] }>(
      `${BITGET_BASE}/candles?symbol=${map.bitget}&granularity=1h&limit=72`,
    ).catch(() => ({ data: [] as string[][] })),
    fetchJson<{
      chart: { result: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] };
    }>(`${YAHOO_BASE}/${encodeURIComponent(map.yahoo)}?interval=1h&range=5d`).catch(() => null),
  ]);

  const token: PricePt[] = (tokRes.data ?? [])
    .map((r) => ({ t: Number(r[0]), price: Number(r[4]) }))
    .filter((p) => p.price > 0 && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  let underlying: PricePt[] = [];
  const r = ulRes?.chart?.result?.[0];
  if (r?.timestamp && r.indicators?.quote?.[0]?.close) {
    const ts = r.timestamp;
    const cl = r.indicators.quote[0].close;
    underlying = ts
      .map((t, i) => ({ t: t * 1000, price: cl[i] ?? 0 }))
      .filter((p) => p.price > 0);
  }

  // Clip the underlying to the token's recent window so both overlap.
  if (token.length > 0) {
    const minT = token[0].t;
    underlying = underlying.filter((p) => p.t >= minT);
  }

  return { token, underlying, source: "live" };
}

let cache: { at: number; board: AssetMarketData[] } | null = null;
const CACHE_MS = 60_000;

/** Real-time board built from Bitget + Yahoo. Throws if the token feed is
 *  unavailable so the caller can fall back to the simulation. forwardPath is
 *  empty: live decisions open a position rather than resolve against a known future. */
export async function getLiveBoard(nowMs: number): Promise<AssetMarketData[]> {
  if (cache && nowMs - cache.at < CACHE_MS) return cache.board;

  const timestamp = new Date(nowMs).toISOString();
  const symbols = Object.keys(LIVE_MAP) as AssetSymbol[];

  // Token feed is required; cross-market + underlying are best-effort.
  const [tickers, candleList, underlyings, qqq, nq, dxy] = await Promise.all([
    getBitgetTickers(),
    Promise.all(symbols.map((s) => getCandleStats(LIVE_MAP[s].bitget))),
    Promise.all(symbols.map((s) => getYahooQuote(LIVE_MAP[s].yahoo))),
    getYahooQuote("QQQ"),
    getYahooQuote("NQ=F"),
    getYahooQuote("DX=F"),
  ]);

  const cross = {
    qqqPct: changePct(qqq),
    nqPct: changePct(nq),
    dxyPct: changePct(dxy),
  };

  const board: AssetMarketData[] = [];
  symbols.forEach((symbol, i) => {
    const ticker = tickers.get(LIVE_MAP[symbol].bitget);
    if (!ticker || !Number(ticker.lastPr)) {
      throw new Error(`No live Bitget data for ${LIVE_MAP[symbol].bitget}`);
    }
    const snapshot = buildSnapshot(symbol, ticker, candleList[i], underlyings[i], cross, timestamp);
    board.push({ meta: assetMeta(symbol), snapshot, forwardPath: [] });
  });

  cache = { at: nowMs, board };
  return board;
}
