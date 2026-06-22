"use client";

// Pure-SVG equity curve — cumulative paper PnL over closed trades, in time order.
// No chart dependency; scales to its container via viewBox.

export default function EquityChart({ series }: { series: number[] }) {
  if (series.length < 2) {
    return <p className="py-6 text-sm text-muted">Not enough closed trades to plot an equity curve yet.</p>;
  }

  const W = 800;
  const H = 200;
  const pad = 8;
  const min = Math.min(0, ...series);
  const max = Math.max(0, ...series);
  const range = max - min || 1;

  const x = (i: number) => pad + (i / (series.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const zeroY = y(0);

  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const last = series[series.length - 1];
  const positive = last >= 0;
  const stroke = positive ? "#34d399" : "#fb7185";
  const fill = positive ? "rgba(52,211,153,0.12)" : "rgba(251,113,133,0.12)";

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
        <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
        <path d={area} fill={fill} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>start: 0.00%</span>
        <span className={positive ? "text-emerald-300" : "text-rose-300"}>
          cumulative: {last >= 0 ? "+" : ""}{last.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
