"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "@/components/AuthButton";

const LINKS: [string, string][] = [
  ["/", "Dashboard"],
  ["/agent", "Agent"],
  ["/portfolio", "Portfolio"],
  ["/ask", "Ask"],
  ["/signals", "Signals"],
  ["/autopilot", "Autopilot"],
  ["/shadow", "Shadow"],
  ["/ledger", "Ledger"],
];

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-20 border-b hairline bg-[#070a0f]/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-cyan-400 text-lg leading-none">◢</span>
          <span className="font-semibold tracking-tight">CounterFlow OS</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-0.5 text-sm">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                isActive(href)
                  ? "bg-cyan-500/15 text-cyan-200"
                  : "text-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300">
            PAPER · SIM
          </span>
          <span className="hidden rounded-full border hairline px-2.5 py-1 text-muted lg:inline">
            Bitget AI Base Camp S1
          </span>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
