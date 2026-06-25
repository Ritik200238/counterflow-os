"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="text-rose-400">◢</p>
      <h1 className="mt-2 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 break-words text-sm text-muted">{error.message || "Unexpected error."}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          onClick={() => reset()}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
        >
          Try again
        </button>
        <Link href="/" className="rounded-lg border hairline bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
