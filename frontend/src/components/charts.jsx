import { useState } from 'react';

const PALETTE = ['#16324f', '#3a6ea8', '#6f9bc9', '#a5c3e0', '#cf9522', '#2e8b62'];

function niceMax(v) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function fmtShort(n) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n * 100) / 100}`;
}

/* ---------- Area / line chart ---------- */

export function AreaChart({ data, height = 220, color = '#16324f', formatValue = fmtShort, xLabel }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  if (!data || data.length === 0) {
    return <div className="empty-state" style={{ padding: 30 }}><p>No data to plot</p></div>;
  }
  const maxV = niceMax(Math.max(...data.map((d) => d.value), 0));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const px = (i) => padL + i * stepX;
  const py = (v) => padT + innerH - (v / maxV) * innerH;

  const linePts = data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${linePts} ${padL + (data.length - 1) * stepX},${padT + innerH}`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => {
          const y = padT + innerH * g;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e8edf4" strokeWidth="1" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill="#71809a">
                {formatValue(maxV * (1 - g))}
              </text>
            </g>
          );
        })}
        <polygon points={areaPts} fill="url(#areaGrad)" />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i}>
            {(i % labelEvery === 0 || i === data.length - 1) && (
              <text x={px(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#71809a">
                {xLabel ? xLabel(d) : d.label}
              </text>
            )}
            <circle cx={px(i)} cy={py(d.value)} r={hover === i ? 4.5 : 0} fill={color} />
            <rect
              x={px(i) - stepX / 2}
              y={padT}
              width={Math.max(stepX, 8)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `calc(${((px(hover)) / W) * 100}% - 40px)`,
            top: py(data[hover].value) - 52,
            position: 'absolute',
          }}
        >
          <b>{data[hover].label}</b>
          <br />
          {data[hover].tooltip ?? formatValue(data[hover].value)}
        </div>
      )}
    </div>
  );
}

/* ---------- Vertical bars ---------- */

export function BarChart({ data, height = 230, color = PALETTE[1], formatValue = fmtShort }) {
  const W = 640;
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 16;
  const padB = 42;
  if (!data || data.length === 0) {
    return <div className="empty-state" style={{ padding: 30 }}><p>No data to plot</p></div>;
  }
  const maxV = niceMax(Math.max(...data.map((d) => d.value), 0));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / data.length;
  const barW = Math.min(slot * 0.55, 64);
  const gridLines = [0, 0.5, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {gridLines.map((g, i) => {
        const y = padT + innerH * g;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e8edf4" strokeWidth="1" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill="#71809a">
              {formatValue(maxV * (1 - g))}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const bh = (d.value / maxV) * innerH;
        const x = padL + slot * i + (slot - barW) / 2;
        const y = padT + innerH - bh;
        return (
          <g key={i}>
            <rect x={x} y={bh > 0 ? y : padT + innerH - 2} width={barW} height={Math.max(bh, 2)} rx="2" fill={color}>
              <title>{`${d.label}: ${d.tooltip ?? formatValue(d.value)}`}</title>
            </rect>
            <text x={x + barW / 2} y={H - 22} textAnchor="middle" fontSize="10" fill="#45566b">
              {d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label}
            </text>
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#71809a">
              {d.subLabel ?? ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Donut ---------- */

export function DonutChart({ data, size = 190, thickness = 26, centerLabel, centerValue, formatValue = fmtShort }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data || data.length === 0 || total === 0) {
    return <div className="empty-state" style={{ padding: 30 }}><p>No data to plot</p></div>;
  }
  const R = size / 2;
  const r = R - thickness / 2;
  let acc = -90;

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const frac = d.value / total;
          const large = frac > 0.5 ? 1 : 0;
          const a0 = (acc * Math.PI) / 180;
          acc += frac * 360;
          const a1 = (acc * Math.PI) / 180;
          const x0 = R + r * Math.cos(a0);
          const y0 = R + r * Math.sin(a0);
          const x1 = R + r * Math.cos(a1);
          const y1 = R + r * Math.sin(a1);
          return (
            <path
              key={i}
              d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={thickness}
              fill="none"
            >
              <title>{`${d.label}: ${d.tooltip ?? formatValue(d.value)} (${(frac * 100).toFixed(1)}%)`}</title>
            </path>
          );
        })}
        {centerValue && (
          <>
            <text x={R} y={R - 4} textAnchor="middle" fontSize="19" fontWeight="700" fill="#1a2733">
              {centerValue}
            </text>
            <text x={R} y={R + 15} textAnchor="middle" fontSize="10.5" fill="#71809a">
              {centerLabel}
            </text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d, i) => (
          <div key={i} className="chart-legend" style={{ gap: 8 }}>
            <span>
              <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              <b>{d.label}</b>
            </span>
            <span style={{ color: 'var(--muted)' }}>
              {d.tooltip ?? formatValue(d.value)} · {total ? ((d.value / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Sparkline for stat cards ---------- */

export function Sparkline({ values, width = 110, height = 34, color = '#16324f' }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 3 - ((v - min) / range) * (height - 6)}`)
    .join(' ');
  return (
    <svg width={width} height={height} style={{ position: 'absolute', right: 14, top: 14, opacity: 0.85 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

export { PALETTE };
