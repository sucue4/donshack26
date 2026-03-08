import React, { useState, useEffect } from 'react';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, ScoreBar, RecommendationList } from '../components/YieldWidgets';
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

const DROUGHT_STATUS_LABELS = {
  none: 'None',
  abnormally_dry: 'Abnormally Dry',
  moderate: 'Moderate Drought',
  severe: 'Severe Drought',
  extreme: 'Extreme Drought',
  exceptional: 'Exceptional Drought',
};

function summarizeOutlook(text) {
  if (!text || text === '--') return '--';
  const lower = text.toLowerCase();
  if (lower.includes('improv') || lower.includes('better') || lower.includes('relief')) return 'Improving';
  if (lower.includes('worsen') || lower.includes('deteriorat') || lower.includes('intensif')) return 'Worsening';
  if (lower.includes('persist') || lower.includes('continu') || lower.includes('remain')) return 'Persisting';
  if (lower.includes('stable') || lower.includes('unchang') || lower.includes('steady')) return 'Stable';
  if (lower.includes('no drought') || lower.includes('favorable') || lower.includes('normal')) return 'Favorable';
  const first = text.split(/[.!]/)[0].trim();
  return first.length > 20 ? first.slice(0, 18) + '...' : first;
}

function sanitize(text) {
  return (text || '').replace(/\s*—\s*/g, ' - ');
}

export default function DroughtResistance() {
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
      const res = await fetch('/api/analysis/drought', {
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
    const cached = getCachedCategory(selectedField.id, 'drought');
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

  const crops = analysis?.resistant_crop_suggestions || [];
  const waterRecs = analysis?.water_conservation_recommendations || [];

  return (
    <div className="fade-in">
      <p className="page-subtitle">Drought risk assessment and water-efficient crop recommendations</p>

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
              Complete your farm profile for this field before running drought analysis.
            </div>
          )}

          {error && (
            <div className="data-notice data-notice-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Analyzing drought conditions and soil moisture...
              </div>
            </div>
          )}

          {analysis && !loading && (
            <>
              <div className="assessment-banner">
                <GradeBadge grade={analysis.grade} size="large" />
                <div className="assessment-info">
                  <div className="assessment-title-row">
                    <h2 className="assessment-title">Drought Assessment</h2>
                    <RiskBadge level={analysis.risk_level} />
                  </div>
                  <p className="assessment-summary">{sanitize(analysis.summary)}</p>
                </div>
              </div>

              <div className="metric-grid mb-3">
                <MetricCard
                  label="Drought Status"
                  value={DROUGHT_STATUS_LABELS[analysis.current_drought_status] || analysis.current_drought_status}
                  change="Current conditions"
                  changeType={analysis.current_drought_status === 'none' ? 'positive' : 'negative'}
                />
                <MetricCard label="30-Day Outlook" value={summarizeOutlook(analysis.drought_outlook_30_day)} change="Short-term forecast" changeType="neutral" />
                <MetricCard label="90-Day Outlook" value={summarizeOutlook(analysis.drought_outlook_90_day)} change="Long-term forecast" changeType="neutral" />
                <MetricCard label="Resistant Crops" value={crops.length.toString()} change="Suggestions available" changeType="neutral" />
              </div>

              {analysis.soil_moisture_assessment && (
                <HudPanel title="Soil Moisture Assessment" className="mb-3">
                  <div className="info-block">
                    {sanitize(analysis.soil_moisture_assessment)}
                  </div>
                </HudPanel>
              )}

              {crops.length > 0 && (
                <HudPanel title="Drought-Resistant Crop Suggestions" className="mb-3">
                  {[...crops]
                    .sort((a, b) => (b.drought_tolerance_score || 0) - (a.drought_tolerance_score || 0))
                    .map((s) => (
                    <div key={s.crop} className="crop-card">
                      <div className="crop-card-header">
                        <span className="crop-card-name">{s.crop}</span>
                        <span className="crop-card-tag" style={{
                          background: s.water_requirement === 'low' ? 'var(--status-good)' : s.water_requirement === 'high' ? 'var(--status-danger)' : 'var(--status-warning)',
                        }}>
                          {s.water_requirement} water
                        </span>
                        {s.expected_yield_under_drought && (
                          <span className="crop-card-stat" style={{ color: 'var(--text-dim)' }}>
                            Yield under drought: {s.expected_yield_under_drought}
                          </span>
                        )}
                      </div>
                      <ScoreBar score={s.drought_tolerance_score} label="Drought Tolerance Score" />
                      <div className="crop-card-detail">{s.rationale}</div>
                    </div>
                  ))}
                </HudPanel>
              )}

              {waterRecs.length > 0 && (
                <HudPanel title="Water Conservation Recommendations">
                  <RecommendationList items={waterRecs} />
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Refresh" to get drought resistance data and water-efficient crop recommendations.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
