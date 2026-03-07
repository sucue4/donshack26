import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';

const hourlyForecast = [
  { time: '6AM', temp: 12, humidity: 82, wind: 8 },
  { time: '9AM', temp: 16, humidity: 72, wind: 12 },
  { time: '12PM', temp: 22, humidity: 58, wind: 15 },
  { time: '3PM', temp: 25, humidity: 48, wind: 18 },
  { time: '6PM', temp: 22, humidity: 55, wind: 14 },
  { time: '9PM', temp: 17, humidity: 68, wind: 9 },
  { time: '12AM', temp: 13, humidity: 78, wind: 6 },
];

const weeklyForecast = [
  { day: 'Mon', high: 25, low: 12, rain: 0, condition: '☀️ Clear' },
  { day: 'Tue', high: 27, low: 14, rain: 2, condition: '⛅ Partly Cloudy' },
  { day: 'Wed', high: 22, low: 11, rain: 12, condition: '🌧️ Rain' },
  { day: 'Thu', high: 20, low: 10, rain: 18, condition: '🌧️ Heavy Rain' },
  { day: 'Fri', high: 23, low: 11, rain: 5, condition: '⛅ Showers' },
  { day: 'Sat', high: 26, low: 13, rain: 0, condition: '☀️ Clear' },
  { day: 'Sun', high: 28, low: 15, rain: 0, condition: '☀️ Clear' },
];

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
      background: 'rgba(10,20,40,0.95)', border: '1px solid rgba(0,212,255,0.3)',
      borderRadius: 4, padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-body)', color: '#e0eaff',
    }}>
      <div style={{ color: 'rgba(0,212,255,0.7)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function Weather() {
  const [lat, setLat] = useState('38.94');
  const [lon, setLon] = useState('-92.31');
  const [loading, setLoading] = useState(false);

  return (
    <div className="fade-in">
      <div className="page-title">
        <span className="title-icon">☁</span> Weather Intelligence
      </div>
      <p className="page-subtitle">
        Forecast, historical climate, and agricultural weather indices — powered by Open-Meteo
      </p>

      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Temperature" value="25" unit="°C" icon="☀" change="High: 27°C · Low: 12°C" changeType="neutral" />
        <MetricCard label="Precipitation (7d)" value="37" unit="mm" icon="☁" change="Below seasonal avg" changeType="negative" />
        <MetricCard label="Wind Speed" value="15" unit="km/h" icon="≋" change="SW direction" changeType="neutral" />
        <MetricCard label="Humidity" value="48" unit="%" icon="◉" change="Good for field work" changeType="positive" />
        <MetricCard label="ET₀ (Today)" value="4.7" unit="mm" icon="▲" change="High evapotranspiration" changeType="negative" />
        <MetricCard label="Frost Risk" value="None" icon="❄" change="Min 10°C next 7 days" changeType="positive" />
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <HudPanel title="Today — Hourly Temperature" icon="☀">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hourlyForecast}>
              <defs>
                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffaa00" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ffaa00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="temp" stroke="#ffaa00" strokeWidth={2} fill="url(#tempGrad)" name="Temp °C" />
            </AreaChart>
          </ResponsiveContainer>
        </HudPanel>

        <HudPanel title="Humidity & Wind" icon="≋">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={hourlyForecast}>
              <XAxis dataKey="time" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="humidity" stroke="#00d4ff" strokeWidth={2} dot={{ r: 3 }} name="Humidity %" />
              <Line type="monotone" dataKey="wind" stroke="#00ff88" strokeWidth={2} dot={{ r: 3 }} name="Wind km/h" />
            </LineChart>
          </ResponsiveContainer>
        </HudPanel>
      </div>

      {/* 7-Day Forecast */}
      <HudPanel title="7-Day Forecast" icon="☁" className="mb-2">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {weeklyForecast.map((d) => (
            <div key={d.day} style={{
              background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '12px 8px',
              textAlign: 'center', border: '1px solid rgba(0,212,255,0.08)',
            }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{d.day}</div>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{d.condition.split(' ')[0]}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)' }}>
                {d.high}°
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{d.low}°</div>
              {d.rain > 0 && (
                <div style={{ fontSize: 10, color: 'var(--accent-primary)', marginTop: 4 }}>
                  {d.rain}mm
                </div>
              )}
            </div>
          ))}
        </div>
      </HudPanel>

      {/* Climate Normals */}
      <HudPanel title="Monthly Climate Normals" icon="◈">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={monthlyClimate}>
            <XAxis dataKey="month" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="temp" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="precip" orientation="right" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="precip" dataKey="precip" fill="rgba(0,212,255,0.3)" radius={[3, 3, 0, 0]} name="Precip mm" />
            <Line yAxisId="temp" type="monotone" dataKey="tempAvg" stroke="#ffaa00" strokeWidth={2} dot={{ r: 3 }} name="Avg Temp °C" />
          </ComposedChart>
        </ResponsiveContainer>
      </HudPanel>
    </div>
  );
}
