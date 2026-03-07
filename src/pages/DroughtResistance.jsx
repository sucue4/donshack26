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

const DROUGHT_STATUS_LABELS = {
  none: 'None',
  abnormally_dry: 'Abnormally Dry',
  moderate: 'Moderate Drought',
  severe: 'Severe Drought',
  extreme: 'Extreme Drought',
  exceptional: 'Exceptional Drought',
};

const DROUGHT_STATUS_COLORS = {
  none: 'var(--status-good)',
  abnormally_dry: 'var(--status-info)',
  moderate: 'var(--status-warning)',
  severe: 'var(--status-danger)',
  extreme: 'var(--status-danger)',
  exceptional: 'var(--status-danger)',
};

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

  const runAnalysis = async () => {
    if (!selectedField) return;
    const profile = getProfile(selectedField.id);
    if (!profile) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analysis/drought', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(selectedField, profile)),
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

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
    setAnalysis(null);
  };

  const noFields = fields.length === 0;
  const needsOnboarding = selectedField && !isOnboarded(selectedField.id);

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
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {selectedField ? `${selectedField.lat}, ${selectedField.lon}` : ''}
            </span>
            {!needsOnboarding && (
              <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ padding: '5px 14px', fontSize: 11 }}>
                {loading ? 'Analyzing...' : 'Run Analysis'}
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
              <HudPanel title="Drought Assessment" className="mb-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
                  <GradeBadge grade={analysis.grade} size="large" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Drought Grade</span>
                      <RiskBadge level={analysis.risk_level} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{analysis.summary}</div>
                  </div>
                </div>
              </HudPanel>

              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard
                  label="Drought Status"
                  value={DROUGHT_STATUS_LABELS[analysis.current_drought_status] || analysis.current_drought_status}
                  change="Current conditions"
                  changeType={analysis.current_drought_status === 'none' ? 'positive' : 'negative'}
                />
                <MetricCard label="30-Day Outlook" value={analysis.drought_outlook_30_day || '--'} change="Short-term forecast" changeType="neutral" />
                <MetricCard label="90-Day Outlook" value={analysis.drought_outlook_90_day || '--'} change="Long-term forecast" changeType="neutral" />
                <MetricCard label="Resistant Crops" value={(analysis.resistant_crop_suggestions || []).length.toString()} change="Suggestions available" changeType="neutral" />
              </div>

              <div className="grid-2" style={{ marginBottom: 18 }}>
                <HudPanel title="Current Drought Status">
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '8px 20px',
                      borderRadius: 8,
                      background: DROUGHT_STATUS_COLORS[analysis.current_drought_status] || 'var(--text-dim)',
                      color: '#fff',
                      fontSize: 16,
                      fontWeight: 700,
                    }}>
                      {DROUGHT_STATUS_LABELS[analysis.current_drought_status] || analysis.current_drought_status}
                    </div>
                  </div>
                </HudPanel>

                <HudPanel title="Soil Moisture Assessment">
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 0' }}>
                    {analysis.soil_moisture_assessment}
                  </div>
                </HudPanel>
              </div>

              {analysis.resistant_crop_suggestions && analysis.resistant_crop_suggestions.length > 0 && (
                <HudPanel title="Drought-Resistant Crop Suggestions" className="mb-3">
                  {analysis.resistant_crop_suggestions.map((s) => (
                    <div key={s.crop} style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.crop}</span>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 10,
                          background: s.water_requirement === 'low' ? 'var(--status-good)' : s.water_requirement === 'high' ? 'var(--status-danger)' : 'var(--status-warning)',
                          color: '#fff', fontWeight: 600, textTransform: 'uppercase',
                        }}>
                          {s.water_requirement} water
                        </span>
                      </div>
                      <ScoreBar score={s.drought_tolerance_score} label="Drought Tolerance Score" />
                      {s.expected_yield_under_drought && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                          Expected yield under drought: {s.expected_yield_under_drought}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{s.rationale}</div>
                    </div>
                  ))}
                </HudPanel>
              )}

              {analysis.water_conservation_recommendations && analysis.water_conservation_recommendations.length > 0 && (
                <HudPanel title="Water Conservation Recommendations">
                  <RecommendationList items={analysis.water_conservation_recommendations} />
                </HudPanel>
              )}
            </>
          )}

          {!analysis && !loading && !error && !needsOnboarding && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
              <div style={{ fontSize: 12 }}>
                Click "Run Analysis" to get drought resistance data and water-efficient crop recommendations.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
