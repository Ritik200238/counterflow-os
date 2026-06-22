import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LedgerEntry } from "@/lib/types";

// Append-only JSONL ledger. One decision per line. JSONL is chosen deliberately:
// it is human-inspectable, diff-friendly, trivially exportable, and proves the
// system actually ran (PRD §15).
//
// Storage location is environment-aware:
//   • Local/dev: <project>/data/ledger.jsonl (committed, the canonical demo ledger)
//   • Serverless (Vercel): the project filesystem is read-only, so writes go to
//     os.tmpdir(); the first write seeds itself from the committed ledger so the
//     live demo keeps its history. Reads prefer the writable copy, else the
//     committed bundle.

const ON_SERVERLESS = Boolean(process.env.VERCEL);

/** The committed, read-only ledger shipped with the deployment. */
function bundledLedgerPath(): string {
  return path.join(process.cwd(), "data", "ledger.jsonl");
}

export function dataDir(): string {
  return ON_SERVERLESS ? path.join(os.tmpdir(), "counterflow") : path.join(process.cwd(), "data");
}

/** Where writes go (and the preferred read source once it exists). */
export function ledgerPath(): string {
  return path.join(dataDir(), "ledger.jsonl");
}

async function ensureDataDir(): Promise<void> {
  await fsp.mkdir(dataDir(), { recursive: true });
}

/** The path to read from: the writable copy if present, else the bundled ledger. */
function readPath(): string {
  const w = ledgerPath();
  return fs.existsSync(w) ? w : bundledLedgerPath();
}

function parseJsonl(text: string): LedgerEntry[] {
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
}

export async function readLedger(): Promise<LedgerEntry[]> {
  try {
    return parseJsonl(await fsp.readFile(readPath(), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function readLedgerSync(): LedgerEntry[] {
  try {
    return parseJsonl(fs.readFileSync(readPath(), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** On serverless, seed the writable copy from the committed ledger on first write
 *  so appended decisions extend the demo history rather than replacing it. */
async function seedWritableIfNeeded(): Promise<void> {
  if (!ON_SERVERLESS) return;
  const w = ledgerPath();
  if (fs.existsSync(w)) return;
  const bundled = bundledLedgerPath();
  if (fs.existsSync(bundled)) {
    await fsp.copyFile(bundled, w);
  }
}

export async function appendLedger(entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureDataDir();
  await seedWritableIfNeeded();
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
