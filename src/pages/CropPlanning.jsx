import React, { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';

const gddData = [
  { week: 'W1', gdd: 120 }, { week: 'W2', gdd: 135 },
  { week: 'W3', gdd: 148 }, { week: 'W4', gdd: 162 },
  { week: 'W5', gdd: 155 }, { week: 'W6', gdd: 170 },
  { week: 'W7', gdd: 180 }, { week: 'W8', gdd: 168 },
  { week: 'W9', gdd: 172 }, { week: 'W10', gdd: 158 },
];

const yieldProjection = [
  { year: '2021', corn: 182, soy: 54, wheat: 62 },
  { year: '2022', corn: 175, soy: 51, wheat: 58 },
  { year: '2023', corn: 190, soy: 56, wheat: 65 },
  { year: '2024', corn: 186, soy: 53, wheat: 60 },
  { year: '2025', corn: 195, soy: 58, wheat: 67 },
  { year: '2026 (est)', corn: 200, soy: 60, wheat: 68 },
];

const rotationPlan = [
  { field: 'A-1', y2024: 'Corn', y2025: 'Soybean', y2026: 'Corn', y2027: 'Wheat/Cover' },
  { field: 'A-2', y2024: 'Soybean', y2025: 'Corn', y2026: 'Soybean', y2027: 'Corn' },
  { field: 'B-1', y2024: 'Wheat', y2025: 'Corn', y2026: 'Corn', y2027: 'Soybean' },
  { field: 'C-1', y2024: 'Cover Crop', y2025: 'Wheat', y2026: 'Corn', y2027: 'Soybean' },
  { field: 'D-1', y2024: 'Corn', y2025: 'Cover Crop', y2026: 'Soybean', y2027: 'Corn' },
];

const cropDatabase = [
  { crop: 'Corn (Grain)', gddMaturity: '2,700', plantDate: 'Apr 15 – May 10', harvestDate: 'Sep 25 – Oct 30', soilTemp: '50°F min', notes: 'Primary cash crop' },
  { crop: 'Soybean', gddMaturity: '2,400', plantDate: 'May 5 – May 25', harvestDate: 'Sep 20 – Oct 15', soilTemp: '55°F min', notes: 'Nitrogen fixing' },
  { crop: 'Winter Wheat', gddMaturity: '2,000', plantDate: 'Sep 20 – Oct 15', harvestDate: 'Jun 20 – Jul 10', soilTemp: '40°F min', notes: 'Cover + grain' },
  { crop: 'Cereal Rye', gddMaturity: '1,800', plantDate: 'Sep 1 – Oct 30', harvestDate: 'May (terminate)', soilTemp: '34°F min', notes: 'Cover crop' },
  { crop: 'Crimson Clover', gddMaturity: '1,200', plantDate: 'Aug 15 – Sep 30', harvestDate: 'Apr (terminate)', soilTemp: '40°F min', notes: 'N-fixer cover' },
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

const cropColor = (crop) => {
  const map = { Corn: '#3d7a4a', Soybean: '#7ab87f', Wheat: '#c0a030', 'Cover Crop': '#8a6a3a', 'Wheat/Cover': '#c0a030' };
  return map[crop] || map[Object.keys(map).find(k => crop.includes(k))] || 'var(--text-dim)';
};

export default function CropPlanning() {
  return (
    <div className="fade-in">
      <p className="page-subtitle">
        Growing degree day tracking, yield projections, and multi-year rotation management
      </p>

      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Season GDD" value="1,847" unit="°F·days" change="On track for corn maturity" changeType="positive" />
        <MetricCard label="Days to Maturity" value="42" unit="days" change="Est. harvest Oct 12" changeType="neutral" />
        <MetricCard label="Corn Yield Est." value="200" unit="bu/ac" change="+5.3% vs 5yr avg" changeType="positive" />
        <MetricCard label="Soybean Yield Est." value="60" unit="bu/ac" change="+7.1% vs 5yr avg" changeType="positive" />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <HudPanel title="Weekly GDD Accumulation">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={gddData}>
              <XAxis dataKey="week" tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="gdd" fill="rgba(61,122,74,0.5)" radius={[3, 3, 0, 0]} name="GDD (°F·days)" />
            </BarChart>
          </ResponsiveContainer>
        </HudPanel>

        <HudPanel title="Yield Projections (bu/ac)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={yieldProjection}>
              <XAxis dataKey="year" tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="corn" stroke="#3d7a4a" strokeWidth={2} dot={{ r: 3 }} name="Corn" />
              <Line type="monotone" dataKey="soy" stroke="#7ab87f" strokeWidth={2} dot={{ r: 3 }} name="Soybean" />
              <Line type="monotone" dataKey="wheat" stroke="#c0a030" strokeWidth={2} dot={{ r: 3 }} name="Wheat" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            {[{ l: 'Corn', c: '#3d7a4a' }, { l: 'Soybean', c: '#7ab87f' }, { l: 'Wheat', c: '#c0a030' }].map((x) => (
              <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-dim)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: x.c }} /> {x.l}
              </div>
            ))}
          </div>
        </HudPanel>
      </div>

      {/* Rotation Plan */}
      <HudPanel title="Multi-Year Rotation Plan" className="mb-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>2024</th>
              <th>2025</th>
              <th>2026</th>
              <th>2027</th>
            </tr>
          </thead>
          <tbody>
            {rotationPlan.map((row) => (
              <tr key={row.field}>
                <td style={{ fontWeight: 600 }}>{row.field}</td>
                {[row.y2024, row.y2025, row.y2026, row.y2027].map((crop, i) => (
                  <td key={i}>
                    <span style={{ color: cropColor(crop), fontWeight: 500 }}>{crop}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </HudPanel>

      {/* Crop Reference */}
      <HudPanel title="Crop Reference Database">
        <table className="data-table">
          <thead>
            <tr>
              <th>Crop</th>
              <th>GDD to Maturity</th>
              <th>Plant Window</th>
              <th>Harvest Window</th>
              <th>Min Soil Temp</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {cropDatabase.map((row) => (
              <tr key={row.crop}>
                <td style={{ fontWeight: 500, color: 'var(--accent-primary)' }}>{row.crop}</td>
                <td>{row.gddMaturity}</td>
                <td>{row.plantDate}</td>
                <td>{row.harvestDate}</td>
                <td>{row.soilTemp}</td>
                <td style={{ color: 'var(--text-dim)' }}>{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HudPanel>
    </div>
  );
}
