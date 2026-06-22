import fs from "node:fs";
import path from "node:path";

// Minimal, dependency-free .env loader. Next.js loads .env automatically for the
// app, but standalone CLI scripts (run via tsx) need this. Only sets a key if it
// isn't already present in process.env, so real env always wins.

let loaded = false;

export function loadDotEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
