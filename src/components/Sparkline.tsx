// Tiny price sparkline (area + line). Trend-colored: green when the series rises
// over the window, red when it falls. Real recent prices only — never synthetic.
export default function Sparkline({
  points,
  className = "h-12",
}: {
  points: number[];
  className?: string;
}) {
  if (!points || points.length < 2) {
    return <div className={className} />;
  }
  const W = 320;
  const H = 48;
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const up = points[points.length - 1] >= points[0];
  const stroke = up ? "#1F8A5B" : "#C8453B";
  const fill = up ? "rgba(31,138,91,0.07)" : "rgba(200,69,59,0.07)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} preserveAspectRatio="none">
      <path d={area} fill={fill} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
