"use client";

import { useEffect, useState } from "react";
import { Panel, SectionTitle, Badge, Spinner, ErrorNote } from "@/components/ui";
import { ASSET_SYMBOLS } from "@/lib/types";
import type { SignalBench, SignalVerdict } from "@/lib/signals";

interface CurrentRow {
  key: string;
  label: string;
  values: Record<string, number>;
}

const ASSETS = ASSET_SYMBOLS;

const verdictBadge: Record<SignalVerdict, string> = {
  predictive: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  weak: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  noise: "border-slate-500/40 bg-slate-500/10 text-slate-400",
};

const catColor: Record<string, string> = {
  Momentum: "text-emerald-300",
  Value: "text-cyan-300",
  Crowding: "text-rose-300",
  Liquidity: "text-sky-300",
  Macro: "text-amber-300",
};

export default function SignalZoo() {
  const [bench, setBench] = useState<SignalBench | null>(null);
  const [current, setCurrent] = useState<CurrentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/signals")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else {
          setBench(d.bench as SignalBench);
          setCurrent(d.current as CurrentRow[]);
        }
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading && !bench) return <Spinner label="Benchmarking signal zoo…" />;
  if (error) return <ErrorNote message={`Couldn't load the Signal Zoo: ${error}`} />;
  if (!bench) return null;

  const currentByKey = new Map(current.map((c) => [c.key, c]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signal Zoo</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          The named signals the engine uses, each benchmarked with a real information coefficient
          (IC) — the correlation between the signal at decision time and the token&apos;s realized
          forward return, over {bench.samples} reproducible backtest samples (seed{" "}
          <span className="mono">{bench.seed}</span>). IC magnitudes are modest because markets are
          noisy — no fake precision.
        </p>
      </div>

      <Panel>
        <SectionTitle title="Benchmarked signals" hint="Sorted by |IC|. Positive = predicts up-moves; negative = predicts reversals/down-moves." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-medium">Signal</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Formula</th>
                <th className="py-2 pr-3 text-right font-medium">IC</th>
                <th className="py-2 pr-3 font-medium">Verdict</th>
                {ASSETS.map((a) => (
                  <th key={a} className="py-2 pr-2 text-right font-medium">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bench.rows.map((r) => {
                const cur = currentByKey.get(r.key);
                return (
                  <tr key={r.key} className="border-b hairline last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.label}</td>
                    <td className={`py-2 pr-3 ${catColor[r.category] ?? ""}`}>{r.category}</td>
                    <td className="mono py-2 pr-3 text-xs text-muted">{r.formula}</td>
                    <td className={`mono py-2 pr-3 text-right ${r.ic >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {r.ic >= 0 ? "+" : ""}{r.ic.toFixed(3)}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge className={verdictBadge[r.verdict]}>{r.verdict}</Badge>
                    </td>
                    {ASSETS.map((a) => (
                      <td key={a} className="mono py-2 pr-2 text-right text-slate-300">
                        {cur && cur.values[a] !== undefined ? cur.values[a].toFixed(2) : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Right-hand columns show each signal&apos;s current value per asset (demo scenario). Verdict:
          predictive |IC|≥0.06 · weak ≥0.03 · noise &lt;0.03.
        </p>
      </Panel>
    </div>
  );
}
