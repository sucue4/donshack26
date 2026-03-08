import React, { useState, useEffect } from 'react';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, ScoreBar, RecommendationList, DataTable } from '../components/YieldWidgets';
import { getFields } from '../fieldStore';
import { getProfile, isOnboarded } from '../farmProfileStore';

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

  const runAnalysis = async (field) => {
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
    if (selectedField && isOnboarded(selectedField.id)) {
      runAnalysis(selectedField);
    }
  }, [selectedField?.id]);

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
    setAnalysis(null);
  };

  const noFields = fields.length === 0;
  const needsOnboarding = selectedField && !isOnboarded(selectedField.id);

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
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {selectedField ? `${selectedField.lat}, ${selectedField.lon}` : ''}
            </span>
            {!needsOnboarding && (
              <button className="btn btn-primary" onClick={() => runAnalysis()} disabled={loading} style={{ padding: '5px 14px', fontSize: 11 }}>
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
              <HudPanel title="Weather Assessment" className="mb-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
                  <GradeBadge grade={analysis.grade} size="large" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Weather Grade</span>
                      <RiskBadge level={analysis.risk_level} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{analysis.summary}</div>
                  </div>
                </div>
              </HudPanel>

              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard label="Grade" value={analysis.grade} change="Weather assessment" changeType="neutral" />
                <MetricCard label="Risk Level" value={analysis.risk_level} change="Current conditions" changeType={analysis.risk_level === 'low' ? 'positive' : analysis.risk_level === 'critical' ? 'negative' : 'neutral'} />
                <MetricCard label="Upcoming Events" value={(analysis.upcoming_events || []).length.toString()} change="Forecast period" changeType="neutral" />
                <MetricCard label="Crops Impacted" value={(analysis.crop_impacts || []).length.toString()} change="Affected crops" changeType="neutral" />
              </div>

              {analysis.upcoming_events && analysis.upcoming_events.length > 0 && (
                <HudPanel title="Upcoming Weather Events" className="mb-3">
                  <DataTable
                    headers={['Date', 'Event Type', 'Severity', 'Description']}
                    rows={analysis.upcoming_events.map((evt) => [
                      evt.date,
                      evt.event_type,
                      evt.severity,
                      evt.description,
                    ])}
                  />
                </HudPanel>
              )}

              {analysis.crop_impacts && analysis.crop_impacts.length > 0 && (
                <HudPanel title="Crop Impact Simulation" className="mb-3">
                  <DataTable
                    headers={['Crop', 'Impact', 'Yield Impact %', 'Mitigation Action']}
                    rows={analysis.crop_impacts.map((ci) => [
                      ci.crop,
                      ci.impact_description,
                      <span key={ci.crop} style={{ color: ci.estimated_yield_impact_pct < 0 ? 'var(--status-danger)' : 'var(--status-good)', fontWeight: 600 }}>
                        {ci.estimated_yield_impact_pct > 0 ? '+' : ''}{ci.estimated_yield_impact_pct}%
                      </span>,
                      ci.mitigation_action,
                    ])}
                  />
                </HudPanel>
              )}

              {analysis.mitigation_recommendations && analysis.mitigation_recommendations.length > 0 && (
                <HudPanel title="Mitigation Recommendations">
                  <RecommendationList items={analysis.mitigation_recommendations} />
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Run Analysis" to get weather forecasting data and crop impact assessments.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
