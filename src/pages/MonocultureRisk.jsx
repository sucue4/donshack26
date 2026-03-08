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

const ROTATION_FIT_COLORS = {
  excellent: 'var(--status-good)',
  good: 'var(--status-info)',
  fair: 'var(--status-warning)',
};

export default function MonocultureRisk() {
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
      const res = await fetch('/api/analysis/monoculture', {
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
    const cached = getCachedCategory(selectedField.id, 'monoculture');
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

  const history = analysis?.farmer_crop_history || [];
  const regional = analysis?.regional_crop_data || [];
  const diversify = analysis?.diversification_suggestions || [];
  const recs = analysis?.recommendations || [];

  return (
    <div className="fade-in">
      <p className="page-subtitle">Monoculture risk assessment and crop diversification recommendations</p>

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
              Complete your farm profile for this field before running monoculture analysis.
            </div>
          )}

          {error && (
            <div className="data-notice data-notice-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Analyzing crop rotation patterns and monoculture risks...
              </div>
            </div>
          )}

          {analysis && !loading && (
            <>
              <div className="assessment-banner">
                <GradeBadge grade={analysis.grade} size="large" />
                <div className="assessment-info">
                  <div className="assessment-title-row">
                    <h2 className="assessment-title">Monoculture Assessment</h2>
                    <RiskBadge level={analysis.risk_level} />
                  </div>
                  <p className="assessment-summary">{(analysis.summary || '').replace(/\s*—\s*/g, ' - ')}</p>
                </div>
              </div>

              <div className="metric-grid mb-3">
                <MetricCard label="Risk Score" value={(analysis.risk_score || 0).toString()} unit="/100" change="Monoculture risk index" changeType={analysis.risk_score > 50 ? 'negative' : analysis.risk_score > 25 ? 'neutral' : 'positive'} />
                <MetricCard label="Same Crop Years" value={(analysis.consecutive_same_crop_years || 0).toString()} unit="yr" change="Consecutive seasons" changeType={analysis.consecutive_same_crop_years > 2 ? 'negative' : 'positive'} />
                <MetricCard label="Alternatives" value={diversify.length.toString()} change="Diversification options" changeType="neutral" />
              </div>

              <div className="grid-2 mb-3">
                <HudPanel title="Crop History">
                  {history.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {history.map((crop, i) => (
                        <span key={i} style={{
                          padding: '6px 14px',
                          borderRadius: 6,
                          background: 'var(--bg-tertiary)',
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                        }}>
                          {crop}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No crop history available</div>
                  )}
                </HudPanel>

                <HudPanel title="Risk Score Breakdown">
                  <ScoreBar score={analysis.risk_score || 0} label="Risk Score (higher = more risk)" />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                    Based on crop history and regional diversity data.
                  </div>
                </HudPanel>
              </div>

              {regional.length > 0 && (
                <HudPanel title="Regional Crop Data" className="mb-3">
                  <DataTable
                    headers={['Region', 'Primary Crop', 'Crop %', 'Acreage']}
                    rows={regional.map((r) => [
                      r.region,
                      r.primary_crop,
                      <span key={r.region} style={{ fontWeight: 600, color: r.crop_percentage > 60 ? 'var(--status-danger)' : 'var(--status-good)' }}>
                        {r.crop_percentage}%
                      </span>,
                      r.acreage ? r.acreage.toLocaleString() : '-',
                    ])}
                  />
                </HudPanel>
              )}

              {diversify.length > 0 && (
                <HudPanel title="Diversification Suggestions" className="mb-3">
                  {diversify.map((s) => (
                    <div key={s.crop} className="crop-card">
                      <div className="crop-card-header">
                        <span className="crop-card-name">{s.crop}</span>
                        <span className="crop-card-tag" style={{
                          background: ROTATION_FIT_COLORS[s.rotation_fit] || 'var(--text-dim)',
                        }}>
                          {s.rotation_fit} fit
                        </span>
                        {s.estimated_yield_benefit_pct != null && (
                          <span className="crop-card-stat" style={{ color: 'var(--status-good)' }}>
                            +{s.estimated_yield_benefit_pct}% yield
                          </span>
                        )}
                      </div>
                      <div className="crop-card-detail">{s.benefit}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{s.rationale}</div>
                    </div>
                  ))}
                </HudPanel>
              )}

              {recs.length > 0 && (
                <HudPanel title="Recommendations">
                  <RecommendationList items={recs} />
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Refresh" to get monoculture risk data and crop diversification recommendations.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
