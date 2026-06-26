"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="text-neg">◢</p>
      <h1 className="mt-2 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 break-words text-sm text-muted">{error.message || "Unexpected error."}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          onClick={() => reset()}
          className="rounded-lg border border-line2 bg-[#F0EFEA] px-4 py-2 text-sm text-ink hover:bg-[#E8E7E1]"
        >
          Try again
        </button>
        <Link href="/" className="rounded-lg border hairline bg-[#F7F7F5] px-4 py-2 text-sm text-ink hover:bg-[#EFEEE9]">
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
