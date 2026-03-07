import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import FARM_FIELDS from '../fields';

const monthlyClimate = [
  { month: 'Jan', tempAvg: 0, precip: 42 }, { month: 'Feb', tempAvg: 3, precip: 48 },
  { month: 'Mar', tempAvg: 9, precip: 68 }, { month: 'Apr', tempAvg: 14, precip: 95 },
  { month: 'May', tempAvg: 19, precip: 115 }, { month: 'Jun', tempAvg: 24, precip: 108 },
  { month: 'Jul', tempAvg: 27, precip: 92 }, { month: 'Aug', tempAvg: 26, precip: 88 },
  { month: 'Sep', tempAvg: 22, precip: 82 }, { month: 'Oct', tempAvg: 15, precip: 75 },
  { month: 'Nov', tempAvg: 8, precip: 65 }, { month: 'Dec', tempAvg: 2, precip: 50 },
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

const conditionLabel = (code) => {
  if (code <= 1) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow Showers';
  return 'Thunderstorm';
};

export default function Weather() {
  const [selectedField, setSelectedField] = useState(FARM_FIELDS[0]);
  const [lat, setLat] = useState(FARM_FIELDS[0].lat.toString());
  const [lon, setLon] = useState(FARM_FIELDS[0].lon.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hourlyData, setHourlyData] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    fetchWeather();
  }, []);

  const fetchWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather/forecast?lat=${lat}&lon=${lon}&days=7`);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      // Parse hourly data (first 24 entries for today)
      if (data.hourly && data.hourly.time) {
        const hours = data.hourly.time.slice(0, 7).map((t, i) => {
          const d = new Date(t);
          const hour = d.getHours();
          const label = hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`;
          return {
            time: label,
            temp: Math.round(data.hourly.temperature_2m[i] || 0),
            humidity: Math.round(data.hourly.relativehumidity_2m?.[i] || data.hourly.relative_humidity_2m?.[i] || 0),
            wind: Math.round(data.hourly.windspeed_10m?.[i] || data.hourly.wind_speed_10m?.[i] || 0),
          };
        });
        setHourlyData(hours);
      }
      // Parse daily data
      if (data.daily && data.daily.time) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const daily = data.daily.time.map((t, i) => ({
          day: days[new Date(t).getDay()],
          high: Math.round(data.daily.temperature_2m_max[i]),
          low: Math.round(data.daily.temperature_2m_min[i]),
          rain: Math.round((data.daily.precipitation_sum[i] || 0) * 10) / 10,
          condition: conditionLabel(data.daily.weathercode?.[i] || data.daily.weather_code?.[i] || 0),
        }));
        setDailyData(daily);

        // Summary metrics
        const todayHigh = data.daily.temperature_2m_max[0];
        const todayLow = data.daily.temperature_2m_min[0];
        const totalRain = data.daily.precipitation_sum.reduce((a, b) => a + (b || 0), 0);
        const et0 = data.daily.et0_fao_evapotranspiration?.[0] || 0;
        setSummary({
          tempHigh: Math.round(todayHigh),
          tempLow: Math.round(todayLow),
          rain7d: Math.round(totalRain * 10) / 10,
          et0: Math.round(et0 * 10) / 10,
        });
      }
    } catch (e) {
      setError(`Weather data unavailable: ${e.message}`);
    }
    setLoading(false);
  };

  const handleFieldSelect = (e) => {
    const field = FARM_FIELDS.find((f) => f.id === Number(e.target.value));
    if (field) {
      setSelectedField(field);
      setLat(field.lat.toString());
      setLon(field.lon.toString());
    }
  };

  return (
    <div className="fade-in">
      <p className="page-subtitle">
        Forecast, historical climate, and agricultural weather indices -- powered by Open-Meteo
      </p>

      <div className="location-bar">
        <label>Field:</label>
        <select
          className="field-select"
          value={selectedField?.id || ''}
          onChange={handleFieldSelect}
        >
          {FARM_FIELDS.map((f) => (
            <option key={f.id} value={f.id}>{f.name} ({f.acres} ac)</option>
          ))}
        </select>
        <label>Lat:</label>
        <input type="text" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" />
        <label>Lon:</label>
        <input type="text" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" />
        <button className="btn btn-primary" onClick={fetchWeather} style={{ padding: '5px 12px', fontSize: 11 }}>
          {loading ? 'Loading...' : 'Update'}
        </button>
      </div>

      {error && (
        <div className="data-notice data-notice-error">{error}</div>
      )}

      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Temperature" value={summary.tempHigh || '--'} unit="&deg;C" change={`High: ${summary.tempHigh || '--'}\u00B0C / Low: ${summary.tempLow || '--'}\u00B0C`} changeType="neutral" />
        <MetricCard label="Precipitation (7d)" value={summary.rain7d || '--'} unit="mm" change="Total 7-day rainfall" changeType="neutral" />
        <MetricCard label="ET0 (Today)" value={summary.et0 || '--'} unit="mm" change="Evapotranspiration" changeType="neutral" />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <HudPanel title="Today -- Hourly Temperature">
          {hourlyData.length === 0 && !loading && (
            <div className="data-notice">No hourly data available</div>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hourlyData.length ? hourlyData : [{ time: '--', temp: 0 }]}>
              <defs>
                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c0a030" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#c0a030" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="temp" stroke="#c0a030" strokeWidth={2} fill="url(#tempGrad)" name="Temp &deg;C" />
            </AreaChart>
          </ResponsiveContainer>
        </HudPanel>

        <HudPanel title="Humidity and Wind">
          {hourlyData.length === 0 && !loading && (
            <div className="data-notice">No hourly data available</div>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={hourlyData.length ? hourlyData : [{ time: '--', humidity: 0, wind: 0 }]}>
              <XAxis dataKey="time" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="humidity" stroke="#4a7a8c" strokeWidth={2} dot={{ r: 3 }} name="Humidity %" />
              <Line type="monotone" dataKey="wind" stroke="#3d7a4a" strokeWidth={2} dot={{ r: 3 }} name="Wind km/h" />
            </LineChart>
          </ResponsiveContainer>
        </HudPanel>
      </div>

      {/* 7-Day Forecast */}
      <HudPanel title="7-Day Forecast" className="mb-2">
        {dailyData.length === 0 && !loading && (
          <div className="data-notice">No forecast data available -- check backend connection</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {dailyData.map((d) => (
            <div key={d.day} style={{
              background: '#fafaf8', borderRadius: 8, padding: '14px 8px',
              textAlign: 'center', border: '1px solid #e2e0dc',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#2c2c2c' }}>{d.day}</div>
              <div style={{ fontSize: 11, color: '#6b6b6b', marginBottom: 6 }}>{d.condition}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2c2c2c' }}>
                {d.high}&deg;C
              </div>
              <div style={{ fontSize: 11, color: '#9a9a9a' }}>{d.low}&deg;C</div>
              {d.rain > 0 && (
                <div style={{ fontSize: 11, color: '#4a7a8c', marginTop: 4 }}>
                  {d.rain}mm
                </div>
              )}
            </div>
          ))}
        </div>
      </HudPanel>

      {/* Climate Normals */}
      <HudPanel title="Monthly Climate Normals">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={monthlyClimate}>
            <XAxis dataKey="month" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="temp" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="precip" orientation="right" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="precip" dataKey="precip" fill="rgba(74,122,140,0.25)" radius={[4, 4, 0, 0]} name="Precip mm" />
            <Line yAxisId="temp" type="monotone" dataKey="tempAvg" stroke="#c0a030" strokeWidth={2} dot={{ r: 3 }} name="Avg Temp &deg;C" />
          </ComposedChart>
        </ResponsiveContainer>
      </HudPanel>
    </div>
  );
}
