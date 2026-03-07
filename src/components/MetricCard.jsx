import React from 'react';

export default function MetricCard({ label, value, unit, change, changeType = 'neutral', icon }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}</div>
      <div className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className={`metric-change ${changeType}`}>
          {changeType === 'positive' ? '▲' : changeType === 'negative' ? '▼' : '―'} {change}
        </div>
      )}
    </div>
  );
}
