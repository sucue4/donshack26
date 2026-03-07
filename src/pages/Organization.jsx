import React, { useState } from 'react';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';

const initialTasks = [
  { id: 1, title: 'Scout Field A-1 for Japanese beetle', due: 'Mar 8', priority: 'High', status: 'Pending', category: 'Scouting' },
  { id: 2, title: 'Apply fungicide to Field B-1 (gray leaf spot)', due: 'Mar 9', priority: 'High', status: 'Scheduled', category: 'Treatment' },
  { id: 3, title: 'Check irrigation system — Field A-1 NW zone', due: 'Mar 7', priority: 'Critical', status: 'In Progress', category: 'Irrigation' },
  { id: 4, title: 'Soil sample — Fields C-1 and D-1', due: 'Mar 12', priority: 'Medium', status: 'Pending', category: 'Soil' },
  { id: 5, title: 'Order cover crop seed for fall planting', due: 'Mar 15', priority: 'Low', status: 'Pending', category: 'Planning' },
  { id: 6, title: 'Review grain marketing contracts', due: 'Mar 20', priority: 'Medium', status: 'Pending', category: 'Business' },
  { id: 7, title: 'Calibrate sprayer before fungicide application', due: 'Mar 8', priority: 'High', status: 'Pending', category: 'Equipment' },
  { id: 8, title: 'Submit crop insurance report', due: 'Mar 31', priority: 'Medium', status: 'Pending', category: 'Business' },
];

const fieldNotes = [
  { date: 'Mar 5', field: 'A-1', note: 'Japanese beetle adults found — 2/plant average. Below treatment threshold but monitoring closely. NW corner still showing stress — likely moisture related.' },
  { date: 'Mar 3', field: 'B-1', note: 'Gray leaf spot lesions confirmed on lower canopy. Scheduled fungicide application for Mar 9 weather window.' },
  { date: 'Mar 1', field: 'A-2', note: 'Soybean aphids reached 250/plant threshold on R3 plants. Applied lambda-cyhalothrin at 3.2 oz/ac. Will re-scout in 7 days.' },
  { date: 'Feb 28', field: 'All', note: 'General scouting — all fields looking good overall. Corn at V8-V10, soybeans at R2-R3. Wheat heading.' },
];

const seasonTimeline = [
  { month: 'Apr', event: 'Field preparation, soil testing', status: 'completed' },
  { month: 'May', event: 'Corn and soybean planting', status: 'completed' },
  { month: 'Jun', event: 'Post-emergence herbicide, scouting', status: 'completed' },
  { month: 'Jul', event: 'Fungicide timing, irrigation management', status: 'completed' },
  { month: 'Aug', event: 'Late-season scouting, yield estimation', status: 'current' },
  { month: 'Sep', event: 'Early harvest prep, cover crop planning', status: 'upcoming' },
  { month: 'Oct', event: 'Corn harvest, cover crop seeding', status: 'upcoming' },
  { month: 'Nov', event: 'Soybean harvest, fall tillage', status: 'upcoming' },
];

const priorityColor = (p) => p === 'Critical' ? 'var(--status-danger)' : p === 'High' ? 'var(--status-warning)' : p === 'Medium' ? 'var(--accent-primary)' : 'var(--text-dim)';
const statusBadge = (s) => s === 'In Progress' ? 'badge-info' : s === 'Scheduled' ? 'badge-warning' : s === 'Completed' ? 'badge-good' : 'badge-info';

export default function Organization() {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState('All');

  const toggleTask = (id) => {
    setTasks((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: t.status === 'Completed' ? 'Pending' : 'Completed' } : t
    ));
  };

  const filtered = filter === 'All' ? tasks : tasks.filter((t) => t.status !== 'Completed');

  return (
    <div className="fade-in">
      <div className="page-title">
        <span className="title-icon">▦</span> Organization
      </div>
      <p className="page-subtitle">
        Task management, field notes, and seasonal timeline — keep your operation on track
      </p>

      <div className="metric-grid" style={{ marginBottom: 18 }}>
        <MetricCard label="Total Tasks" value={tasks.length.toString()} icon="▦" />
        <MetricCard label="Critical" value={tasks.filter((t) => t.priority === 'Critical').length.toString()} icon="⚠" changeType="negative" change="Needs immediate action" />
        <MetricCard label="In Progress" value={tasks.filter((t) => t.status === 'In Progress').length.toString()} icon="◎" />
        <MetricCard label="Completed" value={tasks.filter((t) => t.status === 'Completed').length.toString()} icon="✓" changeType="positive" change={`${Math.round(tasks.filter((t) => t.status === 'Completed').length / tasks.length * 100)}% done`} />
      </div>

      <div className="grid-2-1" style={{ marginBottom: 18 }}>
        {/* Task List */}
        <HudPanel title="Task Queue" icon="▦"
          actions={
            <div style={{ display: 'flex', gap: 4 }}>
              {['All', 'Active'].map((f) => (
                <button key={f} className={filter === f ? 'btn btn-primary' : 'btn'} onClick={() => setFilter(f)} style={{ padding: '3px 10px', fontSize: 9 }}>
                  {f}
                </button>
              ))}
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map((task) => (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: task.status === 'Completed' ? 'rgba(0,255,136,0.03)' : 'rgba(0,0,0,0.15)',
                  borderRadius: 4, cursor: 'pointer',
                  borderLeft: `2px solid ${priorityColor(task.priority)}`,
                  opacity: task.status === 'Completed' ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                  border: `1px solid ${task.status === 'Completed' ? 'var(--status-good)' : 'var(--border-color)'}`,
                  background: task.status === 'Completed' ? 'rgba(0,255,136,0.2)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: 'var(--status-good)',
                }}>
                  {task.status === 'Completed' && '✓'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 500,
                    textDecoration: task.status === 'Completed' ? 'line-through' : 'none',
                  }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 8, marginTop: 2 }}>
                    <span>Due: {task.due}</span>
                    <span>{task.category}</span>
                  </div>
                </div>
                <span className={`badge ${statusBadge(task.status)}`}>{task.status}</span>
              </div>
            ))}
          </div>
        </HudPanel>

        {/* Season Timeline */}
        <HudPanel title="Season Timeline" icon="◎">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {seasonTimeline.map((item) => (
              <div key={item.month} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
                borderLeft: `2px solid ${item.status === 'current' ? 'var(--accent-primary)' : item.status === 'completed' ? 'var(--status-good)' : 'rgba(0,212,255,0.15)'}`,
                background: item.status === 'current' ? 'rgba(0,212,255,0.05)' : 'transparent',
                borderRadius: '0 4px 4px 0',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 600,
                  color: item.status === 'current' ? 'var(--accent-primary)' : item.status === 'completed' ? 'var(--text-dim)' : 'var(--text-secondary)',
                  width: 30,
                }}>
                  {item.month}
                </div>
                <div style={{
                  fontSize: 11,
                  color: item.status === 'current' ? 'var(--text-primary)' : 'var(--text-dim)',
                  fontWeight: item.status === 'current' ? 500 : 400,
                }}>
                  {item.event}
                </div>
              </div>
            ))}
          </div>
        </HudPanel>
      </div>

      {/* Field Notes */}
      <HudPanel title="Field Notes" icon="◇">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fieldNotes.map((note, i) => (
            <div key={i} style={{
              padding: '10px 12px', background: 'rgba(0,0,0,0.15)',
              borderRadius: 4, borderLeft: '2px solid rgba(0,212,255,0.3)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)' }}>
                  {note.field}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{note.date}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {note.note}
              </div>
            </div>
          ))}
        </div>
      </HudPanel>
    </div>
  );
}
