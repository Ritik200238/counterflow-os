import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/auth";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CounterFlow OS — Strategy router for tokenized equities",
  description:
    "Autonomous strategy-routing and proof layer for 24/7 tokenized US stock markets. Trade the regime, not the signal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tree = (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <Nav />
        <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-5 py-8 text-xs text-muted">
          CounterFlow OS · paper-trading simulation · every decision is logged and reproducible · not financial advice.
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
  // ClerkProvider only when configured — public demo runs without it.
  return clerkEnabled ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
