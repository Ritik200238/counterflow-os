"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, SectionTitle, Stat, Spinner } from "@/components/ui";
import { directionColor, pctStr, strategyShort } from "@/lib/ui";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const s = n < 0 ? "-" : "";
  return `${s}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function usdSigned(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
const pnlClass = (n: number | null | undefined) =>
  n == null ? "" : n >= 0 ? "text-emerald-300" : "text-rose-300";

export default function PortfolioView() {
  const [data, setData] = useState<(PortfolioSnapshot & { source?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = () =>
      fetch("/api/portfolio")
        .then((r) => r.json())
        .then((d) => {
          if (alive && !d.error) setData(d);
        })
        .finally(() => alive && setLoading(false));
    run();
    const id = setInterval(run, 20_000); // mark-to-market refresh
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  async function tick() {
    setBusy("tick");
    setNote(null);
    try {
      const res = await fetch("/api/portfolio/tick", { method: "POST" }).then((r) => r.json());
      if (res.error) setNote(res.error);
      else {
        setData(res);
        setNote(`Tick: opened ${res.openedThisTick}, closed ${res.closedThisTick} (source ${res.source}).`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setNote(null);
    try {
      const res = await fetch("/api/portfolio/reset", { method: "POST" }).then((r) => r.json());
      if (!res.error) {
        setData(res);
        setNote("Portfolio reset to starting capital.");
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Spinner label="Loading portfolio…" />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Portfolio</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The agent opens positions from real Bitget prices, marks them to market, and closes them
            on stop / take / time. Paper / simulation — ${data.startingCapital.toLocaleString()} starting
            capital. Source: <span className="mono">{data.source === "live" ? "live" : "demo"}</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={tick}
            disabled={!!busy}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {busy === "tick" ? "Ticking…" : "▶ Run tick"}
          </button>
          <button
            onClick={reset}
            disabled={!!busy}
            className="rounded-lg border hairline bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {busy === "reset" ? "…" : "Reset"}
          </button>
        </div>
      </div>

      {note && <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5 text-sm text-cyan-200">{note}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Equity" value={usd(data.equityUsd)} />
        <Stat
          label="Total return"
          value={pctStr(data.totalReturnPct)}
          valueClass={pnlClass(data.totalReturnPct)}
        />
        <Stat label="Realized P&L" value={usdSigned(data.realizedPnlUsd)} valueClass={pnlClass(data.realizedPnlUsd)} />
        <Stat label="Unrealized" value={usdSigned(data.unrealizedPnlUsd)} valueClass={pnlClass(data.unrealizedPnlUsd)} />
        <Stat label="Cash" value={usd(data.cashUsd)} sub={`${data.exposurePct}% exposed`} />
        <Stat
          label="Win rate"
          value={data.winRate === null ? "—" : `${(data.winRate * 100).toFixed(0)}%`}
          sub={`${data.openCount} open · ${data.closedCount} closed`}
        />
      </div>

      {/* Open positions */}
      <Panel>
        <SectionTitle title="Open Positions" hint="Marked to live token prices" />
        {data.open.length === 0 ? (
          <p className="py-6 text-sm text-muted">No open positions. Click <span className="text-cyan-300">Run tick</span> to scan live markets and open any actionable setups.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Dir</th>
                  <th className="py-2 pr-3 font-medium">Strategy</th>
                  <th className="py-2 pr-3 text-right font-medium">Entry</th>
                  <th className="py-2 pr-3 text-right font-medium">Mark</th>
                  <th className="py-2 pr-3 text-right font-medium">Size</th>
                  <th className="py-2 pr-3 text-right font-medium">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {data.open.map((pos) => (
                  <tr key={pos.id} className="border-b hairline last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      <Link href={`/asset/${pos.asset}`} className="hover:text-cyan-300">{pos.asset}</Link>
                    </td>
                    <td className={`mono py-2 pr-3 uppercase ${directionColor(pos.direction)}`}>{pos.direction}</td>
                    <td className="py-2 pr-3 text-xs">{strategyShort(pos.strategy)}</td>
                    <td className="mono py-2 pr-3 text-right">${pos.entryPrice.toFixed(2)}</td>
                    <td className="mono py-2 pr-3 text-right">{pos.markPrice != null ? `$${pos.markPrice.toFixed(2)}` : "—"}</td>
                    <td className="mono py-2 pr-3 text-right">{usd(pos.sizeUsd)}</td>
                    <td className={`mono py-2 pr-3 text-right ${pnlClass(pos.unrealizedPnlUsd)}`}>
                      {usdSigned(pos.unrealizedPnlUsd)} {pos.unrealizedPnlPct != null ? `(${pctStr(pos.unrealizedPnlPct)})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Closed positions */}
      {data.closed.length > 0 && (
        <Panel>
          <SectionTitle title="Closed Positions" />
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Dir</th>
                  <th className="py-2 pr-3 text-right font-medium">Entry → Exit</th>
                  <th className="py-2 pr-3 font-medium">Reason</th>
                  <th className="py-2 pr-3 text-right font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {data.closed.map((pos) => (
                  <tr key={pos.id} className="border-b hairline last:border-0">
                    <td className="py-2 pr-3 font-medium">{pos.asset}</td>
                    <td className={`mono py-2 pr-3 uppercase ${directionColor(pos.direction)}`}>{pos.direction}</td>
                    <td className="mono py-2 pr-3 text-right">${pos.entryPrice.toFixed(2)} → ${pos.exitPrice?.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-xs text-muted">{pos.exitReason.replace("_", " ")}</td>
                    <td className={`mono py-2 pr-3 text-right ${pnlClass(pos.pnlUsd)}`}>
                      {usdSigned(pos.pnlUsd)} {pos.pnlPct != null ? `(${pctStr(pos.pnlPct)})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
