"use client";

import { useEffect, useRef, useState } from "react";
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
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamSource, setStreamSource] = useState<"sim" | "live">(source);
  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  // Close any open stream on unmount or when the asset/source changes (cleanup
  // runs before the next render with new deps), preventing leaks + stale streams.
  useEffect(() => {
    return () => esRef.current?.close();
  }, [symbol, source]);

  function start() {
    esRef.current?.close();
    doneRef.current = false;
    setAgents([]);
    setVerdict(null);
    setStreamError(null);
    setStreaming(true);
    const es = new EventSource(`/api/council/stream?asset=${symbol}&source=${source}`);
    esRef.current = es;
    es.onmessage = (e) => {
      let msg: { type: string; agent?: AgentOutput; source?: "sim" | "live" } & Partial<Verdict>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "meta" && msg.source) setStreamSource(msg.source);
      else if (msg.type === "agent" && msg.agent) setAgents((prev) => [...prev, msg.agent as AgentOutput]);
      else if (msg.type === "verdict") setVerdict(msg as Verdict);
      else if (msg.type === "done") {
        doneRef.current = true;
        es.close();
        setStreaming(false);
      }
    };
    es.onerror = () => {
      es.close();
      setStreaming(false);
      // A clean end fires onerror after close; only flag if we didn't finish.
      if (!doneRef.current) setStreamError("Council stream failed — retry.");
    };
  }

  return (
    <div className="rounded-xl border hairline bg-[#F7F7F5] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          Council stream <span className="text-muted">· {streamSource === "live" ? "live" : "demo"}</span>
        </span>
        <button
          onClick={start}
          disabled={streaming}
          className="rounded-lg border border-line2 bg-[#F0EFEA] px-3 py-1 text-xs font-medium text-ink hover:bg-[#E8E7E1] disabled:opacity-50"
        >
          {streaming ? "Deliberating…" : "▶ Watch the council deliberate"}
        </button>
      </div>

      {streamError && <p className="mt-2 text-xs text-neg">{streamError}</p>}

      {(agents.length > 0 || verdict) && (
        <div className="mt-3 space-y-1.5">
          {agents.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className={agentColor(a.agent)}>{a.agent}</span>
              <span className="flex-1 truncate px-2 text-muted2">{a.summary}</span>
              <Badge className="border-line2 bg-[#F2F2EF] text-ink2">
                {stanceLabel(a.vote.stance)} · {(a.vote.confidence * 100).toFixed(0)}%
              </Badge>
            </div>
          ))}
          {verdict && (
            <div className="mt-2 rounded-lg border border-line bg-[#F4F3EF] p-2.5 text-xs text-ink">
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
