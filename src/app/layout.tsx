import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CounterFlow OS — Strategy router for tokenized equities",
  description:
    "Autonomous strategy-routing and proof layer for 24/7 tokenized US stock markets. Trade the regime, not the signal.",
};

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b hairline bg-[#070a0f]/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-cyan-400 text-lg leading-none">◢</span>
          <span className="font-semibold tracking-tight">CounterFlow OS</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-0.5 text-sm text-muted">
          {[
            ["/", "Dashboard"],
            ["/agent", "Agent"],
            ["/ask", "Ask"],
            ["/signals", "Signals"],
            ["/autopilot", "Autopilot"],
            ["/shadow", "Shadow"],
            ["/ledger", "Ledger"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-2.5 py-1.5 hover:bg-white/5 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300">
            PAPER · SIM
          </span>
          <span className="hidden rounded-full border hairline px-2.5 py-1 text-muted sm:inline">
            Bitget AI Base Camp S1
          </span>
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <Nav />
        <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-5 py-8 text-xs text-muted">
          CounterFlow OS · paper-trading simulation · every decision is logged and reproducible · not financial advice.
        </footer>
      </body>
    </html>
  );
}
