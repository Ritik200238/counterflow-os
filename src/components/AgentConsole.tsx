"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Panel, SectionTitle, Badge } from "@/components/ui";
import { actionColor, actionLabel, crowdColor, pctStr, regimeColor } from "@/lib/ui";
import type { AgentTick } from "@/lib/agent/activity";
import type { FinalAction, Regime } from "@/lib/types";

const INTERVAL_MS = 25_000;

interface Row {
  asset: string;
  regime: Regime;
  action: FinalAction;
  direction: string;
  crowdScore: number;
  fairValueGapPct: number;
}

interface LogLine {
  id: number;
  time: string;
  level: "signal" | "warn" | "info" | "tick";
  text: string;
}

const levelColor: Record<LogLine["level"], string> = {
  signal: "text-pos-ink",
  warn: "text-warn",
  info: "text-muted2",
  tick: "text-info",
};

export default function AgentConsole() {
  const [running, setRunning] = useState(true);
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState<AgentTick | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "sim">("live");
  const prev = useRef<Map<string, Regime>>(new Map());
  const counter = useRef(0);

  useEffect(() => {
    if (!running) return;
    let alive = true;

    const push = (lines: Omit<LogLine, "id" | "time">[]) => {
      const time = new Date().toLocaleTimeString();
      const stamped = lines.map((l) => ({ ...l, id: counter.current++, time }));
      setLog((prevLog) => [...stamped.reverse(), ...prevLog].slice(0, 60));
    };

    const run = () => {
      fetch(`/api/agent/tick?source=${live ? "live" : "sim"}`)
        .then((r) => r.json())
        .then((res) => {
          if (!alive) return;
          if (res.error) {
            push([{ level: "warn", text: `scan failed: ${res.error}` }]);
            setLastRun(new Date().toLocaleTimeString());
            return;
          }
          const t = res.tick as AgentTick;
          const decisions = res.decisions as Row[];
          setTick(t);
          setRows(decisions);
          setSource(res.source);
          setLastRun(new Date().toLocaleTimeString());

          // Diff regimes against the previous cycle to surface changes proactively.
          const changes: Omit<LogLine, "id" | "time">[] = [];
          for (const d of decisions) {
            const before = prev.current.get(d.asset);
            if (before && before !== d.regime) {
              changes.push({ level: "warn", text: `${d.asset}: regime shift ${before} → ${d.regime}` });
            }
            prev.current.set(d.asset, d.regime);
          }

          push([
            {
              level: "tick",
              text: `scan complete · ${decisions.length} assets · crowding ${t.crowdingIndex}/100 (${t.crowdingState}) · source ${res.source}`,
            },
            ...changes,
            ...t.alerts.map((a) => ({ level: a.level, text: a.text })),
          ]);
        })
        .catch((e) => {
          if (alive) push([{ level: "warn", text: `scan request failed: ${String(e)}` }]);
        });
    };

    run();
    const id = setInterval(run, INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [running, live]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Autonomous Agent</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            While this page is open, the agent scans every {INTERVAL_MS / 1000}s, routes strategies,
            and streams signals. (Headless server-side autonomy runs on a daily schedule.) Paper /
            simulation, not financial advice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border hairline text-xs">
            <button
              onClick={() => setLive(false)}
              className={`px-3 py-1 ${!live ? "bg-[#E8E7E1] text-ink" : "text-muted hover:bg-[#F4F3EF]"}`}
            >
              Demo
            </button>
            <button
              onClick={() => setLive(true)}
              className={`px-3 py-1 ${live ? "bg-pos/15 text-pos-ink" : "text-muted hover:bg-[#F4F3EF]"}`}
            >
              ⚡ Live
            </button>
          </div>
          <button
            onClick={() => setRunning((r) => !r)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              running
                ? "border-neg/25 bg-neg/10 text-neg hover:bg-neg/15"
                : "border-pos/25 bg-pos/10 text-pos-ink hover:bg-pos/15"
            }`}
          >
            {running ? "❚❚ Pause" : "▶ Resume"}
          </button>
        </div>
      </div>

      {/* Status */}
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${running ? "animate-pulse bg-pos" : "bg-muted"}`}
            />
            {running ? "Running" : "Paused"}
          </span>
          <span className="text-sm text-muted">last scan: {lastRun ?? "—"}</span>
          <span className="text-sm text-muted">
            source: <span className="mono">{source === "live" ? "live Bitget + Yahoo" : "demo"}</span>
          </span>
          {tick && (
            <span className="ml-auto text-sm">
              crowding{" "}
              <span className={crowdColor(tick.crowdingIndex)}>{tick.crowdingIndex}/100</span> ·{" "}
              {tick.crowdingState}
            </span>
          )}
        </div>
        {tick && <p className="mt-2 text-xs text-muted">Posture: {tick.posture}</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Activity feed */}
        <Panel>
          <SectionTitle title="Activity Feed" hint="What the agent is doing, live" />
          <div className="max-h-[420px] space-y-1.5 overflow-auto">
            {log.length === 0 ? (
              <p className="py-6 text-sm text-muted">Starting agent…</p>
            ) : (
              log.map((l) => (
                <div key={l.id} className="flex gap-2 text-xs">
                  <span className="mono shrink-0 text-muted">{l.time}</span>
                  <span className={levelColor[l.level]}>
                    {l.level === "signal" ? "◆ " : l.level === "warn" ? "▲ " : l.level === "tick" ? "▸ " : "· "}
                    {l.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* Current board */}
        <Panel>
          <SectionTitle title="Current Read" hint="Latest decision per asset" />
          {rows.length === 0 ? (
            <p className="py-6 text-sm text-muted">Scanning…</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {rows.map((d) => (
                  <tr key={d.asset} className="border-b hairline last:border-0">
                    <td className="py-2 pr-2">
                      <Link href={`/asset/${d.asset}`} className="font-medium hover:text-info">
                        {d.asset}
                      </Link>
                    </td>
                    <td className="py-2 pr-2">
                      <Badge className={regimeColor(d.regime)}>{d.regime}</Badge>
                    </td>
                    <td className={`mono py-2 pr-2 text-right ${crowdColor(d.crowdScore)}`}>{d.crowdScore}</td>
                    <td className="mono py-2 pr-2 text-right">{pctStr(d.fairValueGapPct)}</td>
                    <td className="py-2 text-center">
                      <Badge className={actionColor(d.action)}>{actionLabel(d.action)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
