import React, { useState } from 'react';
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';

const soilProfiles = [
  { depth: '0-5 cm', clay: 22, sand: 38, silt: 40, ph: 6.5, organic: 3.2, nitrogen: 0.18, cec: 18.4 },
  { depth: '5-15 cm', clay: 24, sand: 36, silt: 40, ph: 6.3, organic: 2.8, nitrogen: 0.15, cec: 17.1 },
  { depth: '15-30 cm', clay: 28, sand: 34, silt: 38, ph: 6.1, organic: 1.9, nitrogen: 0.11, cec: 15.8 },
  { depth: '30-60 cm', clay: 32, sand: 30, silt: 38, ph: 6.0, organic: 1.2, nitrogen: 0.08, cec: 14.2 },
  { depth: '60-100 cm', clay: 35, sand: 28, silt: 37, ph: 5.9, organic: 0.6, nitrogen: 0.04, cec: 12.6 },
];

const healthRadar = [
  { property: 'pH Balance', value: 82, fullMark: 100 },
  { property: 'Organic Carbon', value: 75, fullMark: 100 },
  { property: 'Nitrogen', value: 68, fullMark: 100 },
  { property: 'Moisture', value: 58, fullMark: 100 },
  { property: 'CEC', value: 72, fullMark: 100 },
  { property: 'Texture', value: 85, fullMark: 100 },
];

const textureData = [
  { layer: '0-5cm', clay: 22, sand: 38, silt: 40 },
  { layer: '5-15cm', clay: 24, sand: 36, silt: 40 },
  { layer: '15-30cm', clay: 28, sand: 34, silt: 38 },
  { layer: '30-60cm', clay: 32, sand: 30, silt: 38 },
  { layer: '60-100cm', clay: 35, sand: 28, silt: 37 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(10,20,40,0.95)', border: '1px solid rgba(0,212,255,0.3)',
      borderRadius: 4, padding: '8px 12px', fontSize: 11,
      fontFamily: 'var(--font-body)', color: '#e0eaff',
    }}>
      <div style={{ color: 'rgba(0,212,255,0.7)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}%
        </div>
      ))}
    </div>
  );
};

export default function SoilHealth() {
  const [selectedField, setSelectedField] = useState('Field A-1');

  return (
    <div className="fade-in">
      <div className="page-title">
        <span className="title-icon">◈</span> Soil Health Analysis
      </div>
      <p className="page-subtitle">
        Soil property data from ISRIC SoilGrids — texture, pH, organic carbon, and nitrogen by depth
      </p>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Analyzing:</span>
        {['Field A-1', 'Field A-2', 'Field B-1', 'Field C-1'].map((f) => (
          <button
            key={f}
            className={selectedField === f ? 'btn btn-primary' : 'btn'}
            onClick={() => setSelectedField(f)}
            style={{ padding: '5px 12px', fontSize: 10 }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Metrics */}
      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Soil pH" value="6.5" icon="◈" change="Slightly acidic — optimal" changeType="positive" />
        <MetricCard label="Organic Carbon" value="3.2" unit="%" icon="◉" change="Above average" changeType="positive" />
        <MetricCard label="Total Nitrogen" value="0.18" unit="%" icon="▲" change="Adequate for corn" changeType="positive" />
        <MetricCard label="CEC" value="18.4" unit="cmol/kg" icon="◇" change="Good nutrient holding" changeType="positive" />
        <MetricCard label="Texture Class" value="Loam" icon="▦" />
        <MetricCard label="Bulk Density" value="1.35" unit="g/cm³" icon="◎" change="Normal range" changeType="neutral" />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* Soil Health Radar */}
        <HudPanel title="Overall Soil Health Score" icon="◈">
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--status-good)' }}>78</span>
            <span style={{ fontSize: 14, color: 'var(--text-dim)', marginLeft: 4 }}>/ 100</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={healthRadar}>
              <PolarGrid stroke="rgba(0,212,255,0.1)" />
              <PolarAngleAxis dataKey="property" tick={{ fill: 'rgba(180,200,230,0.6)', fontSize: 10 }} />
              <PolarRadiusAxis tick={false} domain={[0, 100]} />
              <Radar name="Health" dataKey="value" stroke="#00d4ff" fill="rgba(0,212,255,0.15)" strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </HudPanel>

        {/* Soil Texture by Depth */}
        <HudPanel title="Soil Texture by Depth" icon="▦">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={textureData} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="layer" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="clay" stackId="a" fill="rgba(255,51,85,0.5)" name="Clay" />
              <Bar dataKey="silt" stackId="a" fill="rgba(0,212,255,0.4)" name="Silt" />
              <Bar dataKey="sand" stackId="a" fill="rgba(255,170,0,0.4)" name="Sand" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            {[
              { label: 'Clay', color: 'rgba(255,51,85,0.5)' },
              { label: 'Silt', color: 'rgba(0,212,255,0.4)' },
              { label: 'Sand', color: 'rgba(255,170,0,0.4)' },
            ].map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-dim)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </HudPanel>
      </div>

      {/* Full Profile Table */}
      <HudPanel title="Soil Profile Data" icon="◇">
        <table className="data-table">
          <thead>
            <tr>
              <th>Depth</th>
              <th>Clay %</th>
              <th>Sand %</th>
              <th>Silt %</th>
              <th>pH</th>
              <th>Organic C %</th>
              <th>Nitrogen %</th>
              <th>CEC (cmol/kg)</th>
            </tr>
          </thead>
          <tbody>
            {soilProfiles.map((row) => (
              <tr key={row.depth}>
                <td style={{ fontWeight: 500, color: 'var(--accent-primary)' }}>{row.depth}</td>
                <td>{row.clay}</td>
                <td>{row.sand}</td>
                <td>{row.silt}</td>
                <td>{row.ph}</td>
                <td>{row.organic}</td>
                <td>{row.nitrogen}</td>
                <td>{row.cec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HudPanel>
    </div>
  );
}
