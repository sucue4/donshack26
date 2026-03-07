import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
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
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function WaterManagement() {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [moistureTrend, setMoistureTrend] = useState([]);
  const [dailyBalance, setDailyBalance] = useState([]);
  const [summary, setSummary] = useState(null);

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
    if (selectedField) fetchWaterData();
  }, [selectedField]);

  const fetchWaterData = async () => {
    if (!selectedField) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather/water-balance?lat=${selectedField.lat}&lon=${selectedField.lon}&days=7`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server returned ${res.status}`);
      }
      const data = await res.json();

      // Moisture trend
      const trend = (data.moisture_trend || []).map((m) => {
        const d = new Date(m.time);
        const month = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const hour = d.getHours();
        const label = `${month} ${hour === 0 ? '12AM' : hour < 12 ? hour + 'AM' : hour === 12 ? '12PM' : (hour - 12) + 'PM'}`;
        return { time: label, moisture: m.moisture_pct };
      });
      setMoistureTrend(trend);

      // Daily ET0 vs precipitation
      const balance = (data.daily_balance || []).map((d) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dt = new Date(d.date);
        return { day: days[dt.getDay()], et0: d.et0, precipitation: d.precipitation, balance: d.balance };
      });
      setDailyBalance(balance);

      setSummary(data.summary || null);
    } catch (e) {
      setError(e.message);
      setMoistureTrend([]);
      setDailyBalance([]);
      setSummary(null);
    }
    setLoading(false);
  };

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
  };

  const noFields = fields.length === 0;

  return (
    <div className="fade-in">
      <p className="page-subtitle">
        Soil moisture, precipitation tracking, and evapotranspiration analysis -- powered by Open-Meteo
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
            <button className="btn btn-primary" onClick={fetchWaterData} style={{ padding: '5px 12px', fontSize: 11 }}>
              {loading ? 'Loading...' : 'Update'}
            </button>
          </div>

          {error && (
            <div className="data-notice data-notice-error">{error}</div>
          )}

          <div className="metric-grid" style={{ marginBottom: 18 }}>
            <MetricCard
              label="Avg Soil Moisture"
              value={summary?.avg_soil_moisture_pct?.toString() || '--'}
              unit="%"
              change="From Open-Meteo"
              changeType="neutral"
            />
            <MetricCard
              label="Total Precipitation"
              value={summary?.total_precipitation_mm?.toString() || '--'}
              unit="mm"
              change="Past + forecast period"
              changeType="neutral"
            />
            <MetricCard
              label="Total ET0"
              value={summary?.total_et0_mm?.toString() || '--'}
              unit="mm"
              change="Evapotranspiration"
              changeType="neutral"
            />
            <MetricCard
              label="Water Balance"
              value={summary?.water_balance_mm?.toString() || '--'}
              unit="mm"
              change={summary?.water_balance_mm < 0 ? 'Deficit' : 'Surplus'}
              changeType={summary?.water_balance_mm < 0 ? 'negative' : 'positive'}
            />
          </div>

          <div className="grid-2" style={{ marginBottom: 18 }}>
            <HudPanel title="Soil Moisture Trend">
              {moistureTrend.length === 0 && !loading ? (
                <div className="data-notice">No soil moisture data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={moistureTrend}>
                    <defs>
                      <linearGradient id="moistGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4a7a8c" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#4a7a8c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fill: '#9a9a9a', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="moisture" stroke="#4a7a8c" strokeWidth={2} fill="url(#moistGrad)" name="Soil Moisture %" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </HudPanel>

            <HudPanel title="Evapotranspiration vs Rainfall">
              {dailyBalance.length === 0 && !loading ? (
                <div className="data-notice">No ET0/precipitation data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyBalance}>
                    <XAxis dataKey="day" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="et0" fill="#c0a030" radius={[4, 4, 0, 0]} name="ET0 mm" />
                    <Bar dataKey="precipitation" fill="#4a7a8c" radius={[4, 4, 0, 0]} name="Rain mm" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </HudPanel>
          </div>

          {dailyBalance.length > 0 && (
            <HudPanel title="Daily Water Balance">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>ET0 (mm)</th>
                    <th>Precipitation (mm)</th>
                    <th>Balance (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyBalance.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{row.day}</td>
                      <td>{row.et0}</td>
                      <td>{row.precipitation}</td>
                      <td>
                        <span style={{ color: row.balance < 0 ? 'var(--status-danger)' : 'var(--status-good)', fontWeight: 600 }}>
                          {row.balance > 0 ? '+' : ''}{row.balance}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HudPanel>
          )}
        </>
      )}
    </div>
  );
}
