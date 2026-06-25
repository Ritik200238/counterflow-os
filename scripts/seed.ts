import { loadDotEnv } from "@/lib/util/env";
import { runBacktest } from "@/lib/seed";
import { writeLedger } from "@/lib/ledger/store";
import { computeLedgerStats, computeStrategyMemory } from "@/lib/memory";
import { table, pctStr, rule } from "./format";

// Reproducible backtest seed: populates data/ledger.jsonl with paper decisions
// across regimes, then prints the resulting performance. Usage:
//   npm run seed -- [decisions] [seed]

async function main() {
  loadDotEnv();
  const decisions = Number(process.argv[2]) || 480;
  const seed = process.argv[3] || "counterflow-backtest";

  console.log(`Running CounterFlow OS backtest: ${decisions} decisions, seed="${seed}"...`);
  const entries = await runBacktest({ decisions, seed });
  await writeLedger(entries);

  const stats = computeLedgerStats(entries);
  const memory = computeStrategyMemory(entries);

  console.log(rule("LEDGER WRITTEN"));
  console.log(`data/ledger.jsonl  •  ${entries.length} decisions`);
  console.log(
    `Executed: ${stats.totalTrades}  |  Closed: ${stats.closedTrades}  |  No-Trade: ${stats.noTrades}`,
  );
  console.log(
    `Win rate: ${stats.winRate === null ? "—" : (stats.winRate * 100).toFixed(1) + "%"}  |  Avg return: ${pctStr(stats.avgReturnPct)}  |  Total PnL: ${pctStr(stats.totalPnlValue, 2)}  |  Max DD: ${stats.maxDrawdownPct.toFixed(2)}%`,
  );

  console.log(rule("STRATEGY PERFORMANCE MEMORY"));
  console.log(
    table(
      ["Strategy", "Trades", "WinRate", "AvgRet", "BestRegime", "Weight"],
      memory.rows.map((r) => [
        r.strategy,
        r.trades,
        r.winRate === null ? "—" : (r.winRate * 100).toFixed(0) + "%",
        pctStr(r.avgReturnPct),
        r.bestRegime ?? "—",
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
