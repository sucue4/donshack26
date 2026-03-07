import React from 'react';

export default function MetricCard({ label, value, unit, change, changeType = 'neutral' }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className={`metric-change ${changeType}`}>
          {changeType === 'positive' ? '+' : changeType === 'negative' ? '-' : ''} {change}
        </div>
      )}
    </div>
  );
}
