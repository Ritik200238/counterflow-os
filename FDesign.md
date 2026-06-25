# CounterFlow OS — Frontend Design Brief (FDesign.md)

> **For the designer/frontend dev.** This document describes **what the product is, what it does, what data exists, what actions users take, what states each surface can be in, and the rules it must obey.** It deliberately contains **no UI, layout, visual, or styling direction** — the look, structure, placement, colors, components, and information architecture are entirely your call. Everything below is the functional/UX substance you need to design well.
>
> Live reference build: https://counterflow-os.vercel.app · Repo: https://github.com/Ritik200238/counterflow-os
> (A working version exists today; treat it as a *reference for behavior and data*, not a design to copy.)

---

## 1. What the product is

**CounterFlow OS** is an autonomous **strategy-routing and proof layer** for 24/7 **tokenized US stocks** (stocks that trade as crypto tokens around the clock).

- **One-liner:** "The strategy router for agentic tokenized-equity trading."
- **Tagline:** "Trade the regime, not the signal."
- **The core idea:** Tokenized stocks trade 24/7, but the underlying US stock market does not. That mismatch creates mispricing, tracking error, and "agent crowding" (many bots chasing the same headlines). Instead of running one fixed strategy, the product **reads the market, detects the current regime, picks the best strategy for that regime, debates it across a multi-agent council, risk-checks it, simulates the trade, and writes an auditable record of every decision** — including the decisions to *not* trade.
- **It is paper-trading / simulation only.** No real money. This must always be clear to the user.

**The universe is 5 fixed tokenized stocks:** NVDAx (NVIDIA), TSLAx (Tesla), AAPLx (Apple), COINx (Coinbase), HOODx (Robinhood). Each maps to a real Bitget token (`RNVDAUSDT`, etc.) and a real underlying equity.

---

## 2. Who it's for (personas + jobs-to-be-done)

1. **Tokenized-stock / crypto-native traders** — want to know whether a token's move is *real or just crowded*, which way to trade (follow / fade / converge / stay flat), and why. Job: "Tell me what's happening with these 5 names and what the system would do, with the reasoning."
2. **AI / quant builders** — want a transparent, inspectable decision engine: scores, signals, backtests, performance. Job: "Show me the signals, the strategy logic, the backtest, and prove it isn't a black box."
3. **Hackathon judges / evaluators** — need to *get it in 30 seconds*, see that it's real and runnable, and verify the decision trail. Job: "Understand the thesis fast, see it working live, and audit a decision end-to-end."

**Design implication (functional, not visual):** a first-time visitor with no context must be able to understand what the product does and navigate to the proof, while a trader can go straight to the live read. The content must serve "grok it fast" *and* "go deep."

## 3. Voice & content tone

Honest, precise, neutral, **no hype**. It never promises profit. It openly labels what's real vs simulated. It explains *why*, not just *what*. Numbers are never faked or over-precise. Every claim is auditable. (This is a *trust* product — the copy should read like an honest research tool, not a get-rich app.)

---

## 4. Domain glossary (the designer must understand these to represent them)

- **Regime** — the current market "weather" for an asset. One of six: **Clean Trend, Crowded Hype, Fair-Value Gap, Macro Shock, Earnings Event, Noise.**
- **Strategy** — what the system decides to do. One of seven: **Momentum Follow, CounterFlow Fade, Fair-Value Convergence, Volatility Breakout, Earnings Drift, Macro Rebalance, No-Trade / Risk-Off.**
- **CrowdScore** (0–100) — how crowded / bot-driven / overreactive a move looks. Higher = more crowded.
- **Fair-Value Gap** (signed %) — how far the token price is from its estimated fair value (the tracking error). Positive = token expensive vs underlying; negative = cheap.
- **Liquidity Score** (0–1) — how tradable the asset is right now (spread, depth, volatility, freshness).
- **Regime Confidence / Strategy Confidence** (0–1) — how sure the system is about the detected regime / chosen strategy.
- **Risk Score** (0–1) — how risky the current environment is.
- **Council** — eight specialized agents (Macro, News, Fair-Value, Crowd, Technical, Liquidity, Risk, Strategy Router) that each give an opinion/stance; the system measures their **agreement** (e.g. "6/8").
- **Strategy Router** — the component that combines everything, selects one strategy, and records *why each rejected strategy lost*.
- **Risk Governor** — applies hard risk rules and can shrink or block a trade; has states Normal / Caution / Risk-Off / Kill Switch.
- **Trade Decision Packet** — the full, structured, auditable record produced for **every** decision (trade or no-trade).
- **Agent Crowding Index** (0–100) — a market-wide measure of how crowded the whole tokenized tape looks.
- **Strategy Performance Memory** — historical win rate / return per strategy, used to weight the autopilot.
- **Strategy Autopilot** — reallocates paper capital across strategies over time based on trailing performance.
- **Signal / Information Coefficient (IC)** — a "signal zoo" of named factors, each scored by how well it predicts forward returns (IC = correlation of signal vs realized move).
- **Decision Shadow** — behavioral diagnostics on the system's own decisions + a comparison against naive baselines (always-momentum, buy-and-hold, random) on the same market.
- **Tracking error** — the live gap between a token's price and its underlying stock's price.
- **Paper trade** — a simulated position (entry, stop, take-profit, size) with no real money.

---

## 5. Core data entities (what must be represented on screen)

These are the objects the UI works with. Fields listed are the meaningful ones a designer needs to surface; ranges/formats included so you know the data shapes.

**Asset (one of 5):** symbol (e.g. `NVDAx`), underlying name (e.g. NVIDIA), sector, token price ($), estimated fair value ($), underlying price ($), whether the US market is currently open (boolean), spread (%).

**Scores bundle:** CrowdScore (0–100), fairValueGapPct (signed %), regimeConfidence (0–1 → shown as %), strategyConfidence (0–1 → %), liquidityScore (0–1), riskScore (0–1).

**Regime result:** the selected regime (one of 6), confidence (0–1), and a list of human-readable matched **signals** (e.g. "Confirmed directional move", "Weak sector confirmation").

**Council agent output (×8):** agent name, a normalized **stance** (follow / fade / converge / avoid / neutral), a confidence (0–1), a one-line plain-English summary, and a small bag of agent-specific data fields (e.g. macro regime, catalyst strength, gap status).

**Strategy selection:** selected strategy, direction (long / short / flat), confidence, and **rejectedStrategies** — a list of `{ strategy, reason }` explaining why each other strategy was not chosen.

**Risk decision:** approved (boolean), risk state (Normal/Caution/Risk-Off/Kill Switch), position size (% of portfolio), stop-loss (%), take-profit (%), a list of reasons, and a list of hard-rule "blocks".

**Trade Decision Packet (the central artifact):** decision id (e.g. `cfos_2026_0001`), timestamp, asset, regime + confidence + signals, selected strategy, rejected strategies, direction, all six scores, market snapshot (token/fair/underlying/market-open/spread), the full council (8 agents) + agreement (e.g. 6/8), the risk decision, final action (`long_paper` / `short_paper` / `no_trade`), a rationale (1–2 sentences), a multi-agent **debate** narrative, the reasoning source (Qwen LLM vs deterministic fallback), data-freshness pass/fail, and the data sources used. **This object can be viewed as raw JSON.**

**Ledger entry:** one row per logged decision — id, timestamp, asset, regime, strategy, direction, entry/exit price, size %, stop/take %, PnL % and PnL value, status (`closed` / `open` / `no_trade`), exit reason (take-profit / stop-loss / time-limit / none), hold time, rationale, risk state.

**Ledger stats:** total decisions, executed trades, no-trades, wins/losses, win rate, avg return, total PnL, max drawdown, **Sharpe / Sortino / profit factor**, best/worst trade; plus per-strategy and per-regime breakdowns.

**Live Position:** id, asset, strategy, direction, entry price + time, stop/take %, size ($ and %), status (open/closed), and when open: mark price, unrealized PnL ($ and %); when closed: exit price/reason, realized PnL ($ and %).

**Portfolio snapshot:** starting capital ($100k), cash, realized PnL, unrealized PnL, equity, total return %, exposure %, open/closed counts, win rate, and the lists of open + closed positions.

**Strategy Memory row:** strategy, trades, wins/losses, win rate, avg return, best/worst regime, autopilot weight (%).

**Agent Crowding Index:** index (0–100), state (Low / Moderate / Elevated / High AI-agent crowding), count of "extreme" assets, a recommended global posture, and a breakdown of weighted components.

**Signal Zoo row:** signal name, category (Momentum/Value/Crowding/Liquidity/Macro), formula (plain text), **IC** (signed, small magnitudes like ±0.18), a verdict (predictive / weak / noise), and the signal's current value per asset.

**Decision Shadow:** diagnostics (no-trade rate, avg hold, exit-reason mix, win rate by confidence band, behavioral flags) + a comparison table of CounterFlow vs 3 naive baselines (trades, win rate, avg, total PnL).

**Autopilot allocation:** current weights per strategy (sum 100%), an allocation **timeline** (how weights rotated over time), and a rotation log (text notes).

**Price history (for charts):** two time series per asset over ~72h — the **token** price (continuous, 24/7) and the **underlying** stock price (only during US market hours, so it has session gaps). The vertical gap between them is the tracking error.

---

## 6. Capabilities / functional areas (each surface's job, data, actions, states)

> These are the product's capabilities. How you organize them into pages/navigation is **your decision** — the current build splits them into separate areas, listed here only so you know they exist and what each must do.

### 6.1 Market board (the "home"/overview)
- **Job:** show all 5 assets at a glance — for each: regime, selected strategy, CrowdScore, fair-value gap, confidence, council agreement, and the final action (long/short/flat). Plus the market-wide **Agent Crowding Index** and a one-line global posture.
- **Actions:** open an asset for detail; toggle **Live vs Demo** data; toggle **AI reasoning** on/off.
- **States:** loading (scanning the market / running the council); populated (5 decisions); error; "live conditions are quiet, all no-trade" note when nothing is actionable.
- **Updates:** on load and when toggles change.

### 6.2 Asset detail (the full proof)
- **Job:** the complete Trade Decision Packet for one asset, made human-readable: the rationale, a **price-vs-underlying chart**, all six scores, the eight-agent council with stances + a debate narrative, the risk decision, the routing + trade plan, the rejected strategies with reasons, regime signals, data sources, and the **raw JSON packet** (expandable).
- **Actions:** toggle Live/Demo; toggle AI debate; **"watch the council deliberate"** (streams the 8 agents one at a time, then the verdict); expand/collapse raw JSON; navigate back.
- **States:** loading; populated; streaming-in-progress (council); error.

### 6.3 Autonomous Agent console
- **Job:** show the system **running on its own** — it scans the live market on an interval, makes decisions, and streams a live **activity feed** of what it's doing (new actionable setups, extreme crowding, large tracking errors, regime changes, risk blocks), plus a posture and the current per-asset read.
- **Actions:** Pause / Resume; toggle Live/Demo.
- **States:** running (auto-refreshing on an interval); paused; loading first scan.
- **Updates:** automatically every ~25 seconds while running.

### 6.4 Ask the agent (natural language)
- **Job:** the user asks a plain-English question ("Why is the system standing aside?", "Which token is most mispriced?", "Is NVDAx a buy?") and gets an answer **grounded in the live engine output** — never invented numbers. Shows which assets the answer referenced (linking to their detail) and whether the reasoning came from Qwen or the deterministic fallback.
- **Actions:** type + submit a question; click a suggested question; toggle Live data.
- **States:** idle; thinking; answered (a running transcript of Q→A); error.

### 6.5 Signal Zoo (factor benchmark)
- **Job:** a catalog of the named signals the engine uses, each with its formula, category, an **Information Coefficient** (how predictive it is, measured over a reproducible backtest), a verdict, and the signal's current value per asset.
- **Actions:** none beyond viewing/scanning (read-only).
- **States:** loading (benchmarking); populated.

### 6.6 Strategy Autopilot
- **Job:** show how paper capital is **allocated across strategies and how it rotates over time** as the regime mix shifts, plus a rotation log explaining the changes.
- **Actions:** read-only.
- **States:** loading; populated; "not enough history" empty state.

### 6.7 Decision Shadow
- **Job:** prove the routing adds value — behavioral diagnostics on the system's own decisions (discipline, exit mix, win rate by confidence) **and** a head-to-head vs naive baselines (always-momentum, buy-and-hold, random) on the identical market.
- **Actions:** read-only.
- **States:** loading; populated.

### 6.8 Trade Ledger
- **Job:** the full, reproducible log of every decision: summary stats (win rate, PnL, drawdown, Sharpe/Sortino/profit factor), an **equity curve**, the per-strategy performance memory + autopilot weights, and a filterable/exportable table of all decisions.
- **Actions:** filter by asset; filter by strategy; **export CSV**; **export JSON**; **"Run backtest seed"** (regenerates a reproducible backtest); **"Run live scan + log"** (executes a live scan and appends the decisions).
- **States:** loading; populated; empty (ledger not yet seeded); action-in-progress (seeding/scanning).

### 6.9 Live Portfolio
- **Job:** a $100k **paper portfolio** running off real prices — it opens positions from actionable decisions, marks them to live prices, and closes them on stop/take/time. Shows equity, cash, realized + unrealized PnL, exposure, win rate, open positions (with live unrealized PnL), and closed positions.
- **Actions:** **"Run tick"** (scan live, open/close positions); **"Reset"** (back to starting capital); positions auto-mark-to-market on a refresh interval.
- **States:** loading; empty (no positions yet); populated; tick-in-progress; auto-refreshing.

### 6.10 Global / cross-cutting
- **Navigation** across all the above.
- **Data-source toggle (Live vs Demo)** appears on the market read surfaces.
- **A persistent "paper / simulation" indicator and "not financial advice"** must be present.
- **Optional sign-in** (see §10).

---

## 7. Modes & toggles (what changes when the user flips them)

- **Live vs Demo data:**
  - **Live** = real data — token prices/spreads/volume from **Bitget**, underlying stock prices + cross-market (Nasdaq/QQQ/futures) from **Yahoo Finance**. The fair-value gaps shown are *actual tracking errors*. Live conditions are often quiet (the system honestly stands aside a lot).
  - **Demo** = a reproducible **simulation** that exercises all six regimes and shows active strategy routing for a clear narrative. Clearly labeled as simulated.
- **AI reasoning (Qwen) on/off:** when on (and a key is configured), an LLM writes the council debate and rationale on top of the engine's numbers; when off (or no key), a deterministic narrator writes them. **The LLM never changes any number or decision — only the prose.** The UI should indicate which source produced the text.

**Critical honesty rule:** the UI must always make clear *which mode/source is active* — never present simulated data as live, never present fallback prose as LLM, never imply real money.

---

## 8. What's real vs simulated vs fallback (be honest in the UI)

- **Real (live mode):** token prices, bid/ask spread, volume (Bitget); underlying stock prices, market-open state, cross-market moves (Yahoo); the resulting **fair-value gaps / tracking errors**; the price-vs-underlying chart history.
- **Simulated:** the demo board scenarios, the historical **backtest** (a reproducible model, not real market history), and — even in live mode — the **news/sentiment and macro/Fed signals** are *derived from price/volume*, not a live news/Fed feed (label these as derived/modeled).
- **Fallback:** when no LLM key is set, all natural-language text (debate, rationale, agent narration, Ask answers) comes from a deterministic narrator. It is still grounded in real engine output.

The product's whole credibility rests on labeling these correctly. Anywhere data is shown, its **source and freshness** should be discoverable.

---

## 9. Data freshness, refresh, and the multi-user model (important constraints)

- **Live data is cached ~60 seconds** server-side; repeated views within that window show the cached values.
- **Some surfaces auto-refresh on a client interval:** the Autonomous Agent (~25s), the Portfolio (~20s mark-to-market). Others fetch on load / on action.
- **After an action, the relevant data re-fetches** (e.g. running a backtest or a portfolio tick updates that surface). Design for "action → brief in-progress → refreshed result."
- **The data is GLOBAL / shared, not per-user.** There is **one** ledger and **one** portfolio (stored server-side). All visitors see the same shared state.
- **There is NO real-time cross-user push.** If one person runs a scan/seed/tick, another person sees it only on their **next refresh/refetch** — not pushed live. (The only streaming is the per-request council stream within a single user's session.) **Do not design for live multi-user collaboration or presence — it doesn't exist.**

## 10. Auth / accounts (current state)

- **Sign-in is optional and the entire product works fully without it** (public). 
- When configured, a user can sign in; today this establishes **identity only** — there are no per-user portfolios or saved data yet (that's a future capability). Design should treat sign-in as a light, optional layer, not a gate.

---

## 11. Key end-to-end flows (the journeys to support)

1. **Understand the product (cold visitor):** land → grasp the thesis and what it does → reach the live market read or the proof.
2. **Read the market:** see all 5 assets' regimes/strategies/actions + the crowding index → open one asset → see the full reasoning and the price-vs-underlying chart.
3. **Audit a decision:** open an asset → read the council debate, rejected strategies (with reasons), risk decision → view the raw decision packet JSON.
4. **Watch it think:** on an asset, stream the council deliberating agent-by-agent to the verdict.
5. **Ask a question:** type a plain-English question → get a grounded answer with linked assets.
6. **Watch it run autonomously:** open the agent console → see it scan and stream activity over time → pause/resume.
7. **Run / inspect the backtest:** seed a reproducible backtest → see win rate, equity curve, per-strategy performance, Sharpe/profit factor → filter and export the ledger.
8. **Prove the edge:** view the Signal Zoo ICs and the Decision Shadow (routing vs naive baselines).
9. **Run the live trading loop:** open the portfolio → run a tick (opens/closes positions on real prices) → watch equity + open positions mark to market.

## 12. States & edge cases the design must handle (every async surface)

- **Loading / in-progress** (initial fetch, and per-action like seeding/scanning/ticking).
- **Empty** (no trades in the ledger yet; no open positions yet; not enough history for autopilot/equity curve).
- **Error / API failure** — live feeds can fail; the system **falls back to demo data and says so** (a note). Design must surface this gracefully, never a blank screen.
- **Rate limited (429)** — the heavy actions (seed, scan, ask) are rate-limited; the UI should communicate "try again shortly" rather than fail silently.
- **No-trade decisions** — a *first-class* outcome, not an error or absence. Standing aside is a deliberate, explainable decision and should read as such.
- **Open vs closed positions**, **closed vs no-trade ledger rows** — visibly distinct meanings.
- **Signed-out vs signed-in** (optional).
- **Live "quiet" market** — in live mode it's common that all assets are no-trade; this is honest discipline, not a bug, and should be framed positively.

## 13. Non-functional requirements (constraints, not visual direction)

- **Must work on both mobile and desktop**, and remain **readable** with this much dense, numeric, financial data.
- **Should feel responsive** — live fetches take ~1–2s, a backtest a few seconds, LLM calls add latency (results are cached); the design needs honest progress feedback for these.
- **Accessible** — keyboard-navigable, sufficient legibility for data-heavy content.
- **Trustworthy by construction** — persistent paper/sim labeling, "not financial advice," and discoverable data-source/freshness.

## 14. Out of scope / non-goals (don't design for these)

- No real money / real execution (paper only).
- No on-chain / wallet / crypto-wallet connection (it is **not** a Web3 app — it's a web app calling REST APIs).
- No live multi-user collaboration, presence, or chat.
- No per-user portfolios yet (single shared state today).
- The asset universe is fixed at 5 names.

---

## 15. Quick reference — the available data surfaces (for wiring)

A pro dev will care that all data already exists behind simple JSON endpoints. Summary (so you know what's fetchable):

- Market board + crowding index; per-asset price history (token vs underlying); natural-language ask; autonomous agent tick (+ activity/alerts); live council stream (server-sent events); signal IC benchmark; autopilot allocation timeline; decision shadow + baselines; trade ledger (+ stats, CSV/JSON export); strategy performance memory; live portfolio (+ tick + reset); backtest seed; live scan + log; optional current-user identity.

Everything is JSON over HTTP; live data comes from Bitget + Yahoo; persistent data (ledger, portfolio) is shared/global.

---

### TL;DR for the designer
Design a **trustworthy, data-dense research/agent product** for tokenized US stocks that lets a user **read the market, understand and audit each AI decision, watch the agent operate, ask it questions, inspect the backtest/signals/shadow proof, and run a live paper portfolio** — with **honest real-vs-simulated labeling**, graceful loading/empty/error/no-trade states, and the understanding that data is **shared/global with no real-time multi-user sync.** The look, layout, IA, and components are entirely yours.
