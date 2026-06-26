"use client";

import { useEffect, useRef, useState } from "react";
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
  n == null ? "" : n >= 0 ? "text-pos-ink" : "text-neg";

export default function PortfolioView() {
  const [data, setData] = useState<(PortfolioSnapshot & { source?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  // Refs so the interval (which closes over initial state) sees current values.
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (busyRef.current) return; // don't let the poll clobber a fresh tick/reset
      fetch("/api/portfolio")
        .then((r) => r.json())
        .then((d) => {
          if (!alive || busyRef.current) return;
          if (d.error) setStale(true);
          else {
            setData(d);
            setStale(false);
          }
        })
        .catch(() => alive && setStale(true))
        .finally(() => alive && setLoading(false));
    };
    run();
    const id = setInterval(run, 20_000); // mark-to-market refresh
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  async function tick() {
    setBusy("tick");
    busyRef.current = true;
    setNote(null);
    try {
      const res = await fetch("/api/portfolio/tick", { method: "POST" }).then((r) => r.json());
      if (res.error) setNote(res.error);
      else {
        setData(res);
        setStale(false);
        setNote(`Tick: opened ${res.openedThisTick}, closed ${res.closedThisTick} (source: ${res.source}).`);
      }
    } catch (e) {
      setNote(`Error: ${String(e)}`);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    busyRef.current = true;
    setNote(null);
    try {
      const res = await fetch("/api/portfolio/reset", { method: "POST" }).then((r) => r.json());
      if (res.error) setNote(res.error);
      else {
        setData(res);
        setStale(false);
        setNote("Portfolio reset to starting capital.");
      }
    } catch (e) {
      setNote(`Error: ${String(e)}`);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  if (loading && !data) return <Spinner label="Loading portfolio…" />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paper Portfolio</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The agent opens positions from{" "}
            {data.source === "live" ? "real Bitget prices" : "demo prices"}, marks them to market,
            and closes them on stop / take / time. Shared paper portfolio (one global instance, not
            per-user) — ${data.startingCapital.toLocaleString()} starting capital · source{" "}
            <span className="mono">{data.source === "live" ? "live" : "demo"}</span>
            {stale && <span className="text-warn"> · live data unavailable, showing last snapshot</span>}.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={tick}
            disabled={!!busy}
            className="rounded-lg border border-line2 bg-[#F0EFEA] px-3 py-1.5 text-sm font-medium text-ink hover:bg-[#E8E7E1] disabled:opacity-50"
          >
            {busy === "tick" ? "Ticking…" : "▶ Run tick"}
          </button>
          <button
            onClick={reset}
            disabled={!!busy}
            className="rounded-lg border hairline bg-[#F7F7F5] px-3 py-1.5 text-sm font-medium text-ink hover:bg-[#EFEEE9] disabled:opacity-50"
          >
            {busy === "reset" ? "…" : "Reset"}
          </button>
        </div>
      </div>

      {note && <p className="rounded-lg border border-line bg-[#F4F3EF] p-2.5 text-sm text-ink">{note}</p>}

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
        <SectionTitle title="Open Positions" hint={data.source === "live" ? "Marked to live token prices" : "Marked to demo prices"} />
        {data.open.length === 0 ? (
          <p className="py-6 text-sm text-muted">No open positions. Click <span className="text-info">Run tick</span> to scan live markets and open any actionable setups.</p>
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
                      <Link href={`/asset/${pos.asset}`} className="hover:text-info">{pos.asset}</Link>
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
      <Panel>
        <SectionTitle title="Closed Positions" />
        {data.closed.length === 0 ? (
          <p className="py-6 text-sm text-muted">No closed trades yet.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
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
        )}
      </Panel>
    </div>
  );
}
