import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, ScoreBar, CategoryCard, RecommendationList } from '../components/YieldWidgets';
import { getFields } from '../fieldStore';
import { getProfile, isOnboarded } from '../farmProfileStore';
import { cacheAnalysis } from '../analysisStore';

// Extract a short, human-readable insight from each category
function weatherInsight(w) {
  if (!w) return '';
  const parts = [];
  const m = w.summary.match(/Temp suitability (\d+)/);
  const m2 = w.summary.match(/moisture adequacy (\d+)/);
  if (m) parts.push(`Temp suitability ${m[1]}%`);
  if (m2) parts.push(`moisture ${m2[1]}%`);
  const frost = (w.upcoming_events || []).filter(e => e.event_type === 'frost').length;
  const heat = (w.upcoming_events || []).filter(e => e.event_type === 'heat_wave').length;
  if (frost) parts.push(`${frost} frost event${frost > 1 ? 's' : ''}`);
  if (heat) parts.push(`${heat} heat stress day${heat > 1 ? 's' : ''}`);
  if (!frost && !heat && parts.length < 2) parts.push('no severe events');
  return parts.join(' · ');
}

function soilInsight(s) {
  if (!s) return '';
  const parts = [];
  const phN = (s.nutrient_levels || []).find(n => n.nutrient === 'pH');
  if (phN?.value) parts.push(`pH ${phN.value}`);
  const socN = (s.nutrient_levels || []).find(n => n.nutrient === 'Organic Carbon');
  if (socN) parts.push(`SOC ${socN.current_level}`);
  const nN = (s.nutrient_levels || []).find(n => n.nutrient?.includes('Nitrogen'));
  if (nN) parts.push(`N ${nN.current_level}`);
  return parts.join(' · ') || 'Soil data assessed';
}

function pestInsight(p) {
  if (!p) return '';
  const active = (p.active_threats || []).filter(t => t.risk_level !== 'low');
  if (active.length === 0) return 'No active threats detected';
  return `${active.length} active threat${active.length > 1 ? 's' : ''}: ${active.map(t => t.pest_name.split('(')[0].trim()).join(', ')}`;
}

function droughtInsight(d) {
  if (!d) return '';
  const status = (d.current_drought_status || '').replace(/_/g, ' ');
  const m = d.summary?.match(/P\/ET0 = [\d.]+\/[\d.]+mm \(ratio ([\d.]+)\)/);
  const ratio = m ? `P/ET0 ratio ${m[1]}` : '';
  return [status === 'none' ? 'No drought' : `Status: ${status}`, ratio].filter(Boolean).join(' · ');
}

function monocultureInsight(mc) {
  if (!mc) return '';
  const yrs = mc.consecutive_same_crop_years || 0;
  const drag = mc.summary?.match(/yield drag -([\d]+)%/);
  const parts = [`${yrs}yr same crop`];
  if (drag) parts.push(`est. -${drag[1]}% yield drag`);
  const hm = mc.summary?.match(/evenness = ([\d.]+)/);
  if (hm) parts.push(`diversity ${hm[1]}`);
  return parts.join(' · ');
}

// Extract top actionable findings across all categories
function extractKeyFindings(a) {
  const findings = [];
  // Monoculture risk
  if (a.monoculture_risk?.consecutive_same_crop_years >= 3) {
    findings.push({ type: 'danger', text: `${a.monoculture_risk.consecutive_same_crop_years}-year monoculture detected — rotate crops to recover 10-15% yield` });
  } else if (a.monoculture_risk?.consecutive_same_crop_years >= 2) {
    findings.push({ type: 'warning', text: `2nd consecutive year of same crop — plan rotation for next season` });
  }
  // Frost
  const frosts = (a.weather?.upcoming_events || []).filter(e => e.event_type === 'frost');
  if (frosts.length) {
    findings.push({ type: 'warning', text: `${frosts.length} frost event${frosts.length > 1 ? 's' : ''} forecast — delay frost-sensitive planting` });
  }
  // Soil deficiencies
  const deficient = (a.soil_health?.nutrient_levels || []).filter(n => n.current_level === 'deficient' || n.current_level === 'low');
  if (deficient.length) {
    findings.push({ type: 'warning', text: `${deficient.map(n => n.nutrient).join(', ')} ${deficient.length > 1 ? 'are' : 'is'} below optimal — see Soil Health for recommendations` });
  }
  // Active pest threats
  const activeThreats = (a.pest_forecast?.active_threats || []).filter(t => t.risk_level === 'moderate' || t.risk_level === 'high');
  if (activeThreats.length) {
    findings.push({ type: 'warning', text: `${activeThreats.length} elevated pest threat${activeThreats.length > 1 ? 's' : ''} — scout fields this week` });
  }
  // Drought
  if (a.drought_resistance?.current_drought_status && !['none', 'abnormally_dry'].includes(a.drought_resistance.current_drought_status)) {
    findings.push({ type: 'danger', text: `${a.drought_resistance.current_drought_status.replace(/_/g, ' ')} drought conditions — irrigation recommended` });
  }
  // Positive findings
  if (a.weather?.grade === 'A' || a.weather?.grade === 'B') {
    findings.push({ type: 'good', text: 'Weather conditions favorable for crop development' });
  }
  if (a.soil_health?.grade === 'A') {
    findings.push({ type: 'good', text: 'Soil quality excellent — maintain current management' });
  }
  if (a.pest_forecast?.grade === 'A') {
    findings.push({ type: 'good', text: 'Low pest pressure — routine scouting sufficient' });
  }
  return findings.slice(0, 5);
}

const SCORE_MAP = {A: 95, B: 80, C: 60, D: 40, F: 15};

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
      cacheAnalysis(field.id, data);
    } catch (e) {
      setError(e.message);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!selectedField || !isOnboarded(selectedField.id)) return;

    const prefetch = window.__ohdeereAnalysis;
    if (prefetch && String(prefetch.fieldId) === String(selectedField.id)) {
      window.__ohdeereAnalysis = null;
      setLoading(true);
      setError(null);
      prefetch.promise
        .then((data) => { setAnalysis(data); cacheAnalysis(selectedField.id, data); })
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
  const needsOnboarding = selectedField && !isOnboarded(selectedField.id);
  const totalAcres = fields.reduce((sum, f) => sum + (f.acres || 0), 0);
  const findings = analysis ? extractKeyFindings(analysis) : [];

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
                {loading ? 'Analyzing...' : 'Refresh Analysis'}
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
              {/* Top metrics */}
              <div className="metric-grid" style={{ marginBottom: 18 }}>
                <MetricCard label="Active Fields" value={fields.length.toString()} change="User-defined" changeType="neutral" />
                <MetricCard label="Total Acreage" value={Math.round(totalAcres).toString()} unit="ac" />
                <MetricCard
                  label="Yield Score"
                  value={analysis ? analysis.overall_yield_score.toString() : '--'}
                  unit="/100"
                  change={analysis ? `Grade: ${analysis.overall_grade}` : 'Analyzing...'}
                  changeType={analysis ? (analysis.overall_yield_score >= 70 ? 'positive' : analysis.overall_yield_score >= 40 ? 'neutral' : 'negative') : 'neutral'}
                />
                <MetricCard
                  label="Overall Grade"
                  value={analysis ? analysis.overall_grade : '--'}
                  change={analysis ? 'Composite of 5 categories' : 'Analyzing...'}
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
                    Analyzing weather, soil, pests, drought, and crop rotation...
                  </div>
                </div>
              )}

              {analysis && !loading && (
                <>
                  {/* Key Findings — the headline */}
                  {findings.length > 0 && (
                    <HudPanel title="Key Findings" className="mb-3">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {findings.map((f, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', borderRadius: 8,
                            background: f.type === 'danger' ? 'rgba(181,64,58,0.08)' :
                                        f.type === 'warning' ? 'rgba(192,138,48,0.08)' :
                                        'rgba(61,122,74,0.08)',
                          }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              background: f.type === 'danger' ? 'var(--status-danger)' :
                                          f.type === 'warning' ? 'var(--status-warning)' :
                                          'var(--status-good)',
                            }} />
                            <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                              {f.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </HudPanel>
                  )}

                  {/* 5 Category Cards — with scores and insights */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 18 }}>
                    <CategoryCard
                      title="Weather"
                      grade={analysis.weather.grade}
                      riskLevel={analysis.weather.risk_level}
                      score={SCORE_MAP[analysis.weather.grade] || 60}
                      insight={weatherInsight(analysis.weather)}
                      onClick={() => navigate('/weather')}
                    />
                    <CategoryCard
                      title="Soil Health"
                      grade={analysis.soil_health.grade}
                      riskLevel={analysis.soil_health.risk_level}
                      score={SCORE_MAP[analysis.soil_health.grade] || 60}
                      insight={soilInsight(analysis.soil_health)}
                      onClick={() => navigate('/soil')}
                    />
                    <CategoryCard
                      title="Pest Forecast"
                      grade={analysis.pest_forecast.grade}
                      riskLevel={analysis.pest_forecast.risk_level}
                      score={SCORE_MAP[analysis.pest_forecast.grade] || 60}
                      insight={pestInsight(analysis.pest_forecast)}
                      onClick={() => navigate('/pests')}
                    />
                    <CategoryCard
                      title="Drought"
                      grade={analysis.drought_resistance.grade}
                      riskLevel={analysis.drought_resistance.risk_level}
                      score={SCORE_MAP[analysis.drought_resistance.grade] || 60}
                      insight={droughtInsight(analysis.drought_resistance)}
                      onClick={() => navigate('/drought')}
                    />
                    <CategoryCard
                      title="Crop Rotation"
                      grade={analysis.monoculture_risk.grade}
                      riskLevel={analysis.monoculture_risk.risk_level}
                      score={Math.max(0, 100 - (analysis.monoculture_risk.risk_score || 0))}
                      insight={monocultureInsight(analysis.monoculture_risk)}
                      onClick={() => navigate('/monoculture')}
                    />
                  </div>

                  {/* Top Recommendations — across categories */}
                  <HudPanel title="Priority Actions">
                    <RecommendationList items={[
                      ...(analysis.weather.mitigation_recommendations || []).slice(0, 2),
                      ...(analysis.soil_health.recommendations || []).slice(0, 1),
                      ...(analysis.monoculture_risk.recommendations || []).slice(0, 1),
                      ...(analysis.drought_resistance.water_conservation_recommendations || []).slice(0, 1),
                    ].slice(0, 5)} />
                  </HudPanel>
                </>
              )}

              {!analysis && !loading && !error && (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>Ready to analyze</div>
                  <div style={{ fontSize: 12 }}>
                    Select a field to automatically run yield analysis across all 5 categories.
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
