import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { LedgerEntry } from "@/lib/types";

// Append-only JSONL ledger. JSONL is chosen deliberately: human-inspectable,
// diff-friendly, exportable, and proof the system ran (PRD §15).
//
// Storage is environment-aware:
//   • Local/dev: <project>/data/ledger.jsonl (committed canonical demo ledger).
//   • Vercel (read-only FS): durable Vercel Blob, so writes survive cold starts
//     and the cron / scan-logging actually accumulate. First read falls back to
//     the committed bundle until the first write seeds the blob.
// All Blob calls are wrapped so a failure degrades to the bundled ledger rather
// than breaking the app.

const BLOB_KEY = "ledger.jsonl";
const useBlob = Boolean(process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN);

function bundledLedgerPath(): string {
  return path.join(process.cwd(), "data", "ledger.jsonl");
}

export function dataDir(): string {
  return path.join(process.cwd(), "data");
}

export function ledgerPath(): string {
  return useBlob ? `blob:${BLOB_KEY}` : path.join(dataDir(), "ledger.jsonl");
}

function parseJsonl(text: string): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as LedgerEntry);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

function serialize(entries: LedgerEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
}

function readBundled(): LedgerEntry[] {
  try {
    return parseJsonl(fs.readFileSync(bundledLedgerPath(), "utf8"));
  } catch {
    return [];
  }
}

// --- Blob-backed (Vercel) ------------------------------------------------

async function blobRead(): Promise<LedgerEntry[]> {
  try {
    const { head } = await import("@vercel/blob");
    const meta = await head(BLOB_KEY, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const u = new URL(meta.downloadUrl);
    u.searchParams.set("_cf", String(Date.now())); // bust any stale edge cache
    const res = await fetch(u.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`blob fetch ${res.status}`);
    return parseJsonl(await res.text());
  } catch {
    // Not yet written (or transient) → fall back to the committed bundle.
    return readBundled();
  }
}

async function blobWrite(entries: LedgerEntry[]): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(BLOB_KEY, serialize(entries), {
    access: "public", // non-sensitive paper-sim data in a public store
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/x-ndjson",
    cacheControlMaxAge: 0, // mutable file — don't let the CDN serve stale reads
  });
}

// --- Public API ----------------------------------------------------------

async function ensureDataDir(): Promise<void> {
  await fsp.mkdir(dataDir(), { recursive: true });
}

export async function readLedger(): Promise<LedgerEntry[]> {
  if (useBlob) return blobRead();
  try {
    return parseJsonl(await fsp.readFile(path.join(dataDir(), "ledger.jsonl"), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return readBundled();
    throw err;
  }
}

export function readLedgerSync(): LedgerEntry[] {
  // Synchronous read is local-only (Blob is async); used by non-server callers.
  try {
    return parseJsonl(fs.readFileSync(path.join(dataDir(), "ledger.jsonl"), "utf8"));
  } catch {
    return readBundled();
  }
}

export async function appendLedger(entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return;
  if (useBlob) {
    const current = await blobRead();
    await blobWrite([...current, ...entries]);
    return;
  }
  await ensureDataDir();
  await fsp.appendFile(path.join(dataDir(), "ledger.jsonl"), serialize(entries), "utf8");
}

export async function writeLedger(entries: LedgerEntry[]): Promise<void> {
  if (useBlob) {
    await blobWrite(entries);
    return;
  }
  await ensureDataDir();
  await fsp.writeFile(path.join(dataDir(), "ledger.jsonl"), serialize(entries), "utf8");
}

export async function clearLedger(): Promise<void> {
  if (useBlob) {
    await blobWrite([]);
    return;
  }
  await ensureDataDir();
  await fsp.writeFile(path.join(dataDir(), "ledger.jsonl"), "", "utf8");
}
