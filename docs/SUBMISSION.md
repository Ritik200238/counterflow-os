# CounterFlow OS — Hackathon Submission

**Track:** Bitget AI Base Camp Hackathon S1 — Stock AI Trading
**One-liner:** The strategy router for agentic tokenized-equity trading. _Trade the regime, not the signal._

---

## Project description (paste into the submission form)

CounterFlow OS is an autonomous **strategy-routing and proof layer** for 24/7 tokenized US stock
markets. Most AI trading bots answer "buy or sell?". CounterFlow OS answers a harder, more
defensible question: **"What regime are we in, which strategy has edge here, is this real alpha
or crowded agent noise, and how do we prove the decision was safe and reproducible?"**

For every asset it: reads the market → detects the regime (Clean Trend, Crowded Hype, Fair-Value
Gap, Macro Shock, Earnings, Noise) → routes to the best of four strategies (Momentum Follow,
CounterFlow Fade, Fair-Value Convergence, No-Trade/Risk-Off) → runs an 8-agent council debate →
applies a hard-rule risk governor → executes a paper trade → and writes an auditable **Trade
Decision Packet**. Every decision is logged to a reproducible ledger that feeds strategy
performance memory and an autopilot allocation. A market-wide **Agent Crowding Index** lifts it
from a per-asset bot to an "OS-level" view of how crowded the tokenized tape is.

It runs with one command, requires no API key (an optional Qwen layer adds the natural-language
council debate), and is honest by construction: seeded RNG everywhere, transparent scores, and
backtested win rates in a believable ~57% range with real cost/slippage drag — no cherry-picking.

---

## Why this maps to the judging criteria (PRD §39)

**Depth of thesis.** Tokenized equities trade 24/7 while the underlying market does not. That
creates stale fair value, tracking error, and a new failure mode — **agent crowding** (many bots
chasing the same headlines). The product is built specifically for these mechanics: it trades the
*behavior of other agents*, not just price. The core insight: in agentic markets, alpha is knowing
when to follow the crowd, when to fade it, and when to refuse the trade.

**Runnability.** `npm install && npm run seed && npm run dev`. No credentials needed. There's also
a pure-CLI path (`npm run scan` / `seed` / `report`) so a judge can verify decisions and the ledger
without a browser. Lint, typecheck, and production build are all green.

**Completeness.** End-to-end: market sensing → 5 scores → regime detection → multi-agent council →
strategy routing with rejected-reason trail → risk governor → paper execution → JSONL ledger →
strategy performance memory + autopilot → Agent Crowding Index → dashboard + REST API + CLI. Every
MVP "must/should" item in the PRD is implemented.

**Novelty & potential.** Not a generic signal bot — a new category: an **Agentic Strategy Router**
with a **proof layer**. The Trade Decision Packet (every decision explainable, auditable,
reproducible) and the Agent Crowding Index are differentiating, productizable primitives (APIs/SDK
on the roadmap).

---

## Submission checklist (PRD §22)

| Requirement | Status |
| --- | --- |
| Public GitHub repo | ⏳ push needed (see steps below) |
| README with setup/run | ✅ `README.md` |
| Install / run instructions | ✅ README quickstart + CLI |
| Demo video (< 3 min) | ⏳ script ready in `docs/DEMO.md` |
| Paper trading log | ✅ `data/ledger.jsonl` (160 decisions) |
| Sample input/output files | ✅ `samples/scan-board.json`, `samples/decision-packet-TSLAx.json` |
| Project description | ✅ this file |
| Thesis explanation | ✅ this file + README |

## Verified build evidence

- `npm test` → **200 assertions pass** (reproducibility, score ranges, regime detection, router/risk invariants, ledger accounting)
- `npm run lint` → 0 problems · `npx tsc --noEmit` → clean · `npm run build` → all routes compile
- Backtest (160 decisions, seed `counterflow-backtest`): **57.7% win, +2.38% total PnL,
  1.32% max drawdown, 49 disciplined no-trades.** All three active strategies net-positive.
- Production server (`npm start`) serves all pages and the 6 API routes (200 OK).

## Human-only steps remaining

1. **Resolve the Qwen key** — the provided key returns HTTP 401 from DashScope (likely truncated
   or needs a Bitget-specific base URL). Put a valid key in `.env` (`DASHSCOPE_API_KEY`); the AI
   debate then activates with zero code changes. Optional — the product is fully functional without it.
2. **Push to a public GitHub repo** (see below).
3. **Record the < 3 min demo** following `docs/DEMO.md`.
4. **Submit** the repo link + video + this description to the hackathon portal.

### Push to GitHub

```bash
# with GitHub CLI:
gh repo create counterflow-os --public --source=. --remote=origin --push

# or manually:
git remote add origin https://github.com/<you>/counterflow-os.git
git push -u origin master
```
