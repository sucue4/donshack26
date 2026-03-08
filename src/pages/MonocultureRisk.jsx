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
              <HudPanel title="Monoculture Assessment" className="mb-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
                  <GradeBadge grade={analysis.grade} size="large" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Monoculture Grade</span>
                      <RiskBadge level={analysis.risk_level} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{analysis.summary}</div>
                  </div>
                </div>
              </HudPanel>

              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard label="Grade" value={analysis.grade} change="Monoculture assessment" changeType="neutral" />
                <MetricCard label="Risk Level" value={analysis.risk_level} change="Current status" changeType={analysis.risk_level === 'low' ? 'positive' : analysis.risk_level === 'critical' ? 'negative' : 'neutral'} />
                <MetricCard label="Same Crop Years" value={(analysis.consecutive_same_crop_years || 0).toString()} unit="yr" change="Consecutive seasons" changeType={analysis.consecutive_same_crop_years > 2 ? 'negative' : 'positive'} />
                <MetricCard label="Diversification Options" value={(analysis.diversification_suggestions || []).length.toString()} change="Crop suggestions" changeType="neutral" />
              </div>

              <div className="grid-2" style={{ marginBottom: 18 }}>
                <HudPanel title="Monoculture Risk Score">
                  <ScoreBar score={analysis.risk_score || 0} label="Risk Score (higher = more risk)" />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                    Score reflects the degree of monoculture risk based on crop history and regional data.
                  </div>
                </HudPanel>

                <HudPanel title="Crop History">
                  {analysis.farmer_crop_history && analysis.farmer_crop_history.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
                      {analysis.farmer_crop_history.map((crop, i) => (
                        <span key={i} style={{
                          padding: '4px 12px',
                          borderRadius: 6,
                          background: 'var(--bg-input)',
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
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No crop history available</div>
                  )}
                </HudPanel>
              </div>

              {analysis.regional_crop_data && analysis.regional_crop_data.length > 0 && (
                <HudPanel title="Regional Crop Data" className="mb-3">
                  <DataTable
                    headers={['Region', 'Primary Crop', 'Crop %', 'Acreage']}
                    rows={analysis.regional_crop_data.map((r) => [
                      r.region,
                      r.primary_crop,
                      <span key={r.region} style={{ fontWeight: 600, color: r.crop_percentage > 60 ? 'var(--status-danger)' : 'var(--status-good)' }}>
                        {r.crop_percentage}%
                      </span>,
                      r.acreage.toLocaleString(),
                    ])}
                  />
                </HudPanel>
              )}

              {analysis.diversification_suggestions && analysis.diversification_suggestions.length > 0 && (
                <HudPanel title="Diversification Suggestions" className="mb-3">
                  {analysis.diversification_suggestions.map((s) => (
                    <div key={s.crop} style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.crop}</span>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 10,
                          background: ROTATION_FIT_COLORS[s.rotation_fit] || 'var(--text-dim)',
                          color: '#fff', fontWeight: 600, textTransform: 'uppercase',
                        }}>
                          {s.rotation_fit} fit
                        </span>
                        {s.estimated_yield_benefit_pct != null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--status-good)' }}>
                            +{s.estimated_yield_benefit_pct}% yield
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{s.benefit}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.rationale}</div>
                    </div>
                  ))}
                </HudPanel>
              )}

              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <HudPanel title="Recommendations">
                  <RecommendationList items={analysis.recommendations} />
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Run Analysis" to get monoculture risk data and crop diversification recommendations.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
