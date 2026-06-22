# CounterFlow OS — Demo Script (< 3 minutes)

Follows the PRD §38 demo flow. Goal: show **intelligence**, not just UI. Practice once so it lands
inside 3 minutes. Record at 1280×800+, dark room, browser zoom ~110%.

## Setup (before recording)

```bash
npm install
npm run seed        # writes the 160-decision ledger so the Ledger page is populated
npm run dev         # http://localhost:3000
```

Open two tabs: `/` (dashboard) and `/ledger`.

---

## Shot list

**0:00–0:20 — The hook.** On the dashboard. Read the tagline aloud:
> "CounterFlow OS doesn't ask buy or sell. It asks: what regime are we in, which strategy has edge,
> and is this move real or just crowded AI agents? Tokenized stocks trade 24/7 — the US market
> doesn't — and that gap is the opportunity."
Point to the **"US market closed · token market live"** badge.

**0:20–0:45 — Agent Crowding Index.** Point to the index gauge.
> "First, a market-wide read: how crowded does the tokenized tape look to AI agents right now, and
> what posture should we take."

**0:45–1:10 — The board.** Sweep the 5-row table.
> "One routing decision per asset. NVDAx is a clean trend → Momentum, long. AAPLx is noise → no
> trade. And TSLAx is a crowded-hype move → the system wants to *fade* it, short."
Toggle **"AI reasoning (Qwen)"** on (if a valid key is set) to show the live council debate;
otherwise note "the deterministic narrator runs identically with no key."

**1:10–2:00 — The proof packet.** Click **TSLAx**.
> "Here's the whole decision, auditable. Crowded Hype regime. CrowdScore high, token 3.7% above
> fair value, but sector confirmation is weak — classic crowded overreaction."
Scroll to the **council**: "Eight agents debate — Crowd and Technical say fade, Macro is neutral."
Scroll to **Risk Governor**: "It sizes the trade, sets stop and take-profit, and could block it."
Scroll to **rejected strategies**: "And it tells you *why* Momentum was rejected — not a black box."
Click **"Show raw Trade Decision Packet (JSON)"**: "Every decision serializes to this — reproducible."

**2:00–2:40 — Proof it runs.** Go to **/ledger**.
> "This isn't a mockup. 160 paper decisions are logged. 57% win rate, positive PnL, low drawdown —
> honest numbers with real costs, not an overfit curve. Strategy memory tracks which strategy wins
> in which regime, and the autopilot reallocates accordingly."
Click **CSV** to show export. Optionally click **"Run live scan + log"** to show a fresh decision append.

**2:40–3:00 — Close.**
> "CounterFlow OS: detect the regime, route the strategy, risk-check it, and prove every decision.
> Trade the regime, not the signal."

---

## CLI alternative (for a terminal-only clip)

```bash
npm run scan          # board + crowding index + one full decision packet
npm run report        # win rate, strategy memory, by-regime performance
```
