import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { LedgerEntry } from "@/lib/types";

// Append-only JSONL ledger. One decision per line. JSONL is chosen deliberately:
// it is human-inspectable, diff-friendly, trivially exportable, and proves the
// system actually ran (PRD §15). Stored under <project>/data/ledger.jsonl.

export function dataDir(): string {
  return path.join(process.cwd(), "data");
}

export function ledgerPath(): string {
  return path.join(dataDir(), "ledger.jsonl");
}

async function ensureDataDir(): Promise<void> {
  await fsp.mkdir(dataDir(), { recursive: true });
}

export async function readLedger(): Promise<LedgerEntry[]> {
  try {
    const text = await fsp.readFile(ledgerPath(), "utf8");
    const out: LedgerEntry[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as LedgerEntry);
      } catch {
        // Skip a corrupt line rather than failing the whole read.
      }
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function readLedgerSync(): LedgerEntry[] {
  try {
    const text = fs.readFileSync(ledgerPath(), "utf8");
    const out: LedgerEntry[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as LedgerEntry);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function appendLedger(entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureDataDir();
  const payload = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await fsp.appendFile(ledgerPath(), payload, "utf8");
}

export async function writeLedger(entries: LedgerEntry[]): Promise<void> {
  await ensureDataDir();
  const payload = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
  await fsp.writeFile(ledgerPath(), payload, "utf8");
}

export async function clearLedger(): Promise<void> {
  await ensureDataDir();
  await fsp.writeFile(ledgerPath(), "", "utf8");
}
