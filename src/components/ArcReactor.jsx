import React from 'react';

export default function ArcReactor({ size = 120, className = '' }) {
  const r1 = size * 0.42;
  const r2 = size * 0.32;
  const r3 = size * 0.22;
  const r4 = size * 0.12;
  const cx = size / 2;
  const cy = size / 2;
  const segCount = 12;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.4))' }}
    >
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke="rgba(0,212,255,0.4)" strokeWidth="0.5"
        strokeDasharray="4 8" style={{ animation: 'rotate-slow 20s linear infinite', transformOrigin: 'center' }} />

      {/* Middle ring */}
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke="rgba(0,212,255,0.3)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke="rgba(0,212,255,0.5)" strokeWidth="1"
        strokeDasharray="8 12" style={{ animation: 'rotate-reverse 15s linear infinite', transformOrigin: 'center' }} />

      {/* Inner ring */}
      <circle cx={cx} cy={cy} r={r3} fill="none" stroke="rgba(0,212,255,0.4)" strokeWidth="1" />

      {/* Core glow */}
      <circle cx={cx} cy={cy} r={r4} fill="rgba(0,212,255,0.1)" stroke="rgba(0,212,255,0.6)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r4 * 0.5} fill="rgba(0,212,255,0.3)" />

      {/* Tick marks */}
      {Array.from({ length: segCount }).map((_, i) => {
        const angle = (i / segCount) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + Math.cos(angle) * (r1 - 3);
        const y1 = cy + Math.sin(angle) * (r1 - 3);
        const x2 = cx + Math.cos(angle) * (r1 + 3);
        const y2 = cy + Math.sin(angle) * (r1 + 3);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(0,212,255,0.5)" strokeWidth="1" />
        );
      })}
    </svg>
  );
}
