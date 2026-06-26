import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "CounterFlow OS — Strategy router for tokenized equities",
  description:
    "Autonomous strategy-routing and proof layer for 24/7 tokenized US stock markets. Trade the regime, not the signal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tree = (
    <html lang="en" className={`${outfit.variable} antialiased`}>
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav />
            <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-7 md:px-10 md:py-9">{children}</main>
            <footer className="mx-auto w-full max-w-5xl px-5 py-8 text-xs text-muted md:px-10">
              CounterFlow OS · paper-trading simulation · every decision is logged and reproducible · not financial advice.
            </footer>
          </div>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
  // ClerkProvider only when configured — public demo runs without it.
  return clerkEnabled ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
