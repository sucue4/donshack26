import React, { useState, useEffect } from 'react';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, DataTable } from '../components/YieldWidgets';
import { getFields } from '../fieldStore';
import { getProfile, isOnboarded } from '../farmProfileStore';
import { getCachedCategory } from '../analysisStore';

function buildRequestBody(field, profile) {
  return {
    field_id: field.id,
    crop_zones: (profile.cropZones || []).map((z) => ({
      zone_name: z.zone_name,
      crops_by_year: z.crops_by_year,
    })),
    fertilizers_used: profile.fertilizers || [],
    lat: field.lat,
    lon: field.lon,
  };
}

export default function WeatherForecast() {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const fetchFromAPI = async (field) => {
    const f = field || selectedField;
    if (!f) return;
    const profile = getProfile(f.id);
    if (!profile) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analysis/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(f, profile)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (e) {
      setError(e.message);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!selectedField || !isOnboarded(selectedField.id)) return;
    const cached = getCachedCategory(selectedField.id, 'weather');
    if (cached) {
      setAnalysis(cached);
      return;
    }
    fetchFromAPI(selectedField);
  }, [selectedField?.id]);

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
    setAnalysis(null);
  };

  const noFields = fields.length === 0;
  const needsOnboarding = selectedField && !isOnboarded(selectedField.id);

  const events = analysis?.upcoming_events || [];
  const impacts = analysis?.crop_impacts || [];
  const mitigations = analysis?.mitigation_recommendations || [];

  return (
    <div className="fade-in">
      <p className="page-subtitle">Weather impact analysis and crop mitigation recommendations</p>

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
            {!needsOnboarding && (
              <button className="btn btn-primary" onClick={() => fetchFromAPI()} disabled={loading} style={{ padding: '5px 14px', fontSize: 11 }}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>

          {needsOnboarding && (
            <div className="data-notice" style={{ textAlign: 'center', padding: 24 }}>
              Complete your farm profile for this field before running weather analysis.
            </div>
          )}

          {error && (
            <div className="data-notice data-notice-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Analyzing weather conditions and crop impacts...
              </div>
            </div>
          )}

          {analysis && !loading && (
            <>
              <div className="assessment-banner">
                <GradeBadge grade={analysis.grade} size="large" />
                <div className="assessment-info">
                  <div className="assessment-title-row">
                    <h2 className="assessment-title">Weather Assessment</h2>
                    <RiskBadge level={analysis.risk_level} />
                  </div>
                  <p className="assessment-summary">{(analysis.summary || '').replace(/\s*—\s*/g, ' - ')}</p>
                </div>
              </div>

              <div className="metric-grid mb-3">
                <MetricCard label="Weather Events" value={events.length.toString()} change="Forecast period" changeType="neutral" />
                <MetricCard label="Crops Analyzed" value={impacts.length.toString()} change="Impact assessment" changeType="neutral" />
                <MetricCard label="Action Items" value={mitigations.length.toString()} change="Mitigation steps" changeType="neutral" />
              </div>

              {events.length > 0 && (
                <HudPanel title="Upcoming Weather Events" className="mb-3">
                  <DataTable
                    headers={['Date', 'Event Type', 'Severity', 'Description']}
                    rows={events.map((evt) => [
                      evt.date,
                      evt.event_type,
                      evt.severity,
                      evt.description,
                    ])}
                  />
                </HudPanel>
              )}

              {impacts.length > 0 && (
                <HudPanel title="Crop Impact Simulation" className="mb-3">
                  {impacts.map((ci) => (
                    <div key={ci.crop} className="crop-card">
                      <div className="crop-card-header">
                        <span className="crop-card-name">{ci.crop}</span>
                        <span className="crop-card-tag" style={{
                          background: ci.estimated_yield_impact_pct < -5 ? 'var(--status-danger)'
                            : ci.estimated_yield_impact_pct < 0 ? 'var(--status-warning)'
                            : 'var(--status-good)',
                        }}>
                          {ci.estimated_yield_impact_pct >= 0 ? 'Favorable' : ci.estimated_yield_impact_pct > -5 ? 'Minor Impact' : 'At Risk'}
                        </span>
                        <span className="crop-card-stat" style={{
                          color: ci.estimated_yield_impact_pct < 0 ? 'var(--status-danger)' : 'var(--status-good)',
                        }}>
                          {ci.estimated_yield_impact_pct > 0 ? '+' : ''}{ci.estimated_yield_impact_pct}% yield
                        </span>
                      </div>
                      <div className="crop-card-detail">{ci.impact_description}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{ci.mitigation_action}</div>
                    </div>
                  ))}
                </HudPanel>
              )}

              {mitigations.length > 0 && (
                <HudPanel title="Mitigation Recommendations" className="mb-3">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mitigations.map((rec, i) => {
                      const cleanRec = rec.replace(/\s*—\s*/g, ' - ');
                      const isFrost = /frost/i.test(cleanRec);
                      const isHeat = /heat|temperature/i.test(cleanRec);
                      const isWater = /irrigat|moisture|water|deficit|drainage/i.test(cleanRec);
                      const isWind = /wind|lodging/i.test(cleanRec);
                      const dotColor = isFrost ? '#4a7a8c' : isHeat ? 'var(--status-danger)' : isWater ? 'var(--status-warning)' : isWind ? '#8b6914' : 'var(--status-good)';
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          padding: '12px 16px', borderRadius: 8,
                          background: 'var(--bg-tertiary)',
                        }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                            background: dotColor,
                          }} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {cleanRec}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Refresh" to get weather forecasting data and crop impact assessments.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
