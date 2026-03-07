import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { getFields } from '../fieldStore';

const cropDatabase = [
  { crop: 'Corn (Grain)', gddMaturity: '2,700', plantDate: 'Apr 15 - May 10', harvestDate: 'Sep 25 - Oct 30', soilTemp: '50 F min', notes: 'Primary cash crop' },
  { crop: 'Soybean', gddMaturity: '2,400', plantDate: 'May 5 - May 25', harvestDate: 'Sep 20 - Oct 15', soilTemp: '55 F min', notes: 'Nitrogen fixing' },
  { crop: 'Winter Wheat', gddMaturity: '2,000', plantDate: 'Sep 20 - Oct 15', harvestDate: 'Jun 20 - Jul 10', soilTemp: '40 F min', notes: 'Cover + grain' },
  { crop: 'Cereal Rye', gddMaturity: '1,800', plantDate: 'Sep 1 - Oct 30', harvestDate: 'May (terminate)', soilTemp: '34 F min', notes: 'Cover crop' },
  { crop: 'Crimson Clover', gddMaturity: '1,200', plantDate: 'Aug 15 - Sep 30', harvestDate: 'Apr (terminate)', soilTemp: '40 F min', notes: 'N-fixer cover' },
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

export default function CropPlanning() {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gddData, setGddData] = useState(null);

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
    if (selectedField) fetchGDD();
  }, [selectedField]);

  const fetchGDD = async () => {
    if (!selectedField) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather/gdd?lat=${selectedField.lat}&lon=${selectedField.lon}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setGddData(data);
    } catch (e) {
      setError(e.message);
      setGddData(null);
    }
    setLoading(false);
  };

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
  };

  const noFields = fields.length === 0;
  const weeklyGdd = gddData?.weekly_gdd || [];
  const totalGdd = gddData?.total_gdd || 0;

  // Estimate days to maturity for corn (2700 GDD)
  const cornTarget = 2700;
  const avgDailyGdd = gddData?.daily_gdd?.length > 0
    ? totalGdd / gddData.daily_gdd.length
    : 0;
  const remainingGdd = Math.max(0, cornTarget - totalGdd);
  const daysToMaturity = avgDailyGdd > 0 ? Math.round(remainingGdd / avgDailyGdd) : null;

  return (
    <div className="fade-in">
      <p className="page-subtitle">
        Growing degree day tracking from historical weather data -- powered by Open-Meteo
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
            <button className="btn btn-primary" onClick={fetchGDD} style={{ padding: '5px 12px', fontSize: 11 }}>
              {loading ? 'Loading...' : 'Update'}
            </button>
          </div>

          {error && (
            <div className="data-notice data-notice-error">{error}</div>
          )}

          <div className="metric-grid" style={{ marginBottom: 18 }}>
            <MetricCard
              label="Season GDD"
              value={totalGdd ? totalGdd.toLocaleString() : '--'}
              unit="F-days"
              change={gddData ? `Base temp: ${gddData.base_temp_f} F` : ''}
              changeType="neutral"
            />
            <MetricCard
              label="Days to Corn Maturity"
              value={daysToMaturity !== null ? daysToMaturity.toString() : '--'}
              unit="days"
              change={totalGdd >= cornTarget ? 'Maturity reached' : `${Math.round(remainingGdd)} GDD remaining`}
              changeType={totalGdd >= cornTarget ? 'positive' : 'neutral'}
            />
            <MetricCard
              label="Avg Daily GDD"
              value={avgDailyGdd ? avgDailyGdd.toFixed(1) : '--'}
              unit="F-days"
              change="Season average"
              changeType="neutral"
            />
          </div>

          {weeklyGdd.length > 0 && (
            <div className="grid-2" style={{ marginBottom: 18 }}>
              <HudPanel title="Weekly GDD Accumulation">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyGdd}>
                    <XAxis dataKey="week" tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="gdd" fill="rgba(61,122,74,0.5)" radius={[3, 3, 0, 0]} name="GDD (F-days)" />
                  </BarChart>
                </ResponsiveContainer>
              </HudPanel>

              <HudPanel title="Cumulative GDD">
                {gddData?.daily_gdd && (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={gddData.daily_gdd.filter((_, i) => i % 3 === 0)}>
                      <XAxis dataKey="date" tick={{ fill: '#9a9a9a', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#9a9a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="cumulative" stroke="#3d7a4a" strokeWidth={2} dot={false} name="Cumulative GDD" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </HudPanel>
            </div>
          )}
        </>
      )}

      {/* Crop Reference (static — this is reference data, not sample data) */}
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
