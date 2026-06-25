interface Pt {
  t: number;
  price: number;
}

// Token (24/7, continuous) vs underlying equity (market-hours only, broken at
// session gaps) on a shared axis. The vertical gap between the lines is the live
// tracking error; the underlying's breaks show the 24/7-vs-limited-hours wedge.
export default function PriceChart({
  token,
  underlying,
  source,
}: {
  token: Pt[];
  underlying: Pt[];
  source: "live" | "sim";
}) {
  if (!token || token.length < 2) {
    return <p className="py-6 text-sm text-muted">Price history unavailable.</p>;
  }

  const W = 820;
  const H = 240;
  const padX = 6;
  const padY = 16;

  const all = [...token, ...underlying];
  const tMin = token[0].t;
  const tMax = token[token.length - 1].t;
  const pMin = Math.min(...all.map((p) => p.price));
  const pMax = Math.max(...all.map((p) => p.price));
  const pRange = pMax - pMin || 1;
  const tRange = tMax - tMin || 1;

  const x = (t: number) => padX + ((t - tMin) / tRange) * (W - 2 * padX);
  const y = (p: number) => H - padY - ((p - pMin) / pRange) * (H - 2 * padY);

  const tokenPath = token.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");

  // Break the underlying line wherever the gap exceeds ~3h (market closed).
  let ulPath = "";
  for (let i = 0; i < underlying.length; i++) {
    const p = underlying[i];
    const cmd = i === 0 || underlying[i].t - underlying[i - 1].t > 3 * 3_600_000 ? "M" : "L";
    ulPath += `${cmd}${x(p.t).toFixed(1)},${y(p.price).toFixed(1)} `;
  }

  const lastTok = token[token.length - 1].price;
  const lastUl = underlying[underlying.length - 1]?.price;
  const gapPct = lastUl ? ((lastTok - lastUl) / lastUl) * 100 : null;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" preserveAspectRatio="none">
        {underlying.length > 1 && (
          <path d={ulPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.85" strokeDasharray="1 0" />
        )}
        <path d={tokenPath} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-cyan-400" /> token (24/7)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-amber-400" /> underlying (market hours)
          </span>
        </div>
        <div>
          {gapPct !== null && (
            <span className={gapPct >= 0 ? "text-rose-300" : "text-emerald-300"}>
              live gap {gapPct >= 0 ? "+" : ""}{gapPct.toFixed(2)}%
            </span>
          )}
          <span className="ml-2">· {source === "live" ? "live (Bitget + Yahoo)" : "demo"} · ~72h</span>
        </div>
      </div>
    </div>
  );
}
