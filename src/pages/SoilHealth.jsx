import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { getFields } from '../fieldStore';

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
        <div key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}%
        </div>
      ))}
    </div>
  );
};

export default function SoilHealth() {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [soilProfiles, setSoilProfiles] = useState([]);

  useEffect(() => {
    const loadFields = () => {
      const f = getFields();
      setFields(f);
      if (f.length > 0 && !selectedField) setSelectedField(f[0]);
    };
    loadFields();
    window.addEventListener('ohdeere-fields-changed', loadFields);
    return () => window.removeEventListener('ohdeere-fields-changed', loadFields);
  }, []);

  useEffect(() => {
    if (selectedField) fetchSoilData();
  }, [selectedField]);

  const fetchSoilData = async () => {
    if (!selectedField) return;
    setLoading(true);
    setError(null);
    setSoilProfiles([]);
    try {
      const res = await fetch(`/api/soil/properties?lat=${selectedField.lat}&lon=${selectedField.lon}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server returned ${res.status}`);
      }
      const data = await res.json();
      if (data.profiles && data.profiles.length > 0) {
        const profiles = data.profiles.map((p) => ({
          depth: p.depth.replace('cm', ' cm'),
          clay: p.clay || 0,
          sand: p.sand || 0,
          silt: p.silt || 0,
          ph: p.phh2o || 0,
          organic: p.soc || 0,
          nitrogen: p.nitrogen || 0,
          cec: p.cec || 0,
        }));
        setSoilProfiles(profiles);
      } else {
        throw new Error('No soil profile data returned for this location');
      }
    } catch (e) {
      setError(e.message);
      setSoilProfiles([]);
    }
    setLoading(false);
  };

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
  };

  const topProfile = soilProfiles[0] || {};
  const hasData = soilProfiles.length > 0;

  const healthRadar = hasData ? [
    { property: 'pH Balance', value: Math.min(100, Math.round((topProfile.ph / 7) * 100)), fullMark: 100 },
    { property: 'Organic Carbon', value: Math.min(100, Math.round((topProfile.organic / 5) * 100)), fullMark: 100 },
    { property: 'Nitrogen', value: Math.min(100, Math.round((topProfile.nitrogen / 0.3) * 100)), fullMark: 100 },
    { property: 'CEC', value: Math.min(100, Math.round((topProfile.cec / 25) * 100)), fullMark: 100 },
    { property: 'Clay/Silt Ratio', value: Math.min(100, Math.round(((topProfile.silt || 1) / ((topProfile.clay || 1) + (topProfile.silt || 1))) * 100)), fullMark: 100 },
  ] : [];

  const textureData = soilProfiles.map((p) => ({
    layer: p.depth,
    clay: p.clay,
    sand: p.sand,
    silt: p.silt,
  }));

  const overallScore = healthRadar.length > 0 ? Math.round(healthRadar.reduce((a, h) => a + h.value, 0) / healthRadar.length) : null;
  const noFields = fields.length === 0;

  return (
    <div className="fade-in">
      <p className="page-subtitle">
        Soil property data from ISRIC SoilGrids -- texture, pH, organic carbon, and nitrogen by depth
      </p>

      {noFields ? (
        <div className="data-notice data-notice-error" style={{ marginBottom: 18, textAlign: 'center', padding: 24 }}>
          No fields defined yet. Go to the Field Map page and draw your farm boundaries to get started.
        </div>
      ) : (
        <>
          <div className="location-bar">
            <label>Field:</label>
            <select className="field-select" value={selectedField?.id || ''} onChange={handleFieldSelect}>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.acres} ac)</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {selectedField ? `${selectedField.lat}, ${selectedField.lon}` : ''}
            </span>
            <button className="btn btn-primary" onClick={fetchSoilData} style={{ padding: '5px 12px', fontSize: 11 }}>
              {loading ? 'Loading...' : 'Update'}
            </button>
          </div>

          {error && (
            <div className="data-notice data-notice-error">{error}</div>
          )}

          {hasData && (
            <>
              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard label="Soil pH" value={topProfile.ph?.toString() || '--'} change="Top layer" changeType="neutral" />
                <MetricCard label="Organic Carbon" value={topProfile.organic?.toString() || '--'} unit="%" change="Top layer" changeType="neutral" />
                <MetricCard label="Total Nitrogen" value={topProfile.nitrogen?.toString() || '--'} unit="%" change="Top layer" changeType="neutral" />
                <MetricCard label="CEC" value={topProfile.cec?.toString() || '--'} unit="cmol/kg" change="Nutrient holding capacity" changeType="neutral" />
              </div>

              <div className="grid-2" style={{ marginBottom: 18 }}>
                <HudPanel title="Overall Soil Health Score">
                  <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-primary)' }}>{overallScore}</span>
                    <span style={{ fontSize: 14, color: 'var(--text-dim)', marginLeft: 4 }}>/ 100</span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={healthRadar}>
                      <PolarGrid stroke="#e2e0dc" />
                      <PolarAngleAxis dataKey="property" tick={{ fill: '#6b6b6b', fontSize: 11 }} />
                      <PolarRadiusAxis tick={false} domain={[0, 100]} />
                      <Radar name="Health" dataKey="value" stroke="#3d7a4a" fill="rgba(61,122,74,0.12)" strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </HudPanel>

                <HudPanel title="Soil Texture by Depth">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={textureData} layout="vertical">
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="layer" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="clay" stackId="a" fill="#b5403a" name="Clay" />
                      <Bar dataKey="silt" stackId="a" fill="#4a7a8c" name="Silt" />
                      <Bar dataKey="sand" stackId="a" fill="#c0a030" name="Sand" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                    {[
                      { label: 'Clay', color: '#b5403a' },
                      { label: 'Silt', color: '#4a7a8c' },
                      { label: 'Sand', color: '#c0a030' },
                    ].map((l) => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                </HudPanel>
              </div>

              <HudPanel title="Soil Profile Data">
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
            </>
          )}

          {!hasData && !error && !loading && (
            <div className="data-notice" style={{ textAlign: 'center', padding: 24 }}>
              Select a field and click Update to load soil data from SoilGrids.
            </div>
          )}
        </>
      )}
    </div>
  );
}
