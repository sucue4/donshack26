import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';

const ndviHistory = [
  { week: 'W1', ndvi: 0.42 }, { week: 'W2', ndvi: 0.48 },
  { week: 'W3', ndvi: 0.55 }, { week: 'W4', ndvi: 0.63 },
  { week: 'W5', ndvi: 0.68 }, { week: 'W6', ndvi: 0.72 },
  { week: 'W7', ndvi: 0.71 }, { week: 'W8', ndvi: 0.74 },
];

const cropDistribution = [
  { name: 'Corn', value: 45, color: '#3d7a4a' },
  { name: 'Soybean', value: 30, color: '#7ab87f' },
  { name: 'Wheat', value: 15, color: '#c0a030' },
  { name: 'Cover Crop', value: 10, color: '#8a6a3a' },
];

const soilMoisture = [
  { hour: '6am', moisture: 32 }, { hour: '9am', moisture: 30 },
  { hour: '12pm', moisture: 27 }, { hour: '3pm', moisture: 24 },
  { hour: '6pm', moisture: 26 }, { hour: '9pm', moisture: 29 },
];

const alerts = [
  { id: 1, type: 'warning', message: 'Low soil moisture in Field A-3 northwest zone', time: '2h ago' },
  { id: 2, type: 'info', message: 'Sentinel-2 imagery updated -- new NDVI composite available', time: '4h ago' },
  { id: 3, type: 'good', message: 'Corn in Field B-1 reached V6 growth stage on schedule', time: '6h ago' },
  { id: 4, type: 'danger', message: 'Japanese beetle activity detected in adjacent county', time: '1d ago' },
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
        <div key={i} style={{ color: p.color }}>
          {p.name}: {p.value}{p.unit || ''}
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [weatherData, setWeatherData] = useState([]);
  const [lat, setLat] = useState('38.94');
  const [lon, setLon] = useState('-92.31');

  useEffect(() => {
    fetchWeather();
  }, []);

  const fetchWeather = async () => {
    try {
      const res = await fetch(`/api/weather/forecast?lat=${lat}&lon=${lon}&days=7`);
      if (res.ok) {
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
        }
      }
    } catch {
      // Fallback to sample data if backend not available
      setWeatherData([
        { day: 'Mon', temp: 24, rain: 0 },  { day: 'Tue', temp: 26, rain: 2 },
        { day: 'Wed', temp: 23, rain: 8 },  { day: 'Thu', temp: 21, rain: 12 },
        { day: 'Fri', temp: 22, rain: 5 },  { day: 'Sat', temp: 25, rain: 0 },
        { day: 'Sun', temp: 27, rain: 0 },
      ]);
    }
  };

  const handleLocationChange = () => {
    fetchWeather();
  };

  return (
    <div className="fade-in">
      <div className="page-title">Dashboard</div>
      <p className="page-subtitle">Overview of your farm operations and field intelligence</p>

      {/* Location selector */}
      <div className="location-bar">
        <label>Location:</label>
        <input type="text" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" />
        <input type="text" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" />
        <button className="btn btn-primary" onClick={handleLocationChange} style={{ padding: '5px 12px', fontSize: 11 }}>
          Update
        </button>
      </div>

      {/* Metrics Row */}
      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Active Fields" value="12" change="+2 this season" changeType="positive" />
        <MetricCard label="Avg NDVI" value="0.74" change="+0.06 vs last week" changeType="positive" />
        <MetricCard label="Soil Moisture" value="28" unit="%" change="-4% today" changeType="negative" />
        <MetricCard label="GDD Accumulated" value="1,847" unit="F-days" change="On track for maturity" changeType="positive" />
        <MetricCard label="Total Acreage" value="640" unit="ac" />
        <MetricCard label="Alerts" value="4" change="1 critical" changeType="negative" />
      </div>

      {/* Main Grid */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* NDVI Trend */}
        <HudPanel title="NDVI Trend -- All Fields">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={ndviHistory}>
              <defs>
                <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3d7a4a" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3d7a4a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0.3, 0.9]} tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ndvi" stroke="#3d7a4a" strokeWidth={2} fill="url(#ndviGrad)" name="NDVI" />
            </AreaChart>
          </ResponsiveContainer>
        </HudPanel>

        {/* Weather Forecast */}
        <HudPanel title="7-Day Forecast">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weatherData.length ? weatherData : [{ day: 'Loading...', temp: 0, rain: 0 }]}>
              <XAxis dataKey="day" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="temp" fill="#c0a030" radius={[4, 4, 0, 0]} name="Temp C" />
              <Bar dataKey="rain" fill="#4a7a8c" radius={[4, 4, 0, 0]} name="Rain mm" />
            </BarChart>
          </ResponsiveContainer>
        </HudPanel>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* Crop Distribution */}
        <HudPanel title="Crop Distribution">
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
        </HudPanel>

        {/* Soil Moisture Trend */}
        <HudPanel title="Soil Moisture -- Today">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={soilMoisture}>
              <XAxis dataKey="hour" tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[20, 40]} tick={{ fill: '#9a9a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="moisture" stroke="#4a7a8c" strokeWidth={2} dot={{ r: 3, fill: '#4a7a8c' }} name="Moisture %" />
            </LineChart>
          </ResponsiveContainer>
        </HudPanel>
      </div>

      {/* Alerts */}
      <HudPanel title="Recent Alerts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: '#fafaf8', borderRadius: 6,
              borderLeft: `3px solid var(--status-${a.type})`,
            }}>
              <span className={`badge badge-${a.type}`} style={{ minWidth: 50, textAlign: 'center' }}>
                {a.type}
              </span>
              <span style={{ flex: 1, fontSize: 12 }}>{a.message}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{a.time}</span>
            </div>
          ))}
        </div>
      </HudPanel>
    </div>
  );
}
