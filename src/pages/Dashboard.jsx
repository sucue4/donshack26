import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import { GradeBadge, RiskBadge, CategoryCard } from '../components/YieldWidgets';
import { getFields } from '../fieldStore';
import { getProfile, isOnboarded } from '../farmProfileStore';
import { cacheAnalysis, getCachedAnalysis } from '../analysisStore';

function weatherInsight(w) {
  if (!w) return '';
  const frost = (w.upcoming_events || []).filter(e => e.event_type === 'frost').length;
  const heat = (w.upcoming_events || []).filter(e => e.event_type === 'heat_wave').length;
  if (frost && heat) return `${frost} frost, ${heat} heat events`;
  if (frost) return `${frost} frost event(s) ahead`;
  if (heat) return `${heat} heat stress day(s) ahead`;
  if (w.grade === 'A' || w.grade === 'B') return 'Favorable conditions';
  return 'No severe weather expected';
}

function soilInsight(s) {
  if (!s) return '';
  const deficient = (s.nutrient_levels || []).filter(n => n.current_level === 'deficient' || n.current_level === 'low');
  if (deficient.length > 0) return `${deficient.length} nutrient(s) low`;
  if (s.grade === 'A' || s.grade === 'B') return 'Nutrients well balanced';
  return 'Soil health assessed';
}

function pestInsight(p) {
  if (!p) return '';
  const active = (p.active_threats || []).filter(t => t.risk_level !== 'low');
  if (active.length === 0) return 'No active threats';
  return `${active.length} active threat(s)`;
}

function droughtInsight(d) {
  if (!d) return '';
  const status = d.current_drought_status;
  if (!status || status === 'none') return 'No drought detected';
  if (status === 'abnormally_dry') return 'Dry, monitor closely';
  if (status === 'moderate') return 'Moderate, irrigate';
  return 'Severe, action needed';
}

function monocultureInsight(mc) {
  if (!mc) return '';
  const yrs = mc.consecutive_same_crop_years || 0;
  if (yrs >= 3) return `${yrs}yr same crop, rotate`;
  if (yrs >= 2) return `${yrs}yr same crop, diversify`;
  if (yrs === 1) return 'Good rotation pattern';
  return 'Rotation data assessed';
}

const SCORE_MAP = { A: 95, B: 80, C: 60, D: 40, F: 15 };

/* ── Circular Score Gauge ─────────────────────────────────────── */
function ScoreGauge({ score, grade }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - pct);
  const color = score >= 80 ? 'var(--health-excellent)' :
    score >= 60 ? 'var(--health-good)' :
    score >= 40 ? 'var(--health-moderate)' :
    score >= 20 ? 'var(--health-stressed)' :
    'var(--health-critical)';

  return (
    <div style={{ position: 'relative', width: 96, height: 96 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--bg-tertiary)" strokeWidth="6" />
        <circle cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ animation: 'score-fill 1.2s ease-out', transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>
          {grade}
        </span>
      </div>
    </div>
  );
}

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
      if (f.length > 0 && !selectedField) setSelectedField(f[0]);
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
          crop_zones: (profile.cropZones || []).map((z) => ({ zone_name: z.zone_name, crops_by_year: z.crops_by_year })),
          fertilizers_used: profile.fertilizers || [],
          lat: field.lat, lon: field.lon,
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
      const cached = getCachedAnalysis(selectedField.id);
      if (cached) { setAnalysis(cached); return; }
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

  return (
    <div className="fade-in">
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
          {/* Field selector */}
          <div className="location-bar stagger-1">
            <label>Field:</label>
            <select className="field-select" value={selectedField?.id || ''} onChange={handleFieldSelect}>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.acres} ac)</option>
              ))}
            </select>
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
              {error && (
                <div className="data-notice data-notice-error stagger-2" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="stagger-2" style={{
                  textAlign: 'center', padding: '60px 20px',
                  background: 'var(--bg-panel)', borderRadius: 12,
                  border: '1px solid var(--border-color)',
                }}>
                  <div style={{
                    width: 40, height: 40, margin: '0 auto 16px',
                    border: '3px solid var(--bg-tertiary)',
                    borderTopColor: 'var(--accent-primary)',
                    borderRadius: '50%',
                    animation: 'rotate-slow 0.8s linear infinite',
                  }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Analyzing your field...
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    Weather, soil, pests, drought, and crop rotation
                  </div>
                </div>
              )}

              {analysis && !loading && (
                <>
                  {/* Hero section: Score gauge + key metrics */}
                  <div className="stagger-2" style={{
                    display: 'flex', alignItems: 'center', gap: 24,
                    padding: '24px 28px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12, marginBottom: 16,
                    boxShadow: 'var(--shadow-sm)',
                  }}>
                    <ScoreGauge score={analysis.overall_yield_score} grade={analysis.overall_grade} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                        Overall Yield Score
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
                        {analysis.overall_yield_score >= 80 ? 'Strong Potential' :
                         analysis.overall_yield_score >= 60 ? 'Moderate Potential' :
                         analysis.overall_yield_score >= 40 ? 'Needs Attention' : 'At Risk'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        Based on 5 categories across weather, soil, pests, drought, and crop rotation for {selectedField?.name}.
                      </div>
                    </div>
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      borderLeft: '1px solid var(--border-color)', paddingLeft: 24,
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fields</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{fields.length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Acres</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{Math.round(totalAcres)}</div>
                      </div>
                    </div>
                  </div>

                  {/* 5 Category Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
                    {[
                      { title: 'Weather', data: analysis.weather, path: '/weather', insightFn: weatherInsight, scoreOverride: null },
                      { title: 'Soil Health', data: analysis.soil_health, path: '/soil', insightFn: soilInsight, scoreOverride: null },
                      { title: 'Pest Forecast', data: analysis.pest_forecast, path: '/pests', insightFn: pestInsight, scoreOverride: null },
                      { title: 'Drought', data: analysis.drought_resistance, path: '/drought', insightFn: droughtInsight, scoreOverride: null },
                      { title: 'Crop Rotation', data: analysis.monoculture_risk, path: '/monoculture', insightFn: monocultureInsight, scoreOverride: Math.max(0, 100 - (analysis.monoculture_risk.risk_score || 0)) },
                    ]
                      .map((cat) => ({
                        ...cat,
                        score: cat.scoreOverride != null ? cat.scoreOverride : (SCORE_MAP[cat.data.grade] || 60),
                        riskOrder: cat.data.risk_level === 'critical' ? 0 : cat.data.risk_level === 'high' ? 1 : cat.data.risk_level === 'moderate' ? 2 : 3,
                      }))
                      .sort((a, b) => a.riskOrder - b.riskOrder || a.score - b.score)
                      .map((cat, i) => (
                        <div key={cat.title} className={`stagger-${i + 3}`}>
                          <CategoryCard
                            title={cat.title}
                            grade={cat.data.grade}
                            riskLevel={cat.data.risk_level}
                            score={cat.score}
                            insight={cat.insightFn(cat.data)}
                            onClick={() => navigate(cat.path)}
                          />
                        </div>
                      ))
                    }
                  </div>

                  {/* Priority Actions */}
                  {(() => {
                    const actions = [
                      ...(analysis.weather.mitigation_recommendations || []).slice(0, 2),
                      ...(analysis.soil_health.recommendations || []).slice(0, 1),
                      ...(analysis.monoculture_risk.recommendations || []).slice(0, 1),
                      ...(analysis.drought_resistance.water_conservation_recommendations || []).slice(0, 1),
                    ].slice(0, 5)
                      .map(item => item.replace(/\s*—\s*/g, ' - ').replace(/\s+/g, ' ').trim());
                    return actions.length > 0 ? (
                      <div className="stagger-8">
                        <HudPanel title="Priority Actions">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {actions.map((action, i) => {
                              const isWeather = /frost|heat|temperature|wind|emergence|planting/i.test(action);
                              const isSoil = /soil|pH|nutrient|fertili|lime|compost|NPK/i.test(action);
                              const isRotation = /rotat|monoculture|consecutive|diversif|yield drag/i.test(action);
                              const isDrought = /drought|irrigat|moisture|water|deficit/i.test(action);
                              const dotColor = isWeather ? '#4a7a8c' : isSoil ? 'var(--status-warning)' : isRotation ? 'var(--accent-primary)' : isDrought ? 'var(--status-danger)' : 'var(--text-dim)';
                              const label = isWeather ? 'Weather' : isSoil ? 'Soil' : isRotation ? 'Rotation' : isDrought ? 'Drought' : 'Action';
                              return (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'flex-start', gap: 12,
                                  padding: '12px 16px', borderRadius: 8,
                                  background: 'var(--bg-tertiary)',
                                  borderLeft: `3px solid ${dotColor}`,
                                }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                                    background: dotColor, color: '#fff', textTransform: 'uppercase',
                                    letterSpacing: '0.3px', flexShrink: 0, marginTop: 1,
                                  }}>
                                    {label}
                                  </span>
                                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    {action}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </HudPanel>
                      </div>
                    ) : null;
                  })()}
                </>
              )}

              {!analysis && !loading && !error && (
                <div className="stagger-2" style={{
                  textAlign: 'center', padding: 48, color: 'var(--text-dim)',
                  background: 'var(--bg-panel)', borderRadius: 12,
                  border: '1px solid var(--border-color)',
                }}>
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
