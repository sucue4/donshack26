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
              <HudPanel title="Pest Assessment" className="mb-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
                  <GradeBadge grade={analysis.grade} size="large" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Pest Grade</span>
                      <RiskBadge level={analysis.risk_level} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{analysis.summary}</div>
                  </div>
                </div>
              </HudPanel>

              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard label="Grade" value={analysis.grade} change="Pest assessment" changeType="neutral" />
                <MetricCard label="Risk Level" value={analysis.risk_level} change="Current conditions" changeType={analysis.risk_level === 'low' ? 'positive' : analysis.risk_level === 'critical' ? 'negative' : 'neutral'} />
                <MetricCard label="Active Threats" value={(analysis.active_threats || []).length.toString()} change="Detected pests" changeType="neutral" />
                <MetricCard label="Regional Risks" value={(analysis.regional_spread_risks || []).length.toString()} change="Nearby threats" changeType="neutral" />
              </div>

              {analysis.active_threats && analysis.active_threats.length > 0 && (
                <HudPanel title="Active Threats" className="mb-3">
                  <DataTable
                    headers={['Pest', 'Type', 'Risk Level', 'Affected Crops', 'Source Direction', 'Description']}
                    rows={analysis.active_threats.map((t) => [
                      <span key={t.pest_name} style={{ fontWeight: 600 }}>{t.pest_name}</span>,
                      t.threat_type,
                      <RiskBadge key={`risk-${t.pest_name}`} level={t.risk_level} />,
                      (t.affected_crops || []).join(', '),
                      t.source_direction,
                      t.description,
                    ])}
                  />
                </HudPanel>
              )}

              {analysis.regional_spread_risks && analysis.regional_spread_risks.length > 0 && (
                <HudPanel title="Regional Spread Risks" className="mb-3">
                  <DataTable
                    headers={['Pest', 'Type', 'Risk Level', 'Affected Crops', 'Source Direction', 'Description']}
                    rows={analysis.regional_spread_risks.map((r) => [
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

              {analysis.low_impact_crop_suggestions && analysis.low_impact_crop_suggestions.length > 0 && (
                <HudPanel title="Low-Impact Crop Suggestions" className="mb-3">
                  {analysis.low_impact_crop_suggestions.map((s) => (
                    <div key={s.crop} style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.crop}</span>
                      </div>
                      <ScoreBar score={s.pest_resistance_score} label="Pest Resistance Score" />
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{s.rationale}</div>
                    </div>
                  ))}
                </HudPanel>
              )}

              {analysis.preventive_recommendations && analysis.preventive_recommendations.length > 0 && (
                <HudPanel title="Preventive Recommendations">
                  <RecommendationList items={analysis.preventive_recommendations} />
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Run Analysis" to get pest forecasting data and crop resistance recommendations.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
