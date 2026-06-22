import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in a parent directory was confusing
  // Turbopack's auto-detection.
  turbopack: { root: projectRoot },
  // Trace the committed paper-trading ledger into the serverless function bundle
  // so the deployed ledger/strategy-memory routes can read it at runtime.
  outputFileTracingIncludes: {
    "/api/ledger": ["./data/**"],
    "/api/strategy-memory": ["./data/**"],
  },
};

export default nextConfig;
