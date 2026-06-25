import fsp from "node:fs/promises";
import path from "node:path";
import type { Portfolio } from "@/lib/portfolio/types";
import { emptyPortfolio } from "@/lib/portfolio/types";

// Durable store for the live paper portfolio. Mirrors the ledger store: Vercel
// Blob in production (writes survive cold starts), filesystem locally.

const BLOB_KEY = "portfolio.json";
const useBlob = Boolean(process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN);

function filePath(): string {
  return path.join(process.cwd(), "data", "portfolio.json");
}

async function blobRead(): Promise<Portfolio | null> {
  try {
    const { head } = await import("@vercel/blob");
    const meta = await head(BLOB_KEY, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const u = new URL(meta.downloadUrl);
    u.searchParams.set("_cf", String(Date.now()));
    const res = await fetch(u.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Portfolio;
  } catch {
    return null;
  }
}

async function blobWrite(p: Portfolio): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(BLOB_KEY, JSON.stringify(p), {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

export async function readPortfolio(): Promise<Portfolio> {
  if (useBlob) {
    const p = await blobRead();
    return p ?? emptyPortfolio(new Date().toISOString());
  }
  try {
    const text = await fsp.readFile(filePath(), "utf8");
    return JSON.parse(text) as Portfolio;
  } catch {
    return emptyPortfolio(new Date().toISOString());
  }
}

export async function writePortfolio(p: Portfolio): Promise<void> {
  if (useBlob) {
    await blobWrite(p);
    return;
  }
  await fsp.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await fsp.writeFile(filePath(), JSON.stringify(p, null, 2), "utf8");
}
