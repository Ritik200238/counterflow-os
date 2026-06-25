import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in a parent directory was confusing
  // Turbopack's auto-detection.
  turbopack: { root: projectRoot },
  // Trace the committed paper-trading ledger into the serverless function bundles
  // so every ledger-reading route can fall back to it (before the Blob is seeded).
  outputFileTracingIncludes: {
    "/api/ledger": ["./data/**"],
    "/api/strategy-memory": ["./data/**"],
    "/api/autopilot": ["./data/**"],
    "/api/shadow": ["./data/**"],
    "/api/agent/tick": ["./data/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
