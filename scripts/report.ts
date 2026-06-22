import { loadDotEnv } from "@/lib/util/env";
import { readLedger } from "@/lib/ledger/store";
import { computeLedgerStats, computeStrategyMemory } from "@/lib/memory";
import { table, pctStr, rule } from "./format";

// Reproducible performance report from the on-disk ledger. Usage: npm run report

async function main() {
  loadDotEnv();
  const entries = await readLedger();
  if (entries.length === 0) {
    console.log("Ledger is empty. Run `npm run seed` first.");
    return;
  }

  const stats = computeLedgerStats(entries);
  const memory = computeStrategyMemory(entries);

  console.log(rule("COUNTERFLOW OS — LEDGER REPORT"));
  console.log(`Decisions: ${stats.totalDecisions}`);
  console.log(`Executed paper trades: ${stats.totalTrades}  (closed ${stats.closedTrades}, open ${stats.openTrades})`);
  console.log(`No-Trade decisions: ${stats.noTrades}`);
  console.log(
    `Win rate: ${stats.winRate === null ? "—" : (stats.winRate * 100).toFixed(1) + "%"}  (${stats.wins}W / ${stats.losses}L)`,
  );
  console.log(`Avg return / trade: ${pctStr(stats.avgReturnPct)}`);
  console.log(`Total PnL (portfolio %): ${pctStr(stats.totalPnlValue)}`);
  console.log(`Max drawdown: ${stats.maxDrawdownPct.toFixed(2)}%`);

  console.log(rule("STRATEGY PERFORMANCE MEMORY"));
  console.log(
    table(
      ["Strategy", "Trades", "WinRate", "AvgRet", "BestRegime", "WorstRegime", "Weight"],
      memory.rows.map((r) => [
        r.strategy,
        r.trades,
        r.winRate === null ? "—" : (r.winRate * 100).toFixed(0) + "%",
        pctStr(r.avgReturnPct),
        r.bestRegime ?? "—",
        r.worstRegime ?? "—",
        r.currentWeight + "%",
      ]),
    ),
  );

  console.log(rule("BY REGIME"));
  console.log(
    table(
      ["Regime", "Trades", "WinRate", "AvgRet"],
      stats.byRegime.map((r) => [
        r.regime,
        r.trades,
        r.winRate === null ? "—" : (r.winRate * 100).toFixed(0) + "%",
        pctStr(r.avgReturnPct),
      ]),
    ),
  );
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
