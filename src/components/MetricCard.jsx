import React from 'react';

const ACCENT_COLORS = {
  positive: 'var(--status-good)',
  negative: 'var(--status-danger)',
  neutral: 'var(--border-color)',
};

export default function MetricCard({ label, value, unit, change, changeType = 'neutral', accentColor }) {
  const topColor = accentColor || ACCENT_COLORS[changeType] || 'var(--border-color)';

  return (
    <div className="metric-card" style={{
      borderTop: `3px solid ${topColor}`,
      position: 'relative',
    }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className={`metric-change ${changeType}`}>
          {change}
        </div>
      )}
    </div>
  );
}
