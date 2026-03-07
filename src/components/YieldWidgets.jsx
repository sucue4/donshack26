import React from 'react';

const GRADE_COLORS = {
  A: 'var(--health-excellent)',
  B: 'var(--health-good)',
  C: 'var(--health-moderate)',
  D: 'var(--health-stressed)',
  F: 'var(--health-critical)',
};

const RISK_COLORS = {
  low: 'var(--status-good)',
  moderate: 'var(--status-warning)',
  high: 'var(--health-stressed)',
  critical: 'var(--status-danger)',
};

export function GradeBadge({ grade, size = 'large' }) {
  const isLarge = size === 'large';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: isLarge ? 56 : 36, height: isLarge ? 56 : 36,
      borderRadius: isLarge ? 12 : 8,
      background: GRADE_COLORS[grade] || '#6b6b6b',
      color: '#fff',
      fontSize: isLarge ? 28 : 18,
      fontWeight: 700,
      fontFamily: 'var(--font-display)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}>
      {grade}
    </div>
  );
}

export function RiskBadge({ level }) {
  return (
    <span className="badge" style={{
      background: RISK_COLORS[level] || 'var(--text-dim)',
      color: '#fff',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}>
      {level}
    </span>
  );
}

export function ScoreBar({ score, label }) {
  const color = score >= 80 ? 'var(--health-excellent)' :
    score >= 60 ? 'var(--health-good)' :
    score >= 40 ? 'var(--health-moderate)' :
    score >= 20 ? 'var(--health-stressed)' :
    'var(--health-critical)';

  return (
    <div style={{ marginBottom: 6 }}>
      {label && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          flex: 1, height: 8, background: 'var(--bg-input)',
          borderRadius: 4, overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.max(0, Math.min(100, score))}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.5s ease',
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>
          {score}
        </span>
      </div>
    </div>
  );
}

export function RecommendationList({ items, maxItems = 5 }) {
  if (!items || items.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
      {items.slice(0, maxItems).map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function DataTable({ headers, rows }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {headers.map((h, i) => <th key={i}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => <td key={j}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CategoryCard({ title, grade, riskLevel, summary, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'var(--text-primary)',
        width: '100%',
        transition: 'all 0.15s ease',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent-primary)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-color)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <GradeBadge grade={grade} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
          <RiskBadge level={riskLevel} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {summary}
        </div>
      </div>
    </button>
  );
}
