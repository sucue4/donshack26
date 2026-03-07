import React, { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';

const pestTrend = [
  { week: 'W1', pressure: 12 }, { week: 'W2', pressure: 15 },
  { week: 'W3', pressure: 22 }, { week: 'W4', pressure: 35 },
  { week: 'W5', pressure: 42 }, { week: 'W6', pressure: 38 },
  { week: 'W7', pressure: 28 }, { week: 'W8', pressure: 20 },
];

const diseaseRisk = [
  { disease: 'Gray Leaf Spot', risk: 65 },
  { disease: 'Northern Leaf Blight', risk: 42 },
  { disease: 'Tar Spot', risk: 28 },
  { disease: 'Sudden Death Syndrome', risk: 18 },
  { disease: 'White Mold', risk: 55 },
];

const scoutingLog = [
  { date: 'Mar 5', field: 'A-1', finding: 'Japanese beetle adults -- 2 per plant avg', severity: 'Moderate', action: 'Monitor -- below threshold' },
  { date: 'Mar 3', field: 'B-1', finding: 'Gray leaf spot lesions on lower canopy', severity: 'Low', action: 'Fungicide application scheduled' },
  { date: 'Mar 1', field: 'A-2', finding: 'Soybean aphids -- 85 per plant', severity: 'High', action: 'Reached 250 threshold -- treat' },
  { date: 'Feb 28', field: 'C-1', finding: 'No significant pest activity', severity: 'None', action: 'Continue monitoring' },
  { date: 'Feb 25', field: 'D-1', finding: 'Armyworm moth trap count elevated', severity: 'Low', action: 'Scout larvae in 5 days' },
];

const ipmProtocol = [
  { pest: 'Corn Rootworm', threshold: '1 beetle/plant', method: 'Rotation + Bt hybrids', timing: 'July scout, Aug treat if needed', cost: '$12/ac' },
  { pest: 'Soybean Aphid', threshold: '250/plant + growing', method: 'Insecticide (lambda-cyhalothrin)', timing: 'R1-R5 growth stages', cost: '$8-15/ac' },
  { pest: 'Japanese Beetle', threshold: '3+ beetles/ear', method: 'Insecticide if silking', timing: 'During silking only', cost: '$10/ac' },
  { pest: 'Gray Leaf Spot', threshold: '50% lower leaves', method: 'Fungicide (triazole)', timing: 'VT-R2 application', cost: '$18-25/ac' },
  { pest: 'Tar Spot', threshold: 'First lesions + humid', method: 'Fungicide (triazole + strobilurin)', timing: 'VT-R3 window', cost: '$20-30/ac' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e0dc',
      borderRadius: 4, padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-body)', color: '#2c2c2c',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{ color: '#2c2c2c', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

const riskColor = (val) => val >= 60 ? 'var(--status-danger)' : val >= 35 ? 'var(--status-warning)' : 'var(--status-good)';

export default function PestControl() {
  return (
    <div className="fade-in">
      <div className="page-title">Pest & Disease Control</div>
      <p className="page-subtitle">
        Integrated pest management -- scouting logs, disease risk modeling, and treatment thresholds
      </p>

      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Overall Pest Pressure" value="Medium" change="Declining trend" changeType="positive" />
        <MetricCard label="Disease Risk" value="Moderate" change="Gray leaf spot elevated" changeType="negative" />
        <MetricCard label="Last Scouted" value="2" unit="days ago" change="Field A-1" changeType="neutral" />
        <MetricCard label="Treatments Applied" value="1" change="Soybean aphid -- A-2" changeType="neutral" />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <HudPanel title="Pest Pressure Index (Weekly)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={pestTrend}>
              <XAxis dataKey="week" tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 60]} tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="pressure" stroke="#c0a030" strokeWidth={2} dot={{ r: 3, fill: '#c0a030' }} name="Pressure Index" />
            </LineChart>
          </ResponsiveContainer>
        </HudPanel>

        <HudPanel title="Disease Risk Assessment">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {diseaseRisk.map((d) => (
              <div key={d.disease}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.disease}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: riskColor(d.risk) }}>{d.risk}%</span>
                </div>
                <div style={{
                  height: 4, background: 'rgba(61,122,74,0.1)', borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${d.risk}%`, borderRadius: 2,
                    background: `linear-gradient(90deg, ${riskColor(d.risk)}, ${riskColor(d.risk)}88)`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </HudPanel>
      </div>

      <HudPanel title="Scouting Log" className="mb-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Field</th>
              <th>Finding</th>
              <th>Severity</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {scoutingLog.map((row, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'nowrap' }}>{row.date}</td>
                <td style={{ fontWeight: 500 }}>{row.field}</td>
                <td>{row.finding}</td>
                <td>
                  <span className={`badge ${row.severity === 'High' ? 'badge-danger' : row.severity === 'Moderate' ? 'badge-warning' : row.severity === 'Low' ? 'badge-info' : 'badge-good'}`}>
                    {row.severity}
                  </span>
                </td>
                <td style={{ color: 'var(--text-dim)' }}>{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HudPanel>

      <HudPanel title="IPM Treatment Protocols">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pest/Disease</th>
              <th>Economic Threshold</th>
              <th>Treatment Method</th>
              <th>Application Timing</th>
              <th>Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {ipmProtocol.map((row) => (
              <tr key={row.pest}>
                <td style={{ fontWeight: 500, color: 'var(--accent-primary)' }}>{row.pest}</td>
                <td>{row.threshold}</td>
                <td>{row.method}</td>
                <td>{row.timing}</td>
                <td>{row.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HudPanel>
    </div>
  );
}
