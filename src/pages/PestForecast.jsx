import React, { useState, useEffect } from 'react';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, ScoreBar, RecommendationList, DataTable } from '../components/YieldWidgets';
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

export default function PestForecast() {
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
      const res = await fetch('/api/analysis/pest', {
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
    const cached = getCachedCategory(selectedField.id, 'pest');
    if (cached) {
      setAnalysis(cached);
      return;
    }
    runAnalysis(selectedField);
  }, [selectedField?.id]);

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
    setAnalysis(null);
  };

  const noFields = fields.length === 0;
  const needsOnboarding = selectedField && !isOnboarded(selectedField.id);

  const threats = analysis?.active_threats || [];
  const spreadRisks = analysis?.regional_spread_risks || [];
  const cropSuggestions = analysis?.low_impact_crop_suggestions || [];
  const preventive = analysis?.preventive_recommendations || [];

  return (
    <div className="fade-in">
      <p className="page-subtitle">Pest threat analysis and resistance-based crop recommendations</p>

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
              <button className="btn btn-primary" onClick={() => runAnalysis()} disabled={loading} style={{ padding: '5px 14px', fontSize: 11 }}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>

          {needsOnboarding && (
            <div className="data-notice" style={{ textAlign: 'center', padding: 24 }}>
              Complete your farm profile for this field before running pest analysis.
            </div>
          )}

          {error && (
            <div className="data-notice data-notice-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Analyzing pest threats and regional spread risks...
              </div>
            </div>
          )}

          {analysis && !loading && (
            <>
              <div className="assessment-banner">
                <GradeBadge grade={analysis.grade} size="large" />
                <div className="assessment-info">
                  <div className="assessment-title-row">
                    <h2 className="assessment-title">Pest Assessment</h2>
                    <RiskBadge level={analysis.risk_level} />
                  </div>
                  <p className="assessment-summary">{(analysis.summary || '').replace(/\s*—\s*/g, ' - ')}</p>
                </div>
              </div>

              <div className="metric-grid mb-3">
                <MetricCard label="Active Threats" value={threats.length.toString()} change="Detected pests" changeType="neutral" />
                <MetricCard label="Regional Risks" value={spreadRisks.length.toString()} change="Nearby threats" changeType="neutral" />
                <MetricCard label="Resistant Crops" value={cropSuggestions.length.toString()} change="Low-impact options" changeType="neutral" />
              </div>

              {threats.length > 0 && (
                <HudPanel title="Active Threats" className="mb-3">
                  {threats.map((t) => (
                    <div key={t.pest_name} className="crop-card">
                      <div className="crop-card-header">
                        <span className="crop-card-name">{t.pest_name}</span>
                        <RiskBadge level={t.risk_level} />
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                          {t.threat_type} · {t.source_direction}
                        </span>
                      </div>
                      <div className="crop-card-detail">{t.description}</div>
                      {(t.affected_crops || []).length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {t.affected_crops.map((c) => (
                            <span key={c} style={{
                              padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                              background: 'rgba(61,122,74,0.1)', color: 'var(--accent-primary)',
                            }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </HudPanel>
              )}

              {spreadRisks.length > 0 && (
                <HudPanel title="Regional Spread Risks" className="mb-3">
                  <DataTable
                    headers={['Pest', 'Type', 'Risk Level', 'Affected Crops', 'Source', 'Description']}
                    rows={spreadRisks.map((r) => [
                      <span key={r.pest_name} style={{ fontWeight: 600 }}>{r.pest_name}</span>,
                      r.threat_type,
                      <RiskBadge key={`risk-${r.pest_name}`} level={r.risk_level} />,
                      (r.affected_crops || []).join(', '),
                      r.source_direction,
                      r.description,
                    ])}
                  />
                </HudPanel>
              )}

              {cropSuggestions.length > 0 && (
                <HudPanel title="Low-Impact Crop Suggestions" className="mb-3">
                  {cropSuggestions.map((s) => (
                    <div key={s.crop} className="crop-card">
                      <div className="crop-card-header">
                        <span className="crop-card-name">{s.crop}</span>
                      </div>
                      <ScoreBar score={s.pest_resistance_score} label="Pest Resistance Score" />
                      <div className="crop-card-detail">{s.rationale}</div>
                    </div>
                  ))}
                </HudPanel>
              )}

              {preventive.length > 0 && (
                <HudPanel title="Preventive Recommendations">
                  <RecommendationList items={preventive} />
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Refresh" to get pest forecasting data and crop resistance recommendations.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
