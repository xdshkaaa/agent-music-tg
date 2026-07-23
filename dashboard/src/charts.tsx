// Minimal dependency-free SVG charts — this dashboard's data volume (30-90
// daily points, 6-step funnels) doesn't warrant a charting library; hand
// rolled marks keep the bundle tiny and every color decision explicit
// (amber reserved for the single "current/primary" series — secondary
// series use neutral greys, never a second hue).

const ROSE = "#ffb020";
const NEUTRAL = "rgba(240,237,230,0.32)";
const GRID = "rgba(255,255,255,0.06)";

export function LineChart({
  points,
  width = 640,
  height = 160,
  color = ROSE,
  formatValue,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const pad = 8;
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"} ${pad + i * stepX} ${toY(v)}`).join(" ");
  const areaPath = `${path} L ${pad + (points.length - 1) * stepX} ${height - pad} L ${pad} ${height - pad} Z`;
  const last = points[points.length - 1] ?? 0;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="line chart">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke={GRID} strokeWidth={1} />
        ))}
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#lineFill)" stroke="none" />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.length > 0 && (
          <circle cx={pad + (points.length - 1) * stepX} cy={toY(last)} r={3.5} fill={color} />
        )}
      </svg>
      {formatValue && <div className="chart-legend">Сейчас: {formatValue(last)}</div>}
    </div>
  );
}

export function DualLineChart({
  a,
  b,
  labelA,
  labelB,
  width = 640,
  height = 160,
}: {
  a: number[];
  b: number[];
  labelA: string;
  labelB: string;
  width?: number;
  height?: number;
}) {
  const pad = 8;
  const max = Math.max(1, ...a, ...b);
  const stepX = a.length > 1 ? (width - pad * 2) / (a.length - 1) : 0;
  const toY = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const pathFor = (series: number[]) => series.map((v, i) => `${i === 0 ? "M" : "L"} ${pad + i * stepX} ${toY(v)}`).join(" ");

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="dual line chart">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke={GRID} strokeWidth={1} />
        ))}
        <path d={pathFor(b)} fill="none" stroke={NEUTRAL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={pathFor(a)} fill="none" stroke={ROSE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="chart-legend">
        <span><span className="swatch" style={{ background: ROSE }} />{labelA}</span>
        <span><span className="swatch" style={{ background: NEUTRAL }} />{labelB}</span>
      </div>
    </div>
  );
}

export function BarSpark({ points, width = 200, height = 48 }: { points: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...points);
  const barW = width / points.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ display: "block", width: "100%", height }}>
      {points.map((v, i) => {
        const h = (v / max) * (height - 2);
        return (
          <rect
            key={i}
            x={i * barW + 1}
            y={height - h}
            width={Math.max(1, barW - 2)}
            height={h}
            rx={1.5}
            fill={i === points.length - 1 ? ROSE : NEUTRAL}
          />
        );
      })}
    </svg>
  );
}
