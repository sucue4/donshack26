import React, { useState, useEffect } from 'react';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, ScoreBar, RecommendationList, DataTable } from '../components/YieldWidgets';
import { getFields } from '../fieldStore';
import { getProfile, isOnboarded } from '../farmProfileStore';

const TREND_COLORS = {
  improving: 'var(--status-good)',
  stable: 'var(--status-info)',
  declining: 'var(--status-danger)',
};

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
              <HudPanel title="Soil Health Assessment" className="mb-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
                  <GradeBadge grade={analysis.grade} size="large" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Soil Grade</span>
                      <RiskBadge level={analysis.risk_level} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{analysis.summary}</div>
                  </div>
                </div>
              </HudPanel>

              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard label="Grade" value={analysis.grade} change="Soil assessment" changeType="neutral" />
                <MetricCard label="Risk Level" value={analysis.risk_level} change="Current conditions" changeType={analysis.risk_level === 'low' ? 'positive' : analysis.risk_level === 'critical' ? 'negative' : 'neutral'} />
                <MetricCard
                  label="Organic Matter"
                  value={analysis.organic_matter_trend || '--'}
                  change="Trend direction"
                  changeType={analysis.organic_matter_trend === 'improving' ? 'positive' : analysis.organic_matter_trend === 'declining' ? 'negative' : 'neutral'}
                />
                <MetricCard label="Nutrients Tracked" value={(analysis.nutrient_levels || []).length.toString()} change="Measured nutrients" changeType="neutral" />
              </div>

              <div className="grid-2" style={{ marginBottom: 18 }}>
                <HudPanel title="pH Assessment">
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 0' }}>
                    {analysis.ph_assessment}
                  </div>
                </HudPanel>

                <HudPanel title="Organic Matter Trend">
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '8px 20px',
                      borderRadius: 8,
                      background: TREND_COLORS[analysis.organic_matter_trend] || 'var(--text-dim)',
                      color: '#fff',
                      fontSize: 16,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                    }}>
                      {analysis.organic_matter_trend}
                    </div>
                  </div>
                </HudPanel>
              </div>

              {analysis.nutrient_levels && analysis.nutrient_levels.length > 0 && (
                <HudPanel title="Nutrient Levels" className="mb-3">
                  <DataTable
                    headers={['Nutrient', 'Current Level', 'Value', 'Unit', 'Recommendation']}
                    rows={analysis.nutrient_levels.map((n) => [
                      <span key={n.nutrient} style={{ fontWeight: 600 }}>{n.nutrient}</span>,
                      n.current_level,
                      n.value,
                      n.unit,
                      n.recommendation,
                    ])}
                  />
                </HudPanel>
              )}

              <HudPanel title="Fertilizer Impact Assessment" className="mb-3">
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 0' }}>
                  {analysis.fertilizer_impact_assessment}
                </div>
              </HudPanel>

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
                Click "Run Analysis" to get soil health data, nutrient levels, and fertilizer impact assessments.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
