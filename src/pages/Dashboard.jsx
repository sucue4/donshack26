import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, ScoreBar, CategoryCard, RecommendationList } from '../components/YieldWidgets';
import { getFields } from '../fieldStore';
import { getProfile, isOnboarded } from '../farmProfileStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadFields = () => {
      const f = getFields();
      setFields(f);
      if (f.length > 0 && !selectedField) {
        setSelectedField(f[0]);
      }
    };
    loadFields();
    window.addEventListener('ohdeere-fields-changed', loadFields);
    return () => window.removeEventListener('ohdeere-fields-changed', loadFields);
  }, []);

  const fetchAnalysis = async (field) => {
    if (!field) return;
    const profile = getProfile(field.id);
    if (!profile) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analysis/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: field.id,
          crop_zones: (profile.cropZones || []).map((z) => ({
            zone_name: z.zone_name,
            crops_by_year: z.crops_by_year,
          })),
          fertilizers_used: profile.fertilizers || [],
          lat: field.lat,
          lon: field.lon,
        }),
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

  // Auto-run analysis when field is ready (use prefetch if available)
  useEffect(() => {
    if (!selectedField || !isOnboarded(selectedField.id)) return;

    const prefetch = window.__ohdeereAnalysis;
    if (prefetch && String(prefetch.fieldId) === String(selectedField.id)) {
      window.__ohdeereAnalysis = null;
      setLoading(true);
      setError(null);
      prefetch.promise
        .then((data) => setAnalysis(data))
        .catch((e) => setError(typeof e === 'string' ? e : (e?.message || 'Analysis failed')))
        .finally(() => setLoading(false));
    } else {
      fetchAnalysis(selectedField);
    }
  }, [selectedField?.id]);

  const runAnalysis = () => fetchAnalysis(selectedField);

  const handleFieldSelect = (e) => {
    const field = fields.find((f) => f.id === Number(e.target.value) || f.id === e.target.value);
    if (field) setSelectedField(field);
    setAnalysis(null);
  };

  const noFields = fields.length === 0;
  const fieldProfile = selectedField ? getProfile(selectedField.id) : null;
  const needsOnboarding = selectedField && !isOnboarded(selectedField.id);
  const totalAcres = fields.reduce((sum, f) => sum + (f.acres || 0), 0);

  return (
    <div className="fade-in">
      <p className="page-subtitle">Yield rate analysis and optimization for your farm</p>

      {noFields ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Welcome to Oh Deere!
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Get started by setting up your farm profile.
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/onboarding')} style={{ padding: '12px 32px', fontSize: 14 }}>
            Start Farm Setup
          </button>
        </div>
      ) : (
        <>
          <div className="location-bar">
            <label>Field:</label>
            <select
              className="field-select"
              value={selectedField?.id || ''}
              onChange={handleFieldSelect}
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.acres} ac)</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {selectedField ? `${selectedField.lat}, ${selectedField.lon}` : ''}
            </span>
            {!needsOnboarding && (
              <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ padding: '5px 14px', fontSize: 11 }}>
                {loading ? 'Analyzing...' : 'Run Yield Analysis'}
              </button>
            )}
          </div>

          {needsOnboarding ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Complete your farm profile for {selectedField?.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                We need your crop history and fertilizer data to run yield analysis.
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/onboarding')} style={{ padding: '10px 28px', fontSize: 13 }}>
                Complete Setup
              </button>
            </div>
          ) : (
            <>
              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard label="Active Fields" value={fields.length.toString()} change="User-defined" changeType="neutral" />
                <MetricCard label="Total Acreage" value={Math.round(totalAcres).toString()} unit="ac" />
                <MetricCard
                  label="Yield Score"
                  value={analysis ? analysis.overall_yield_score.toString() : '--'}
                  unit="/100"
                  change={analysis ? `Grade: ${analysis.overall_grade}` : 'Run analysis to see score'}
                  changeType={analysis ? (analysis.overall_yield_score >= 70 ? 'positive' : analysis.overall_yield_score >= 40 ? 'neutral' : 'negative') : 'neutral'}
                />
                <MetricCard
                  label="Overall Grade"
                  value={analysis ? analysis.overall_grade : '--'}
                  change={analysis ? 'Data-driven assessment' : 'Run analysis'}
                  changeType="neutral"
                />
              </div>

              {error && (
                <div className="data-notice data-notice-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {loading && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Analyzing weather, soil, pests, drought conditions, and crop rotation...
                  </div>
                </div>
              )}

              {analysis && !loading && (
                <>
                  {/* Overall Summary */}
                  <HudPanel title="Yield Analysis Summary" className="mb-3">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
                      <GradeBadge grade={analysis.overall_grade} size="large" />
                      <div style={{ flex: 1 }}>
                        <ScoreBar score={analysis.overall_yield_score} label="Overall Yield Score" />
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {analysis.summary}
                        </div>
                      </div>
                    </div>
                  </HudPanel>

                  {/* 5 Category Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, marginBottom: 18 }}>
                    <CategoryCard
                      title="Weather Forecasting"
                      grade={analysis.weather.grade}
                      riskLevel={analysis.weather.risk_level}
                      summary={analysis.weather.summary}
                      onClick={() => navigate('/weather')}
                    />
                    <CategoryCard
                      title="Soil Health"
                      grade={analysis.soil_health.grade}
                      riskLevel={analysis.soil_health.risk_level}
                      summary={analysis.soil_health.summary}
                      onClick={() => navigate('/soil')}
                    />
                    <CategoryCard
                      title="Pest Forecasting"
                      grade={analysis.pest_forecast.grade}
                      riskLevel={analysis.pest_forecast.risk_level}
                      summary={analysis.pest_forecast.summary}
                      onClick={() => navigate('/pests')}
                    />
                    <CategoryCard
                      title="Drought Resistance"
                      grade={analysis.drought_resistance.grade}
                      riskLevel={analysis.drought_resistance.risk_level}
                      summary={analysis.drought_resistance.summary}
                      onClick={() => navigate('/drought')}
                    />
                    <CategoryCard
                      title="Monoculture Risk"
                      grade={analysis.monoculture_risk.grade}
                      riskLevel={analysis.monoculture_risk.risk_level}
                      summary={analysis.monoculture_risk.summary}
                      onClick={() => navigate('/monoculture')}
                    />
                  </div>

                  {/* Quick Recommendations */}
                  <div className="grid-2">
                    <HudPanel title="Top Weather Mitigations">
                      <RecommendationList items={analysis.weather.mitigation_recommendations} />
                    </HudPanel>
                    <HudPanel title="Soil Health Recommendations">
                      <RecommendationList items={analysis.soil_health.recommendations} />
                    </HudPanel>
                  </div>
                </>
              )}

              {!analysis && !loading && !error && (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
                  <div style={{ fontSize: 12 }}>
                    Click "Run Yield Analysis" to get grades and recommendations across all 5 categories.
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
