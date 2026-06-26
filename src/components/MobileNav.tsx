"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Board" },
  { href: "/agent", label: "Agent" },
  { href: "/ask", label: "Ask" },
  { href: "/signals", label: "Signals" },
  { href: "/autopilot", label: "Autopilot" },
  { href: "/shadow", label: "Shadow" },
  { href: "/ledger", label: "Ledger" },
  { href: "/portfolio", label: "Portfolio" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-20 border-b hairline bg-bg/90 backdrop-blur md:hidden">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-white">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l5-5 4 3 8-9" />
          </svg>
        </span>
        <span className="text-sm font-semibold tracking-tight text-ink">CounterFlow OS</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              isActive(it.href) ? "bg-[#F0EFEA] font-medium text-ink" : "text-muted2"
            }`}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
