// Tiny console formatting helpers for the CLI scripts. No deps.

export function table(headers: string[], rows: (string | number)[][]): string {
  const all = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  return [line(headers), sep, ...rows.map((r) => line(r.map(String)))].join("\n");
}

export function pctStr(x: number | null, dp = 2): string {
  if (x === null) return "—";
  const s = x >= 0 ? "+" : "";
  return `${s}${x.toFixed(dp)}%`;
}

export const rule = (label = "") =>
  label
    ? `\n${"═".repeat(4)} ${label} ${"═".repeat(Math.max(0, 60 - label.length))}`
    : "═".repeat(66);
