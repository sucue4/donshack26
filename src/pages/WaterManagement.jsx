import React from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';

const moistureTrend = [
  { date: 'Mar 1', field: 34, optimal: 35 }, { date: 'Mar 3', field: 32, optimal: 35 },
  { date: 'Mar 5', field: 28, optimal: 35 }, { date: 'Mar 7', field: 25, optimal: 35 },
  { date: 'Mar 9', field: 30, optimal: 35 }, { date: 'Mar 11', field: 33, optimal: 35 },
  { date: 'Mar 13', field: 29, optimal: 35 }, { date: 'Mar 15', field: 26, optimal: 35 },
];

const precipHistory = [
  { month: 'Oct', actual: 68, normal: 75 }, { month: 'Nov', actual: 52, normal: 65 },
  { month: 'Dec', actual: 45, normal: 55 }, { month: 'Jan', actual: 38, normal: 50 },
  { month: 'Feb', actual: 42, normal: 48 }, { month: 'Mar', actual: 22, normal: 60 },
];

const etData = [
  { day: 'Mon', et0: 4.2, rain: 0 }, { day: 'Tue', et0: 4.5, rain: 2.1 },
  { day: 'Wed', et0: 3.8, rain: 8.2 }, { day: 'Thu', et0: 3.2, rain: 12.0 },
  { day: 'Fri', et0: 3.9, rain: 4.5 }, { day: 'Sat', et0: 4.7, rain: 0 },
  { day: 'Sun', et0: 5.1, rain: 0 },
];

const irrigationSchedule = [
  { field: 'Field A-1', crop: 'Corn', moisture: 25, threshold: 30, status: 'Needs Water', priority: 'High' },
  { field: 'Field A-2', crop: 'Soybean', moisture: 33, threshold: 28, status: 'Adequate', priority: 'Low' },
  { field: 'Field B-1', crop: 'Corn', moisture: 28, threshold: 30, status: 'Monitor', priority: 'Medium' },
  { field: 'Field C-1', crop: 'Wheat', moisture: 31, threshold: 25, status: 'Adequate', priority: 'Low' },
  { field: 'Field D-1', crop: 'Cover Crop', moisture: 36, threshold: 22, status: 'Adequate', priority: 'Low' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e0dc',
      borderRadius: 6, padding: '8px 12px', fontSize: 12,
      fontFamily: 'var(--font-body)', color: '#2c2c2c',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{ color: '#6b6b6b', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function WaterManagement() {
  return (
    <div className="fade-in">
      <p className="page-subtitle">
        Soil moisture, precipitation tracking, and evapotranspiration analysis
      </p>

      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Avg Soil Moisture" value="28" unit="%" change="-6% below optimal" changeType="negative" />
        <MetricCard label="Rainfall (7d)" value="26.8" unit="mm" change="Below normal" changeType="negative" />
        <MetricCard label="ET0 Today" value="4.7" unit="mm" change="High evapotranspiration" changeType="negative" />
        <MetricCard label="Water Balance" value="-18" unit="mm" change="Deficit this month" changeType="negative" />
        <MetricCard label="Fields Need Water" value="1" change="Field A-1 priority" changeType="negative" />
        <MetricCard label="Next Rain" value="Thu" change="~12mm expected" changeType="positive" />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <HudPanel title="Soil Moisture Trend">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={moistureTrend}>
              <defs>
                <linearGradient id="moistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4a7a8c" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#4a7a8c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[15, 45]} tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="field" stroke="#4a7a8c" strokeWidth={2} fill="url(#moistGrad)" name="Field Avg %" />
              <Line type="monotone" dataKey="optimal" stroke="rgba(61,122,74,0.4)" strokeDasharray="5 5" strokeWidth={1} dot={false} name="Optimal %" />
            </AreaChart>
          </ResponsiveContainer>
        </HudPanel>

        <HudPanel title="Evapotranspiration vs Rainfall">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={etData}>
              <XAxis dataKey="day" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="et0" fill="#c0a030" radius={[4, 4, 0, 0]} name="ET0 mm" />
              <Bar dataKey="rain" fill="#4a7a8c" radius={[4, 4, 0, 0]} name="Rain mm" />
            </BarChart>
          </ResponsiveContainer>
        </HudPanel>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <HudPanel title="Precipitation History (Monthly)">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={precipHistory}>
              <XAxis dataKey="month" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="actual" fill="#4a7a8c" radius={[4, 4, 0, 0]} name="Actual mm" />
              <Bar dataKey="normal" fill="rgba(74,122,140,0.25)" radius={[4, 4, 0, 0]} name="Normal mm" />
            </BarChart>
          </ResponsiveContainer>
        </HudPanel>

        <HudPanel title="Irrigation Priority Queue">
          <table className="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Moisture</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {irrigationSchedule.map((row) => (
                <tr key={row.field}>
                  <td style={{ fontWeight: 500 }}>{row.field}</td>
                  <td>{row.moisture}%</td>
                  <td>{row.threshold}%</td>
                  <td>
                    <span className={`badge ${row.status === 'Needs Water' ? 'badge-danger' : row.status === 'Monitor' ? 'badge-warning' : 'badge-good'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: row.priority === 'High' ? 'var(--status-danger)' : row.priority === 'Medium' ? 'var(--status-warning)' : 'var(--text-dim)', fontWeight: 600, fontSize: 11 }}>
                      {row.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HudPanel>
      </div>
    </div>
  );
}
