"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "@/components/AuthButton";

type Item = { href: string; label: string; icon: string };
type Group = { label: string | null; items: Item[] };

const GROUPS: Group[] = [
  { label: null, items: [{ href: "/", label: "Market board", icon: "▦" }] },
  {
    label: "Read",
    items: [
      { href: "/agent", label: "Autonomous Agent", icon: "◎" },
      { href: "/ask", label: "Ask the agent", icon: "?" },
      { href: "/signals", label: "Signal Zoo", icon: "∿" },
    ],
  },
  {
    label: "Prove",
    items: [
      { href: "/autopilot", label: "Strategy Autopilot", icon: "⇄" },
      { href: "/shadow", label: "Decision Shadow", icon: "◑" },
      { href: "/ledger", label: "Trade Ledger", icon: "≡" },
    ],
  },
  {
    label: "Run",
    items: [{ href: "/portfolio", label: "Live Portfolio", icon: "$" }],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r hairline bg-sidebar px-3 py-5 md:flex">
      {/* Brand */}
      <Link href="/" className="mb-5 flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l5-5 4 3 8-9" />
          </svg>
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-ink">CounterFlow</span>
          <span className="block text-[11px] tracking-wide text-muted">OS · v0.9</span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.label && (
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {g.label}
              </p>
            )}
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-[#F0EFEA] font-medium text-ink"
                      : "text-muted2 hover:bg-[#F2F1EC] hover:text-ink"
                  }`}
                >
                  <span className={`w-4 text-center text-[13px] ${active ? "text-ink" : "text-muted"}`}>
                    {it.icon}
                  </span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-4 space-y-3">
        <AuthButton />
        {/* Paper / simulation badge */}
        <div className="rounded-xl border border-[#EFE4CE] bg-[#FBF7EF] px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#9A6F1E]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#B5852A]" /> Paper · Simulation
          </p>
          <p className="mt-0.5 text-[11px] text-muted">Not financial advice</p>
        </div>
      </div>
    </aside>
  );
}
