import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="text-info">◢</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        That route doesn&apos;t exist in CounterFlow OS.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg border border-line2 bg-[#F0EFEA] px-4 py-2 text-sm text-ink hover:bg-[#E8E7E1]"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
