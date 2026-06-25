import { loadDotEnv } from "@/lib/util/env";
import { generateBoard } from "@/lib/market/generator";
import { computeSignals } from "@/lib/context";
import { scanAsset } from "@/lib/pipeline";
import { runBacktest } from "@/lib/seed";
import { computeLedgerStats } from "@/lib/memory";
import { RISK_LIMITS } from "@/lib/governor";
import { STRATEGIES, type Regime } from "@/lib/types";

// Self-contained assertion suite for the engine's core invariants. No test
// framework — runnable anywhere via `npm test`. Verifies the claims the product
// makes: reproducibility, transparent in-range scores, correct regime detection,
// router/risk invariants, and honest ledger accounting.

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

async function main() {
  loadDotEnv();

  // ---- A. Reproducibility (the core promise: same seed -> same everything) ----
  section("Reproducibility");
  const b1 = JSON.stringify(generateBoard("seed-A"));
  const b2 = JSON.stringify(generateBoard("seed-A"));
  const b3 = JSON.stringify(generateBoard("seed-B"));
  ok(b1 === b2, "generateBoard is deterministic for the same seed");
  ok(b1 !== b3, "generateBoard differs across seeds");

  const back1 = JSON.stringify(await runBacktest({ decisions: 40, seed: "rep" }));
  const back2 = JSON.stringify(await runBacktest({ decisions: 40, seed: "rep" }));
  ok(back1 === back2, "runBacktest produces an identical ledger for the same seed");

  // ---- B. Score invariants ----
  section("Score invariants");
  const board = generateBoard();
  for (const m of board) {
    const s = computeSignals(m.snapshot);
    ok(s.crowd.score >= 0 && s.crowd.score <= 100, `${m.meta.symbol}: CrowdScore in [0,100]`);
    ok(s.liquidity.score >= 0 && s.liquidity.score <= 1, `${m.meta.symbol}: LiquidityScore in [0,1]`);
    ok(s.risk.score >= 0 && s.risk.score <= 1, `${m.meta.symbol}: RiskScore in [0,1]`);
    ok(s.regime.confidence >= 0 && s.regime.confidence <= 1, `${m.meta.symbol}: RegimeConfidence in [0,1]`);
    const gapSignOk =
      m.snapshot.tokenPrice >= m.snapshot.estimatedFairValue ? s.gapPct >= 0 : s.gapPct < 0;
    ok(gapSignOk, `${m.meta.symbol}: FairValueGap sign matches token-vs-fair`);
  }

  // ---- C. Regime detection on the signature board ----
  section("Regime detection (signature board)");
  const expected: Record<string, Regime> = {
    NVDAx: "Clean Trend",
    TSLAx: "Crowded Hype",
    AAPLx: "Noise",
    COINx: "Fair-Value Gap",
    HOODx: "Macro Shock",
  };
  for (const m of board) {
    const r = computeSignals(m.snapshot).regime.regime;
    ok(r === expected[m.meta.symbol], `${m.meta.symbol}: detected ${r}, expected ${expected[m.meta.symbol]}`);
  }

  // ---- D. Router / packet / risk invariants ----
  section("Router, packet & risk invariants");
  let i = 0;
  for (const m of board) {
    const { packet: p } = await scanAsset(m, { decisionId: `t_${++i}`, useLLM: false });
    ok(p.rejectedStrategies.length === 6, `${p.asset}: exactly 6 rejected strategies`);
    ok(
      !p.rejectedStrategies.some((r) => r.strategy === p.selectedStrategy),
      `${p.asset}: selected strategy not in rejected list`,
    );
    ok(p.council.length === 8, `${p.asset}: council has 8 agents (7 + router)`);
    ok(p.agentAgreement.total === 8, `${p.asset}: agreement total is 8`);
    ok(STRATEGIES.includes(p.selectedStrategy), `${p.asset}: selected strategy is valid`);
    ok(p.risk.stopLossPct <= RISK_LIMITS.maxLossPerTradePct, `${p.asset}: stop-loss within per-trade cap`);
    ok(p.risk.positionSizePct <= RISK_LIMITS.maxPositionPctPerAsset, `${p.asset}: size within per-asset cap`);
    if (p.finalAction !== "no_trade") {
      ok(p.risk.approved && p.risk.positionSizePct > 0, `${p.asset}: executed trade is risk-approved with size`);
    } else {
      ok(p.risk.positionSizePct === 0, `${p.asset}: no-trade has zero size`);
    }
  }

  // Specific expected routings from the demo board.
  const tsla = (await scanAsset(board.find((m) => m.meta.symbol === "TSLAx")!, { decisionId: "x", useLLM: false })).packet;
  ok(tsla.selectedStrategy === "CounterFlow Fade" && tsla.finalAction === "short_paper", "TSLAx routes to a CounterFlow Fade short");
  const hood = (await scanAsset(board.find((m) => m.meta.symbol === "HOODx")!, { decisionId: "y", useLLM: false })).packet;
  ok(hood.selectedStrategy === "Macro Rebalance", "HOODx (macro shock) routes to the Macro Rebalance strategy");

  // ---- E. Ledger accounting honesty ----
  section("Ledger accounting");
  const entries = await runBacktest({ decisions: 120, seed: "acct" });
  const ids = new Set(entries.map((e) => e.decisionId));
  ok(ids.size === entries.length, "every decision id is unique");
  const stats = computeLedgerStats(entries);
  ok(stats.closedTrades > 0, "backtest produces closed trades");
  ok(stats.noTrades > 0, "backtest produces disciplined no-trades");
  ok(stats.wins + stats.losses === stats.closedTrades, "wins + losses === closed trades");
  for (const e of entries) {
    if (e.status === "no_trade") {
      ok(e.entryPrice === null && e.pnlPct === null, `${e.decisionId}: no-trade has null entry/PnL`);
    } else if (e.status === "closed") {
      ok(e.entryPrice !== null && e.pnlPct !== null, `${e.decisionId}: closed trade has entry + PnL`);
    }
    if (e.positionSizePct > RISK_LIMITS.maxPositionPctPerAsset) {
      ok(false, `${e.decisionId}: size ${e.positionSizePct}% exceeds cap`);
    }
  }
  ok(true, "all ledger sizes within the per-asset cap");

  // ---- Summary ----
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("All engine invariants hold. ✓");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
