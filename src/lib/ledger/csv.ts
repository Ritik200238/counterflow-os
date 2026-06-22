import type { LedgerEntry } from "@/lib/types";

// CSV export for the paper-trading ledger (PRD §16.3 "Export CSV/JSON").

const COLUMNS: (keyof LedgerEntry)[] = [
  "decisionId",
  "timestamp",
  "asset",
  "marketRegime",
  "selectedStrategy",
  "direction",
  "tokenPrice",
  "estimatedFairValue",
  "fairValueGapPct",
  "crowdScore",
  "regimeConfidence",
  "strategyConfidence",
  "liquidityScore",
  "entryPrice",
  "exitPrice",
  "positionSizePct",
  "stopLossPct",
  "takeProfitPct",
  "pnlPct",
  "pnlValue",
  "status",
  "exitReason",
  "holdMinutes",
  "riskState",
];

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `"${value.join("; ")}"`;
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ledgerToCsv(entries: LedgerEntry[]): string {
  const header = COLUMNS.join(",");
  const rows = entries.map((e) => COLUMNS.map((c) => cell(e[c])).join(","));
  return [header, ...rows].join("\n") + "\n";
}
