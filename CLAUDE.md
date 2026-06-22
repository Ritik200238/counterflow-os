@AGENTS.md

# CounterFlow OS — Working Agreement (CLAUDE.md)

This file governs how Claude works on this project. These rules are **non-negotiable**.

## Project

**CounterFlow OS** — autonomous strategy-routing + proof layer for 24/7 tokenized US stock markets.
Entry for the **Bitget AI Base Camp Hackathon S1 — Stock AI Trading** track.
Full product spec lives in [`prd.md`](./prd.md). Read it before making product decisions.

Tagline: **"Trade the regime, not the signal."**
Goal: **reach #1 in the hackathon.**

## Hard Rules (do not compromise)

1. **Commit attribution is mandatory — no compromise.**
   Every git commit MUST end with the co-author trailer:
   ```
   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```
   Never drop, alter, or skip the author / co-author attribution on any commit. No `--no-verify`, no skipping hooks, no rewriting attribution.

2. **No time limit.** Take whatever time the task requires. Never cut scope or rush to "finish fast."

3. **No effort limit.** Always go full effort. Never give a shallow or partial answer to save effort.

4. **Always do what the user intends — no workarounds.**
   Build exactly what is asked, the way it's meant to be built. No shortcuts that change the intent, no silent substitutions, no "good enough" detours around the real requirement. If something is genuinely blocked, surface it and ask — don't route around it.

5. **No half-baked building. No half-baked testing.**
   - Every feature is built completely and wired end-to-end before it's called done.
   - Everything that is built must be tested and verified to actually run.
   - No stubs, no fake/mock results passed off as working, no "TODO: implement later" in place of real logic.
   - Report results honestly: if a test fails, say so with the output. If a step was skipped, say so.

## Build Standards

- Honest, reproducible, auditable — matches the PRD's core principle. No black-box claims, no cherry-picked results, no fake precision.
- Every trade / no-trade decision produces a structured **Trade Decision Packet** (see PRD §33).
- Structured JSON outputs from all agents. Modular agents. Logs that can be reproduced and inspected.
- Paper trading only for MVP — no real capital.

## Secrets

- API keys live in `.env` (gitignored). Never commit secrets. Never print raw key values in output or logs.
- `DASHSCOPE_API_KEY` / `QWEN_API_KEY` — Alibaba Cloud Qwen (DashScope), LLM reasoning. **Credit expires 2026-06-30.**
- `BITGET_AGENT_API_KEY` — Bitget AI Agent Hub skill.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 — dashboard and API routes in one app.
- Versions are newer than training data: read `node_modules/next/dist/docs/` before writing Next.js code.
- Vercel AI SDK calling Qwen via DashScope's OpenAI-compatible endpoint.
- JSONL ledger files for the paper-trading log (inspectable, reproducible, exportable).
