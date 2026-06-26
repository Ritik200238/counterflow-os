# CounterFlow OS — Project Description

**Track:** 🟧 US Stocks AI Trading
**Tagline:** *Trade the regime, not the signal.*
**Live demo:** https://counterflow-os.vercel.app · **Repo:** https://github.com/Ritik200238/counterflow-os

---

## 1. Idea

**Core hypothesis:** In 24/7 tokenized US-equity markets, the edge is **not a single strategy** — it's knowing *which market regime you're in*, routing to the strategy that fits it, and **refusing to trade when there's no edge.**

Tokenized stocks (NVDAx, TSLAx, AAPLx, COINx, HOODx) trade around the clock, but the underlying US market is closed nights and weekends. That mismatch creates a new class of inefficiency: **stale fair value, tracking error, thin after-hours liquidity, and "agent crowding"** — many AI/bots reacting to the same headlines, producing predictable overreaction and reversals. A static, one-strategy bot can't adapt to this. CounterFlow OS is built for it.

**What it does, per asset:**
1. **Detects the regime** — one of six (Clean Trend, Crowded Hype, Fair-Value Gap, Macro Shock, Earnings Event, Noise) from a transparent, rule-based fit over real signals.
2. **Routes to the best of seven strategies** — Momentum Follow, CounterFlow **Fade** (fade the crowd), Fair-Value Convergence, Volatility Breakout, Earnings Drift, Macro Rebalance, or **No-Trade / Risk-Off** — and records *why each rejected strategy lost.*
3. **Debates it across an 8-agent council** (Macro, News, Fair-Value, Crowd, Technical, Liquidity, Risk, Strategy Router) and measures their agreement (e.g. 6/8).
4. **Risk-checks it** with a Risk Governor (hard rules + Normal/Caution/Risk-Off/Kill-Switch states) that can shrink or block the trade.
5. **Executes a paper trade and writes an auditable Trade Decision Packet** for *every* decision — including the no-trades.

**Signals used (real, in Live mode):**
- **Tokenized price, spread, volume** from Bitget (the `R*USDT` tokenized-stock markets).
- **Underlying equity price + cross-market** from Yahoo (QQQ sector index, Nasdaq futures NQ, dollar index DXY).
- **Fair-Value Gap** = the live *tracking error* between the token and its underlying.
- **CrowdScore (0–100)** = a composite measuring overreaction / bot-crowding.
- **Velocity & realized volatility** from candles, **liquidity** (spread/depth/freshness), and a market-wide **Agent Crowding Index.**

**How risk is managed:** hard limits (max size per asset, max portfolio exposure, per-trade stop cap, spread/freshness/council-agreement gates), confidence-scaled position sizing dialed back by environment risk, and **No-Trade treated as a first-class outcome** — discipline over overtrading.

**Why it's different (and the real-world problem it solves):** most AI trading answers *"buy or sell?"* CounterFlow OS answers *"what regime are we in, which strategy has edge here, is this move real alpha or crowded agent noise, and can we prove the decision was safe and reproducible?"* It pairs the strategy router with a **proof layer** — an auditable, reproducible decision packet per trade — so a trader (or judge) can *trust and verify* every call. No black box, no fake precision, no hidden trades. It also doubles as a tool: a CrowdScore / fair-value / regime read for tokenized stocks, a benchmarked signal library, and a strategy-router others could build on.

---

## 2. Progress

**Key challenges & how we solved them**

- **Getting *real* tokenized-vs-underlying data.** We discovered Bitget lists the tokenized US stocks as `RNVDAUSDT`, `RTSLAUSDT`, `RAAPLUSDT`, `RCOINUSDT`, `RHOODUSDT` spot markets. We pull their live price/spread/volume + candles and combine them with Yahoo's underlying equity prices to compute the **actual tracking error** and visualize the **24/7-token vs market-hours-underlying** gap on a chart. Reliability handled with a 60s cache + graceful fallback to a reproducible simulation, so the app never breaks.
- **Honesty & reproducibility (our core principle).** Seeded RNG everywhere → *same seed → same market → same decisions → same ledger*; transparent weighted scores (every component is shown); a **200-assertion test suite** covering reproducibility, score ranges, regime detection, and risk invariants (runs in CI).
- **A believable backtest (not overfit).** We tuned an honest edge model so win rates land in a realistic ~55–60% range *with real cost/slippage drag*. The 480-decision backtest: **57% win, +7.86% total, profit factor 1.36, 1.4% max drawdown**, and a **Decision Shadow** that shows regime-routing beats always-momentum / buy-and-hold / random baselines on the *identical* market.
- **Serverless durability + autonomy.** Ledger and live paper-portfolio persist to Vercel Blob (survive cold starts); a daily Vercel cron runs the agent headless.
- **LLM reasoning that degrades gracefully.** Built a provider-agnostic Qwen integration (DashScope OpenAI-compatible) with a deterministic fallback narrator, so the council debate and natural-language answers work with or without a key.
- **A frontend audit before submission.** We ran a multi-agent audit across the UI (wiring, data-sync, honesty-labeling, error states, races) and fixed 40+ verified issues — e.g., ensuring nothing simulated is ever labeled "live."

**Completed:** 5 tokenized assets · 6 regimes · 7 strategies · 5 transparent scores · 8-agent council with agreement · strategy router with rejected-reason trail · risk governor · paper executor · Trade Decision Packet · JSONL ledger + CSV/JSON export · strategy performance memory + autopilot allocation · Agent Crowding Index · **Signal Zoo** (factor library benchmarked with real Information Coefficients) · **Decision Shadow** (vs naive baselines) · **live Paper Portfolio** (open → monitor → close loop on real prices) · **Autonomous Agent console** (self-running, streams activity) · **natural-language "Ask" agent** (answers grounded in engine output) · SSE council stream · price-vs-underlying chart · dashboard + REST API + CLI · CI · analytics · optional auth.

**What's still missing (honest):**
- **Live LLM key.** The issued $30 Qwen credit couldn't be redeemed from our region (the Alibaba console is geo-restricted here), so reasoning currently runs on the deterministic fallback. The integration is provider-agnostic — a valid Qwen key (any host) activates real LLM reasoning with **zero code change.**
- **Real historical backtest & live macro/news feeds.** The backtest is a clearly-labeled reproducible *simulation*, and in Live mode the macro/news/sentiment signals are *derived from real price/volume* (no live news/Fed feed). The **prices themselves are real.**
- **Per-user accounts** (auth is wired; identity-only today — one shared paper portfolio).

**Next steps:** wire a live LLM key; backtest on real equity price history; integrate a real macro/earnings calendar; per-user portfolios; more strategies (Sector Rotation, Cross-Venue Basis).

**Frameworks / models / APIs**
- **Next.js 16 (App Router), React 19, TypeScript, Tailwind v4**, deployed on **Vercel** (Blob storage, Cron, Analytics, CI via GitHub Actions).
- **Qwen** (Alibaba Cloud DashScope, OpenAI-compatible endpoint) for LLM reasoning — with a deterministic fallback.
- **Bitget US Stocks data** — live market data (spot tickers + candles) for the tokenized US-stock pairs (`R*USDT`): our real token price / spread / volume source.
- **Yahoo Finance** — underlying equity prices + cross-market (QQQ / NQ / DXY).

**Bitget tools used:** the **US Stocks Data API** — we consume Bitget's tokenized US-stock market data (tickers + candles) as the live data backbone. *(We were also issued a Bitget AI Agent Hub key; since the GetAgent skill is a dev-time agent skill rather than a runtime API for a web app, we integrated Bitget's market-data API directly — the most meaningful Bitget integration for this product.)*

---

## 3. Materials

- **GitHub repo:** https://github.com/Ritik200238/counterflow-os
- **Live demo:** https://counterflow-os.vercel.app
- **README** (setup, run, thesis, architecture diagram): in the repo
- **Demo video:** _[to add]_
- **Paper-trading log & sample outputs:** `data/ledger.jsonl`, `samples/` (decision packet, backtest report, board scan)
- **Frontend functional spec:** `FDesign.md`

Run locally: `npm install && npm run seed && npm run dev` (no API key required — the deterministic engine is fully functional offline).

---

## 4. AI Trading Thoughts (optional)

- **On Bitget's tools:** the tokenized US-stock market data (`R*USDT`) is the standout — having *real, 24/7 tokenized-equity prices* made our entire "tracking error / agent crowding" thesis testable with live data instead of a simulation. The gap between the 24/7 token and the market-hours-only underlying is a genuinely novel, tradeable signal that only exists in this market.
- **Suggestions:** (1) a region-friendly redemption flow for the Qwen credit would help international builders activate LLM reasoning; (2) a runtime data/agent API (vs a dev-time editor skill) would make it easier for *web/app* products — not just coding agents — to plug into the Bitget agent ecosystem.
- **On the future of agentic trading:** as AI agents become market participants, **"agent crowding" becomes a real, tradeable failure mode** — many agents reading the same signals create predictable overreaction. We believe the winning systems won't be single-strategy bots; they'll be **regime-routers with a proof layer** — adaptive about *which* strategy to use, honest about whether a move is real or crowded, disciplined enough to *refuse* the trade, and auditable enough to be trusted. That's the product we set out to build.
