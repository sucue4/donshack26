import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import ArcReactor from '../components/ArcReactor';

const ndviHistory = [
  { week: 'W1', ndvi: 0.42 }, { week: 'W2', ndvi: 0.48 },
  { week: 'W3', ndvi: 0.55 }, { week: 'W4', ndvi: 0.63 },
  { week: 'W5', ndvi: 0.68 }, { week: 'W6', ndvi: 0.72 },
  { week: 'W7', ndvi: 0.71 }, { week: 'W8', ndvi: 0.74 },
];

const weatherForecast = [
  { day: 'Mon', temp: 24, rain: 0 },  { day: 'Tue', temp: 26, rain: 2 },
  { day: 'Wed', temp: 23, rain: 8 },  { day: 'Thu', temp: 21, rain: 12 },
  { day: 'Fri', temp: 22, rain: 5 },  { day: 'Sat', temp: 25, rain: 0 },
  { day: 'Sun', temp: 27, rain: 0 },
];

const cropDistribution = [
  { name: 'Corn', value: 45, color: '#00d4ff' },
  { name: 'Soybean', value: 30, color: '#00ff88' },
  { name: 'Wheat', value: 15, color: '#ffaa00' },
  { name: 'Cover Crop', value: 10, color: '#ff3355' },
];

const soilMoisture = [
  { hour: '6am', moisture: 32 }, { hour: '9am', moisture: 30 },
  { hour: '12pm', moisture: 27 }, { hour: '3pm', moisture: 24 },
  { hour: '6pm', moisture: 26 }, { hour: '9pm', moisture: 29 },
];

const alerts = [
  { id: 1, type: 'warning', message: 'Low soil moisture in Field A-3 northwest zone', time: '2h ago' },
  { id: 2, type: 'info', message: 'Sentinel-2 imagery updated — new NDVI composite available', time: '4h ago' },
  { id: 3, type: 'good', message: 'Corn in Field B-1 reached V6 growth stage on schedule', time: '6h ago' },
  { id: 4, type: 'danger', message: 'Japanese beetle activity detected in adjacent county', time: '1d ago' },
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
        <div key={i} style={{ color: p.color }}>
          {p.name}: {p.value}{p.unit || ''}
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [systemTime, setSystemTime] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSystemTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fade-in">
      <div className="page-title">
        <span className="title-icon">⬡</span> Command Center
      </div>
      <p className="page-subtitle">Real-time overview of your farm operations and field intelligence</p>

      {/* Metrics Row */}
      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Active Fields" value="12" icon="◎" change="+2 this season" changeType="positive" />
        <MetricCard label="Avg NDVI" value="0.74" icon="◈" change="+0.06 vs last week" changeType="positive" />
        <MetricCard label="Soil Moisture" value="28" unit="%" icon="◉" change="-4% today" changeType="negative" />
        <MetricCard label="GDD Accumulated" value="1,847" unit="°F" icon="☀" change="On track for maturity" changeType="positive" />
        <MetricCard label="Total Acreage" value="640" unit="ac" icon="▦" />
        <MetricCard label="Alerts" value="4" icon="⚠" change="1 critical" changeType="negative" />
      </div>

      {/* Main Grid */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* NDVI Trend */}
        <HudPanel title="NDVI Trend — All Fields" icon="◈">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={ndviHistory}>
              <defs>
                <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0.3, 0.9]} tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ndvi" stroke="#00d4ff" strokeWidth={2} fill="url(#ndviGrad)" name="NDVI" />
            </AreaChart>
          </ResponsiveContainer>
        </HudPanel>

        {/* Weather Forecast */}
        <HudPanel title="7-Day Forecast" icon="☁">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weatherForecast}>
              <XAxis dataKey="day" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="temp" fill="rgba(0,212,255,0.6)" radius={[3, 3, 0, 0]} name="Temp °C" />
              <Bar dataKey="rain" fill="rgba(0,255,136,0.4)" radius={[3, 3, 0, 0]} name="Rain mm" />
            </BarChart>
          </ResponsiveContainer>
        </HudPanel>
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        {/* Crop Distribution */}
        <HudPanel title="Crop Distribution" icon="❋">
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
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(180,200,230,0.7)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                {c.name} ({c.value}%)
              </div>
            ))}
          </div>
        </HudPanel>

        {/* Soil Moisture Trend */}
        <HudPanel title="Soil Moisture — Today" icon="◉">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={soilMoisture}>
              <XAxis dataKey="hour" tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[20, 40]} tick={{ fill: 'rgba(180,200,230,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="moisture" stroke="#00ff88" strokeWidth={2} dot={{ r: 3, fill: '#00ff88' }} name="Moisture %" />
            </LineChart>
          </ResponsiveContainer>
        </HudPanel>

        {/* System Status */}
        <HudPanel title="System Status" icon="⬡">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <ArcReactor size={100} />
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>
              All systems operational
            </div>
            <div style={{ width: '100%', marginTop: 4 }}>
              {[
                { label: 'Satellite Feed', status: 'Online' },
                { label: 'Weather API', status: 'Online' },
                { label: 'Soil Database', status: 'Online' },
                { label: 'AI Advisor', status: 'Ready' },
              ].map((s) => (
                <div key={s.label} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                  fontSize: 11, borderBottom: '1px solid rgba(0,212,255,0.06)',
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                  <span style={{ color: 'var(--status-good)', fontWeight: 600, fontSize: 10 }}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>
        </HudPanel>
      </div>

      {/* Alerts */}
      <HudPanel title="Recent Alerts" icon="⚠">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: 'rgba(0,0,0,0.2)', borderRadius: 4,
              borderLeft: `2px solid var(--status-${a.type})`,
            }}>
              <span className={`badge badge-${a.type}`} style={{ minWidth: 50, textAlign: 'center' }}>
                {a.type}
              </span>
              <span style={{ flex: 1, fontSize: 12 }}>{a.message}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{a.time}</span>
            </div>
          ))}
        </div>
      </HudPanel>
    </div>
  );
}
