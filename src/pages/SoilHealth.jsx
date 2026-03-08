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

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '--';
}

export default function SoilHealth() {
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
      const res = await fetch('/api/analysis/soil', {
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
    const cached = getCachedCategory(selectedField.id, 'soil');
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

  const nutrients = analysis?.nutrient_levels || [];
  const recs = analysis?.recommendations || [];
  const trend = analysis?.organic_matter_trend;

  return (
    <div className="fade-in">
      <p className="page-subtitle">Soil health analysis with nutrient levels, pH assessment, and fertilizer impact</p>

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
              Complete your farm profile for this field before running soil analysis.
            </div>
          )}

          {error && (
            <div className="data-notice data-notice-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Analyzing soil health and nutrient levels...
              </div>
            </div>
          )}

          {analysis && !loading && (
            <>
              <div className="assessment-banner">
                <GradeBadge grade={analysis.grade} size="large" />
                <div className="assessment-info">
                  <div className="assessment-title-row">
                    <h2 className="assessment-title">Soil Health Assessment</h2>
                    <RiskBadge level={analysis.risk_level} />
                  </div>
                  <p className="assessment-summary">{(analysis.summary || '').replace(/\s*—\s*/g, ' - ')}</p>
                </div>
              </div>

              <div className="metric-grid mb-3">
                <MetricCard
                  label="Organic Matter"
                  value={cap(trend)}
                  change="Current trend"
                  changeType={trend === 'improving' ? 'positive' : trend === 'declining' ? 'negative' : 'neutral'}
                />
                <MetricCard label="Nutrients Tracked" value={nutrients.length.toString()} change="Measured levels" changeType="neutral" />
                <MetricCard label="Recommendations" value={recs.length.toString()} change="Action items" changeType="neutral" />
              </div>

              {analysis.ph_assessment && (
                <HudPanel title="pH Assessment" className="mb-3">
                  <div className="info-block">
                    {(analysis.ph_assessment || '').replace(/\s*—\s*/g, ' - ')}
                  </div>
                </HudPanel>
              )}

              {nutrients.length > 0 && (
                <HudPanel title="Nutrient Levels" className="mb-3">
                  <DataTable
                    headers={['Nutrient', 'Current Level', 'Value', 'Unit', 'Recommendation']}
                    rows={nutrients.map((n) => [
                      <span key={n.nutrient} style={{ fontWeight: 600 }}>{n.nutrient}</span>,
                      n.current_level,
                      n.value,
                      n.unit,
                      n.recommendation,
                    ])}
                  />
                </HudPanel>
              )}

              {analysis.fertilizer_impact_assessment && (
                <HudPanel title="Fertilizer Impact Assessment" className="mb-3">
                  <div className="info-block">
                    {(analysis.fertilizer_impact_assessment || '').replace(/\s*—\s*/g, ' - ')}
                  </div>
                </HudPanel>
              )}

              {recs.length > 0 && (
                <HudPanel title="Recommendations">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recs.map((rec, i) => {
                      const cleanRec = rec.replace(/\s*—\s*/g, ' - ');
                      const isPH = /ph|lime|acid|alkalin/i.test(cleanRec);
                      const isNutrient = /nitrogen|phosph|potassium|nutrient|fertili|NPK/i.test(cleanRec);
                      const isOrganic = /organic|carbon|compost|cover crop|SOC/i.test(cleanRec);
                      const dotColor = isPH ? '#4a7a8c' : isNutrient ? 'var(--status-warning)' : isOrganic ? 'var(--status-good)' : 'var(--accent-primary)';
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
                Click "Refresh" to get soil health data, nutrient levels, and fertilizer impact assessments.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
