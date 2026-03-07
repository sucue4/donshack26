import React, { useState, useEffect, useCallback } from 'react';

const SERVICE_CHECKS = [
  { key: 'backend', label: 'Backend Server', url: '/api/health' },
  { key: 'weather', label: 'Weather API (Open-Meteo)', url: '/api/weather/forecast?lat=38.94&lon=-92.31&days=1' },
  { key: 'soil', label: 'Soil API (SoilGrids)', url: '/api/soil/properties?lat=38.94&lon=-92.31' },
  { key: 'crops', label: 'Crop Database', url: '/api/crops/database' },
];

function StatusDot({ status }) {
  const colors = { ok: '#3d7a4a', error: '#b5403a', loading: '#c0a030', unchecked: '#9a9a9a' };
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: colors[status] || colors.unchecked, flexShrink: 0,
    }} />
  );
}

export default function DebugPanel({ visible, onClose }) {
  const [results, setResults] = useState({});
  const [checking, setChecking] = useState(false);
  const [statusData, setStatusData] = useState(null);

  const runChecks = useCallback(async () => {
    setChecking(true);
    const newResults = {};

    // Check individual endpoints
    for (const svc of SERVICE_CHECKS) {
      newResults[svc.key] = { status: 'loading', time: null, detail: '' };
    }
    setResults({ ...newResults });

    for (const svc of SERVICE_CHECKS) {
      const start = performance.now();
      try {
        const res = await fetch(svc.url);
        const elapsed = Math.round(performance.now() - start);
        if (res.ok) {
          newResults[svc.key] = { status: 'ok', time: elapsed, detail: `${res.status} OK` };
        } else {
          const body = await res.text().catch(() => '');
          newResults[svc.key] = { status: 'error', time: elapsed, detail: `${res.status}: ${body.slice(0, 100)}` };
        }
      } catch (e) {
        const elapsed = Math.round(performance.now() - start);
        newResults[svc.key] = { status: 'error', time: elapsed, detail: e.message };
      }
      setResults({ ...newResults });
    }

    // Also fetch /api/status for service-level detail
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        setStatusData(await res.json());
      }
    } catch {
      setStatusData(null);
    }

    setChecking(false);
  }, []);

  useEffect(() => {
    if (visible) runChecks();
  }, [visible, runChecks]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
      background: '#fff', borderLeft: '1px solid #e2e0dc',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.08)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: '1px solid #e2e0dc',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#2c2c2c' }}>
          Debug Panel
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={runChecks} disabled={checking}
            style={{ padding: '3px 10px', fontSize: 10 }}>
            {checking ? 'Checking...' : 'Re-check'}
          </button>
          <button className="btn" onClick={onClose}
            style={{ padding: '3px 10px', fontSize: 10 }}>
            Close
          </button>
        </div>
      </div>

      {/* Service checks */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#9a9a9a', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
          Endpoint Health
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SERVICE_CHECKS.map((svc) => {
            const r = results[svc.key] || { status: 'unchecked' };
            return (
              <div key={svc.key} style={{
                padding: '10px 12px', background: '#fafaf8', borderRadius: 6,
                border: '1px solid #e2e0dc',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <StatusDot status={r.status} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#2c2c2c', flex: 1 }}>
                    {svc.label}
                  </span>
                  {r.time != null && (
                    <span style={{ fontSize: 10, color: '#9a9a9a' }}>{r.time}ms</span>
                  )}
                </div>
                {r.detail && (
                  <div style={{ fontSize: 10, color: r.status === 'error' ? '#b5403a' : '#6b6b6b', marginLeft: 16 }}>
                    {r.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Service-level status from /api/status */}
        {statusData && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9a9a9a', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 20, marginBottom: 12 }}>
              Service Configuration
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(statusData.services || {}).map(([key, val]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', background: '#fafaf8', borderRadius: 6,
                  border: '1px solid #e2e0dc',
                }}>
                  <StatusDot status={val.status === 'ok' ? 'ok' : val.status === 'unconfigured' || val.status === 'demo_mode' ? 'loading' : 'error'} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#2c2c2c', flex: 1 }}>
                    {key}
                  </span>
                  <span style={{ fontSize: 10, color: '#6b6b6b' }}>
                    {val.detail || val.status}
                  </span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 11,
              background: statusData.overall === 'ok' ? 'rgba(61,122,74,0.08)' : 'rgba(192,138,48,0.08)',
              color: statusData.overall === 'ok' ? '#3d7a4a' : '#c08a30',
              fontWeight: 500,
            }}>
              Overall: {statusData.overall === 'ok' ? 'All services operational' : 'Some services degraded'}
            </div>
          </>
        )}

        {/* Info */}
        <div style={{ marginTop: 20, fontSize: 10, color: '#9a9a9a', lineHeight: 1.5 }}>
          Press Ctrl+Shift+D to toggle this panel.
          Green = healthy, Yellow = degraded/unconfigured, Red = error.
        </div>
      </div>
    </div>
  );
}
