import { loadDotEnv } from "@/lib/util/env";
import { scanBoard } from "@/lib/pipeline";
import { qwenConfigured, qwenModel } from "@/lib/llm/qwen";
import { appendLedger, readLedger } from "@/lib/ledger/store";
import { table, pctStr, rule } from "./format";

// Live board scan. Prints the strategy-routing decision for all 5 assets plus the
// Agent Crowding Index. Flags:
//   --llm       use Qwen for reasoning narratives (falls back automatically)
//   --persist   resolve + append these decisions to the ledger

async function main() {
  loadDotEnv();
  const useLLM = process.argv.includes("--llm");
  const persist = process.argv.includes("--persist");

  if (useLLM) {
    console.log(
      qwenConfigured()
        ? `Reasoning: Qwen (${qwenModel()}) with deterministic fallback`
        : "Reasoning: deterministic (no Qwen key found)",
    );
  } else {
    console.log("Reasoning: deterministic (pass --llm to use Qwen)");
  }

  const existing = persist ? await readLedger() : [];
  const board = await scanBoard({ useLLM, startSeq: existing.length + 1 });

  console.log(rule("AGENT CROWDING INDEX"));
  console.log(
    `${board.crowdingIndex.index}/100  •  ${board.crowdingIndex.state}  •  ${board.crowdingIndex.extremeAssets} extreme asset(s)`,
  );
  console.log(board.crowdingIndex.recommendation);

  console.log(rule("STRATEGY BOARD"));
  console.log(
    table(
      ["Asset", "Regime", "Strategy", "Crowd", "Gap", "Conf", "Action"],
      board.decisions.map(({ packet: p }) => [
        p.asset,
        p.marketRegime,
        p.selectedStrategy.replace(" / Risk-Off", ""),
        p.scores.crowdScore,
        pctStr(p.scores.fairValueGapPct),
        (p.scores.strategyConfidence * 100).toFixed(0) + "%",
        p.finalAction === "no_trade"
          ? "FLAT"
          : p.finalAction === "short_paper"
            ? "SHORT"
            : "LONG",
      ]),
    ),
  );

  // Show one full decision packet so the proof trail is visible.
  const sample =
    board.decisions.find((d) => d.packet.finalAction !== "no_trade") ??
    board.decisions[0];
  console.log(rule(`TRADE DECISION PACKET — ${sample.packet.asset}`));
  console.log(JSON.stringify(sample.packet, null, 2));

  if (persist) {
    await appendLedger(board.decisions.map((d) => d.ledgerEntry));
    console.log(rule());
    console.log(`Appended ${board.decisions.length} decisions to data/ledger.jsonl`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
