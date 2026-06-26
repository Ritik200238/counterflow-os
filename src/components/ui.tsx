import type { ReactNode } from "react";

// Small presentational building blocks shared across the dashboard. Pure
// components (no client state), usable from server or client components.

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`panel p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted2">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  valueClass = "",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border hairline bg-[#FAFAF9] p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mono mt-1 text-lg font-semibold text-ink ${valueClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted2">{sub}</div>}
    </div>
  );
}

/** Horizontal bar for a 0..1 (or 0..100) value. */
export function Bar({
  value,
  max = 1,
  className = "bg-ink",
  height = "h-1.5",
}: {
  value: number;
  max?: number;
  className?: string;
  height?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-[#ECECE8] ${height}`}>
      <div className={`${height} rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function KeyVal({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b hairline py-1.5 text-sm last:border-0">
      <span className="text-muted2">{k}</span>
      <span className="mono text-right text-ink">{v}</span>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted2">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#E6E6E2] border-t-ink" />
      {label}
    </div>
  );
}

/** Consistent inline error message for a failed fetch/action. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-[#E6C3BF] bg-[#FBF1F0] p-3 text-sm text-[#A83A31]">
      {message}
    </p>
  );
}
