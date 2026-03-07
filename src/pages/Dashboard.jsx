import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
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
        <div key={i} style={{ color: p.color }}>
          {p.name}: {p.value}{p.unit || ''}
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [weatherData, setWeatherData] = useState([]);
  const [weatherError, setWeatherError] = useState(null);
  const [soilData, setSoilData] = useState(null);
  const [soilError, setSoilError] = useState(null);
  const [moistureData, setMoistureData] = useState([]);
  const [moistureError, setMoistureError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadFields = () => {
      const f = getFields();
      setFields(f);
      if (f.length > 0 && !selectedField) {
        setSelectedField(f[0]);
      }
    };
    loadFields();
    window.addEventListener('ohdeere-fields-changed', loadFields);
    return () => window.removeEventListener('ohdeere-fields-changed', loadFields);
  }, []);

  useEffect(() => {
    if (selectedField) fetchAllData();
  }, [selectedField]);

  const fetchAllData = async () => {
    if (!selectedField) return;
    setLoading(true);
    const { lat, lon } = selectedField;

    // Fetch weather
    setWeatherError(null);
    try {
      const res = await fetch(`/api/weather/forecast?lat=${lat}&lon=${lon}&days=7`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const daily = data.daily;
      if (daily && daily.time) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const forecast = daily.time.map((t, i) => ({
          day: days[new Date(t).getDay()],
          temp: Math.round((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2),
          rain: Math.round((daily.precipitation_sum[i] || 0) * 10) / 10,
        }));
        setWeatherData(forecast);

        // Extract soil moisture from hourly
        const hourly = data.hourly;
        if (hourly && hourly.soil_moisture_0_to_7cm) {
          const times = hourly.time || [];
          const sm = hourly.soil_moisture_0_to_7cm;
          const trend = [];
          for (let i = 0; i < Math.min(24, sm.length); i += 4) {
            if (sm[i] !== null && sm[i] !== undefined) {
              const d = new Date(times[i]);
              const h = d.getHours();
              trend.push({
                hour: h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`,
                moisture: Math.round(sm[i] * 100 * 10) / 10,
              });
            }
          }
          setMoistureData(trend);
          setMoistureError(null);
        }
      }
    } catch (e) {
      setWeatherError(e.message);
      setWeatherData([]);
      setMoistureError(e.message);
      setMoistureData([]);
    }

    // Fetch soil
    setSoilError(null);
    try {
      const res = await fetch(`/api/soil/properties?lat=${lat}&lon=${lon}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSoilData(data);
    } catch (e) {
      setSoilError(e.message);
      setSoilData(null);
    }

    setLoading(false);
  };

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
  };

  // Compute crop distribution from actual fields
  const cropDistribution = (() => {
    const cropColors = { Corn: '#3d7a4a', Soybean: '#7ab87f', Wheat: '#c0a030', 'Cover Crop': '#8a6a3a' };
    const totals = {};
    let totalAcres = 0;
    fields.forEach((f) => {
      const crop = f.crop || 'Unassigned';
      totals[crop] = (totals[crop] || 0) + (f.acres || 0);
      totalAcres += f.acres || 0;
    });
    if (totalAcres === 0) return [];
    return Object.entries(totals).map(([name, acres]) => ({
      name,
      value: Math.round((acres / totalAcres) * 100),
      color: cropColors[name] || '#6b6b6b',
    }));
  })();

  const totalAcres = fields.reduce((sum, f) => sum + (f.acres || 0), 0);
  const topSoil = soilData?.profiles?.[0];
  const avgMoisture = moistureData.length > 0
    ? Math.round(moistureData.reduce((s, m) => s + m.moisture, 0) / moistureData.length * 10) / 10
    : null;

  const noFields = fields.length === 0;

  return (
    <div className="fade-in">
      <p className="page-subtitle">Overview of your farm operations and field intelligence</p>

      {noFields ? (
        <div className="data-notice data-notice-error" style={{ marginBottom: 18, textAlign: 'center', padding: 24 }}>
          No fields defined yet. Go to the Field Map page and draw your farm boundaries to get started.
        </div>
      ) : (
        <>
          <div className="location-bar">
            <label>Field:</label>
            <select
              className="field-select"
              value={selectedField?.id || ''}
              onChange={handleFieldSelect}
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.acres} ac)</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {selectedField ? `${selectedField.lat}, ${selectedField.lon}` : ''}
            </span>
            <button className="btn btn-primary" onClick={fetchAllData} style={{ padding: '5px 12px', fontSize: 11 }}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="metric-grid" style={{ marginBottom: 18 }}>
            <MetricCard label="Active Fields" value={fields.length.toString()} change="User-defined" changeType="neutral" />
            <MetricCard label="Total Acreage" value={Math.round(totalAcres).toString()} unit="ac" />
            <MetricCard
              label="Soil Moisture"
              value={avgMoisture !== null ? avgMoisture.toString() : '--'}
              unit="%"
              change={moistureError ? 'Error loading' : avgMoisture !== null ? 'From Open-Meteo' : 'No data'}
              changeType={moistureError ? 'negative' : 'neutral'}
            />
            <MetricCard
              label="Soil pH"
              value={topSoil ? (topSoil.phh2o || topSoil.ph || '--').toString() : '--'}
              change={soilError ? 'Error loading' : topSoil ? 'From SoilGrids' : 'No data'}
              changeType={soilError ? 'negative' : 'neutral'}
            />
          </div>

          <div className="grid-2" style={{ marginBottom: 18 }}>
            <HudPanel title="7-Day Forecast">
              {weatherError ? (
                <div className="data-notice data-notice-error">{weatherError}</div>
              ) : weatherData.length === 0 ? (
                <div className="data-notice">No weather data loaded</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weatherData}>
                    <XAxis dataKey="day" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="temp" fill="#c0a030" radius={[4, 4, 0, 0]} name="Temp C" />
                    <Bar dataKey="rain" fill="#4a7a8c" radius={[4, 4, 0, 0]} name="Rain mm" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </HudPanel>

            <HudPanel title="Soil Moisture -- Today">
              {moistureError ? (
                <div className="data-notice data-notice-error">{moistureError}</div>
              ) : moistureData.length === 0 ? (
                <div className="data-notice">No soil moisture data loaded</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={moistureData}>
                    <XAxis dataKey="hour" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="moisture" stroke="#4a7a8c" strokeWidth={2} dot={{ r: 3, fill: '#4a7a8c' }} name="Moisture %" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </HudPanel>
          </div>

          <div className="grid-2" style={{ marginBottom: 18 }}>
            <HudPanel title="Crop Distribution">
              {cropDistribution.length === 0 ? (
                <div className="data-notice">No crop assignments yet -- set crops on your fields</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={cropDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                          dataKey="value" strokeWidth={0} paddingAngle={3}>
                          {cropDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                    {cropDistribution.map((c) => (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b6b6b' }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                        {c.name} ({c.value}%)
                      </div>
                    ))}
                  </div>
                </>
              )}
            </HudPanel>

            <HudPanel title="Soil Profile (Top Layer)">
              {soilError ? (
                <div className="data-notice data-notice-error">{soilError}</div>
              ) : !topSoil ? (
                <div className="data-notice">No soil data loaded</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['pH', topSoil.phh2o || topSoil.ph],
                      ['Clay', `${topSoil.clay || '--'}%`],
                      ['Sand', `${topSoil.sand || '--'}%`],
                      ['Silt', `${topSoil.silt || '--'}%`],
                      ['Organic C', `${topSoil.soc || topSoil.organic || '--'}%`],
                      ['CEC', `${topSoil.cec || '--'} cmol/kg`],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ fontWeight: 500 }}>{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </HudPanel>
          </div>
        </>
      )}
    </div>
  );
}
