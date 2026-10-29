"use client";

type BarPoint = { label: string; value: number; hint?: string };
type Slice = { label: string; value: number; color?: string };

const PALETTE = ["#206bc4", "#4299e1", "#2fb344", "#f59f00", "#d63939", "#ae3ec9", "#667382", "#0ca678"];

function maxOf(rows: { value: number }[]) {
  return rows.reduce((max, row) => Math.max(max, row.value), 0) || 1;
}

export function ReportBarChart({
  title,
  meta,
  points,
  formatValue,
}: {
  title: string;
  meta?: string;
  points: BarPoint[];
  formatValue: (value: number) => string;
}) {
  if (points.length === 0) {
    return (
      <div className="queue chart-card">
        <div className="queue-head">
          <h2>{title}</h2>
          {meta ? <span className="meta">{meta}</span> : null}
        </div>
        <p className="queue-empty">Nada neste período.</p>
      </div>
    );
  }

  const peak = maxOf(points);
  const width = Math.max(points.length * 28, 280);
  const height = 160;
  const pad = { top: 12, right: 8, bottom: 36, left: 8 };
  const innerH = height - pad.top - pad.bottom;
  const gap = 6;
  const barW = Math.max(10, (width - pad.left - pad.right) / points.length - gap);

  return (
    <div className="queue chart-card">
      <div className="queue-head">
        <h2>{title}</h2>
        {meta ? <span className="meta">{meta}</span> : null}
      </div>
      <div className="chart-scroll">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={title}
        >
          {[0.25, 0.5, 0.75, 1].map((step) => {
            const y = pad.top + innerH * (1 - step);
            return (
              <line
                key={step}
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                className="chart-grid"
              />
            );
          })}
          {points.map((point, index) => {
            const h = (point.value / peak) * innerH;
            const x = pad.left + index * (barW + gap) + gap / 2;
            const y = pad.top + innerH - h;
            return (
              <g key={`${point.label}-${index}`}>
                <title>{`${point.label}: ${formatValue(point.value)}${point.hint ? ` · ${point.hint}` : ""}`}</title>
                <rect
                  className="chart-bar"
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, 1)}
                  rx={2}
                  style={{ animationDelay: `${Math.min(index, 24) * 18}ms` }}
                />
                <text className="chart-tick" x={x + barW / 2} y={height - 12} textAnchor="middle">
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function ReportDonut({
  title,
  slices,
  formatValue,
  empty,
}: {
  title: string;
  slices: Slice[];
  formatValue: (value: number) => string;
  empty: string;
}) {
  const total = slices.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0 || slices.length === 0) {
    return (
      <div className="queue chart-card">
        <div className="queue-head">
          <h2>{title}</h2>
        </div>
        <p className="queue-empty">{empty}</p>
      </div>
    );
  }

  const size = 148;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="queue chart-card">
      <div className="queue-head">
        <h2>{title}</h2>
      </div>
      <div className="donut-wrap">
        <svg className="donut-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
          <circle cx={size / 2} cy={size / 2} r={r} className="donut-track" strokeWidth={stroke} fill="none" />
          {slices.map((slice, index) => {
            const len = (slice.value / total) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={`${slice.label}-${index}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={slice.color ?? PALETTE[index % PALETTE.length]}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                className="donut-slice"
                style={{ animationDelay: `${index * 40}ms` }}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${slice.label}: ${formatValue(slice.value)}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
          <text x="50%" y="48%" textAnchor="middle" className="donut-center-value">
            {slices.length}
          </text>
          <text x="50%" y="62%" textAnchor="middle" className="donut-center-label">
            itens
          </text>
        </svg>
        <ul className="donut-legend">
          {slices.map((slice, index) => (
            <li key={`${slice.label}-${index}`}>
              <span className="swatch" style={{ background: slice.color ?? PALETTE[index % PALETTE.length] }} />
              <span className="donut-legend-name">{slice.label}</span>
              <strong>{formatValue(slice.value)}</strong>
              <em>{Math.round((slice.value / total) * 1000) / 10}%</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
