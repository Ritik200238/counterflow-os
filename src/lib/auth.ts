// Auth is OPTIONAL and non-gating. The public demo runs fully without it; adding
// Clerk keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY) activates
// sign-in + per-user data — the same "wire-it, activate-with-keys" pattern as the
// Qwen LLM layer. NEXT_PUBLIC_ is readable on both client and server.

export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
