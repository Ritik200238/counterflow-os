"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, Badge } from "@/components/ui";
import { actionLabel, actionColor, regimeColor, strategyShort, strategyColor } from "@/lib/ui";
import type { FinalAction, Regime, Strategy } from "@/lib/types";

const SUGGESTED = [
  "What regime is the market in right now?",
  "Which tokenized stock is most mispriced vs its underlying?",
  "Why is the system standing aside on most assets?",
  "Is NVDAx a buy right now?",
  "How crowded is the market?",
];

interface RefAsset {
  asset: string;
  regime: Regime;
  strategy: Strategy;
  action: FinalAction;
}

interface Turn {
  q: string;
  answer: string;
  source: "qwen" | "deterministic";
  model?: string;
  boardSource: "live" | "sim";
  referenced: RefAsset[];
}

export default function AskAgent() {
  const [input, setInput] = useState("");
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, source: live ? "live" : "sim" }),
      }).then((r) => r.json());
      if (res.error) {
        setError(res.error);
      } else {
        setTurns((t) => [
          {
            q,
            answer: res.answer,
            source: res.source,
            model: res.model,
            boardSource: res.boardSource,
            referenced: res.referenced ?? [],
          },
          ...t,
        ]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask CounterFlow</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Ask in plain English. Every answer is grounded in the live engine output — regimes,
          strategies, and scores from the real decision pipeline. Numbers are never invented.
          Paper / simulation, not financial advice.
        </p>
      </div>

      <Panel>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(input)}
            placeholder="e.g. Why did you fade TSLAx?"
            className="mono flex-1 rounded-lg border hairline bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={() => ask(input)}
            disabled={busy || !input.trim()}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="rounded-full border hairline bg-white/5 px-2.5 py-1 text-xs text-muted hover:bg-white/10 hover:text-slate-200 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-emerald-400" />
            Live data
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </Panel>

      {turns.map((t, i) => (
        <Panel key={i}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-cyan-300">▸</span>
            <span className="font-medium text-slate-200">{t.q}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{t.answer}</p>
          {t.referenced.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {t.referenced.map((r) => (
                <Link key={r.asset} href={`/asset/${r.asset}`}>
                  <Badge className={`${regimeColor(r.regime)} hover:brightness-125`}>
                    {r.asset} · {r.regime} ·{" "}
                    <span className={strategyColor(r.strategy)}>{strategyShort(r.strategy)}</span>{" "}
                    <span className={actionColor(r.action).split(" ")[0]}>{actionLabel(r.action)}</span>
                  </Badge>
                </Link>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Reasoning: <span className="mono">{t.source === "qwen" ? `Qwen (${t.model})` : "deterministic (grounded)"}</span>
            {" · "}data: <span className="mono">{t.boardSource === "live" ? "live Bitget + Yahoo" : "demo scenario"}</span>
          </p>
        </Panel>
      ))}
    </div>
  );
}
