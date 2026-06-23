"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui";
import { agentColor, stanceLabel, strategyShort, actionLabel } from "@/lib/ui";
import type { AgentOutput } from "@/lib/types";

interface Verdict {
  selectedStrategy: string;
  direction: string;
  finalAction: "long_paper" | "short_paper" | "no_trade";
  agreement: { agree: number; total: number };
  risk: { approved: boolean; state: string; size: number };
}

export default function StreamingCouncil({ symbol, source }: { symbol: string; source: "sim" | "live" }) {
  const [streaming, setStreaming] = useState(false);
  const [agents, setAgents] = useState<AgentOutput[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function start() {
    esRef.current?.close();
    setAgents([]);
    setVerdict(null);
    setStreaming(true);
    const es = new EventSource(`/api/council/stream?asset=${symbol}&source=${source}`);
    esRef.current = es;
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "agent") setAgents((prev) => [...prev, msg.agent as AgentOutput]);
      else if (msg.type === "verdict") setVerdict(msg as Verdict);
      else if (msg.type === "done") {
        es.close();
        setStreaming(false);
      }
    };
    es.onerror = () => {
      es.close();
      setStreaming(false);
    };
  }

  return (
    <div className="rounded-xl border hairline bg-black/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">Live council stream</span>
        <button
          onClick={start}
          disabled={streaming}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {streaming ? "Deliberating…" : "▶ Watch the council deliberate"}
        </button>
      </div>

      {(agents.length > 0 || verdict) && (
        <div className="mt-3 space-y-1.5">
          {agents.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className={agentColor(a.agent)}>{a.agent}</span>
              <span className="flex-1 truncate px-2 text-slate-400">{a.summary}</span>
              <Badge className="border-slate-500/40 bg-slate-500/10 text-slate-300">
                {stanceLabel(a.vote.stance)} · {(a.vote.confidence * 100).toFixed(0)}%
              </Badge>
            </div>
          ))}
          {verdict && (
            <div className="mt-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5 text-xs text-slate-200">
              Verdict: <span className="font-semibold">{strategyShort(verdict.selectedStrategy as never)}</span>{" "}
              → {actionLabel(verdict.finalAction)} · agreement {verdict.agreement.agree}/{verdict.agreement.total} ·
              risk {verdict.risk.state}
              {verdict.risk.approved ? ` (size ${verdict.risk.size}%)` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
