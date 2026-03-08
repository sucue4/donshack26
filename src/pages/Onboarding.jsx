import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getFields, addField,
  computeCentroid, computeAcres, snapToGrid,
} from '../fieldStore';
import { saveProfile, getProfile } from '../farmProfileStore';

const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTR = 'Esri, Maxar, Earthstar Geographics';
const LABELS_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const LABELS_ATTR = '&copy; OpenStreetMap contributors, &copy; CARTO';
const FIELD_COLORS = ['#3d7a4a', '#7ab87f', '#c0a030', '#4a7a8c', '#8a6a3a', '#b5403a', '#6b4a8c'];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];

const GEOCODE_CACHE_KEY = 'ohdeere_geocode_cache';

function getGeocodeCache() {
  try { return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function setGeocodeCache(cache) {
  localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
}

async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cache = getGeocodeCache();
  if (cache[key]) return cache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
      { headers: { 'User-Agent': 'OhDeere/1.0' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const town = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
    const state = addr.state || '';
    const label = [town, state].filter(Boolean).join(', ');
    cache[key] = label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    setGeocodeCache(cache);
    return cache[key];
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

const INFO_TEXTS = {
  1: 'Oh Deere! analyzes weather, soil health, pest forecasts, drought resistance, and crop rotation to provide actionable recommendations for maximizing your yield.',
  2: 'Use the drawing tools on the map to outline your farm plots. Draw a polygon or rectangle over your field boundaries on the satellite imagery.',
  3: 'Enter your crop history for the past 3 years. If different parts of your field had different crops, add multiple zones. This assesses monoculture risk and soil nutrient depletion.',
  4: 'Select all fertilizers you have applied to this field. This helps calculate dissolved nutrients, soil health predictions, and personalized recommendations.',
  5: 'Your farm profile is complete. We are now analyzing your field data across weather, soil health, pest forecasts, drought resistance, and crop rotation to generate your yield score.',
};

/* ── Inject keyframes once ────────────────────────────────────── */
const STYLE_ID = 'onboarding-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes ob-subtitle-reveal {
      0%   { clip-path: inset(0 100% 0 0); opacity: 0; }
      20%  { opacity: 1; }
      100% { clip-path: inset(0 0 0 0); opacity: 1; }
    }
    @keyframes ob-subtitle-cursor {
      0%, 100% { border-right-color: rgba(255,255,255,0.6); }
      50%      { border-right-color: transparent; }
    }
    @keyframes ob-fade-in {
      0%   { opacity: 0; transform: translateY(14px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

/* ── Custom Dropdown ──────────────────────────────────────────── */

function CustomDropdown({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll selected item into view when dropdown opens
  useEffect(() => {
    if (open && listRef.current && value) {
      const idx = options.indexOf(value);
      if (idx > -1) {
        const item = listRef.current.children[idx + 1]; // +1 for placeholder
        if (item) item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [open]);

  const displayText = value || placeholder || 'Select...';

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${open ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 8, color: value ? '#fff' : 'rgba(255,255,255,0.35)',
          fontSize: 13, padding: '10px 36px 10px 14px',
          fontFamily: 'var(--font-body)', cursor: 'pointer',
          transition: 'border-color 0.15s ease',
          position: 'relative',
        }}
      >
        {displayText}
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          transition: 'transform 0.2s ease',
          fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1,
        }}>
          &#9660;
        </span>
      </button>

      {/* Dropdown list */}
      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          zIndex: 200,
          background: '#1c2e22',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: '6px 0',
          maxHeight: 240, overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          {/* Placeholder option */}
          <div
            onClick={() => { onChange(''); setOpen(false); }}
            style={{
              padding: '9px 16px', fontSize: 13, cursor: 'pointer',
              color: 'rgba(255,255,255,0.3)', fontStyle: 'italic',
              fontFamily: 'var(--font-body)',
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {placeholder || 'Select...'}
          </div>

          {options.map((opt) => {
            const selected = opt === value;
            return (
              <div
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  padding: '9px 16px', fontSize: 13, cursor: 'pointer',
                  color: selected ? '#fff' : 'rgba(255,255,255,0.7)',
                  background: selected ? 'rgba(61,122,74,0.25)' : 'transparent',
                  fontWeight: selected ? 600 : 400,
                  fontFamily: 'var(--font-body)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
              >
                {selected && (
                  <span style={{ color: 'var(--accent-primary)', fontSize: 14, lineHeight: 1 }}>&#10003;</span>
                )}
                {opt}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Shared UI pieces ─────────────────────────────────────────── */

function StepDot({ number, active }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: active ? 'var(--accent-primary)' : 'transparent',
      border: `2px solid ${active ? 'var(--accent-primary)' : 'rgba(255,255,255,0.25)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 700,
      color: active ? '#fff' : 'rgba(255,255,255,0.4)',
      transition: 'all 0.3s ease',
    }}>
      {number}
    </div>
  );
}

function NavButton({ direction, onClick, disabled, label }) {
  const isNext = direction === 'next';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 28px', borderRadius: 50,
        background: isNext ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${isNext ? 'var(--accent-primary)' : 'rgba(255,255,255,0.15)'}`,
        color: '#fff', fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.2s ease',
        fontFamily: 'var(--font-heading)',
      }}
    >
      {!isNext && <span style={{ fontSize: 18 }}>&larr;</span>}
      {label}
      {isNext && <span style={{ fontSize: 18 }}>&rarr;</span>}
    </button>
  );
}

function InfoModal({ text, visible, onClose }) {
  if (!visible) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#1a2e1f', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '32px 36px', maxWidth: 440, width: '90%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.8 }}>{text}</div>
        <button onClick={onClose} style={{
          marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 10,
          background: 'var(--accent-primary)', border: 'none', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--font-heading)',
        }}>
          Got it
        </button>
      </div>
    </div>
  );
}

/* ── Main Onboarding Component ────────────────────────────────── */

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [fields, setFields] = useState([]);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [crops, setCrops] = useState([]);
  const [fertilizers, setFertilizers] = useState([]);
  const [cropZones, setCropZones] = useState([{ zone_name: 'Main Plot', crops_by_year: {} }]);
  const [selectedFertilizers, setSelectedFertilizers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [townNames, setTownNames] = useState({});
  const [showInfo, setShowInfo] = useState(false);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const drawnLayersRef = useRef(null);
  const fieldPolygonsRef = useRef({});
  const prefetchTimerRef = useRef(null);

  useEffect(() => {
    fetch('/api/onboarding/crops')
      .then((r) => r.json())
      .then(setCrops)
      .catch(() => setCrops([
        'Corn', 'Soybeans', 'Winter Wheat', 'Spring Wheat', 'Cotton', 'Rice',
        'Sorghum/Milo', 'Barley', 'Oats', 'Alfalfa', 'Hay', 'Canola',
        'Sunflowers', 'Sugar Beets', 'Potatoes', 'Peanuts', 'Tobacco',
        'Cereal Rye (Cover)', 'Crimson Clover (Cover)', 'Fallow/None',
      ]));
    fetch('/api/onboarding/fertilizers')
      .then((r) => r.json())
      .then(setFertilizers)
      .catch(() => setFertilizers([]));
  }, []);

  useEffect(() => {
    const loadFields = () => setFields(getFields());
    loadFields();
    window.addEventListener('ohdeere-fields-changed', loadFields);
    return () => window.removeEventListener('ohdeere-fields-changed', loadFields);
  }, []);

  useEffect(() => {
    fields.forEach((f) => {
      if (f.lat && f.lon && !townNames[f.id]) {
        reverseGeocode(f.lat, f.lon).then((name) => {
          setTownNames((prev) => ({ ...prev, [f.id]: name }));
        });
      }
    });
  }, [fields]);

  // Initialize map for Step 2
  useEffect(() => {
    if (step !== 2 || !mapRef.current || mapInstance.current) return;
    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [38.94, -92.313], zoom: 14, zoomControl: true,
    });
    L.tileLayer(SATELLITE_URL, { attribution: SATELLITE_ATTR, maxZoom: 19 }).addTo(map);
    L.tileLayer(LABELS_URL, { attribution: LABELS_ATTR, maxZoom: 19, pane: 'overlayPane' }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnLayersRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          allowIntersection: false, showArea: true,
          shapeOptions: { color: '#ffffff', weight: 3, fillOpacity: 0.2, fillColor: '#3d7a4a' },
        },
        rectangle: {
          shapeOptions: { color: '#ffffff', weight: 3, fillOpacity: 0.2, fillColor: '#3d7a4a' },
        },
        polyline: false, circle: false, circlemarker: false, marker: false,
      },
      edit: { featureGroup: drawnItems, remove: true },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e) => {
      const rawCoords = e.layer.getLatLngs()[0].map((ll) => [ll.lat, ll.lng]);
      const snapped = snapToGrid(rawCoords);
      const acres = computeAcres(snapped);
      const centroid = computeCentroid(snapped);
      const fieldCount = getFields().length;
      const newField = addField({
        name: `Field ${fieldCount + 1}`,
        coords: snapped, color: FIELD_COLORS[fieldCount % FIELD_COLORS.length],
        crop: '', acres, lat: centroid.lat, lon: centroid.lon,
      });
      setFields(getFields());
      setSelectedFieldId(newField.id);
    });

    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, [step]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const L = window.L;
    const map = mapInstance.current;
    Object.values(fieldPolygonsRef.current).forEach((p) => map.removeLayer(p));
    fieldPolygonsRef.current = {};
    fields.forEach((field) => {
      if (!field.coords || field.coords.length < 3) return;
      const isSelected = selectedFieldId === field.id;
      const polygon = L.polygon(field.coords, {
        color: isSelected ? '#ffffff' : (field.color || '#3d7a4a'),
        weight: isSelected ? 4 : 3, fillColor: field.color || '#3d7a4a',
        fillOpacity: isSelected ? 0.35 : 0.2,
        dashArray: isSelected ? null : '8 4', opacity: isSelected ? 1 : 0.85,
      }).addTo(map);
      const townLabel = townNames[field.id] ? ` (${townNames[field.id]})` : '';
      polygon.bindTooltip(
        `<strong>${field.name}</strong><br/>${field.acres} ac${townLabel}`,
        { className: 'field-tooltip-custom', direction: 'center', permanent: false }
      );
      polygon.on('click', () => setSelectedFieldId(field.id));
      fieldPolygonsRef.current[field.id] = polygon;
    });
  }, [fields, selectedFieldId, townNames]);

  useEffect(() => {
    if (!selectedFieldId) return;
    const existing = getProfile(selectedFieldId);
    if (existing) {
      if (existing.cropZones?.length > 0) setCropZones(existing.cropZones);
      if (existing.fertilizers) setSelectedFertilizers(existing.fertilizers);
    }
  }, [selectedFieldId]);

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  const addZone = () => setCropZones((prev) => [...prev, { zone_name: `Zone ${prev.length + 1}`, crops_by_year: {} }]);
  const removeZone = (idx) => { if (cropZones.length > 1) setCropZones((prev) => prev.filter((_, i) => i !== idx)); };
  const updateZoneName = (idx, name) => setCropZones((prev) => prev.map((z, i) => i === idx ? { ...z, zone_name: name } : z));
  const updateZoneCrop = (idx, year, crop) => setCropZones((prev) => prev.map((z, i) =>
    i === idx ? { ...z, crops_by_year: { ...z.crops_by_year, [year]: crop } } : z
  ));
  const toggleFertilizer = (name) => setSelectedFertilizers((prev) =>
    prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
  );

  const fireAnalysis = () => {
    if (!selectedField) return;
    const promise = fetch('/api/analysis/full', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_id: selectedField.id,
        crop_zones: cropZones.map((z) => ({ zone_name: z.zone_name, crops_by_year: z.crops_by_year })),
        fertilizers_used: selectedFertilizers,
        lat: selectedField.lat, lon: selectedField.lon,
      }),
    }).then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e?.detail || `HTTP ${r.status}`)));
    window.__ohdeereAnalysis = { promise, fieldId: selectedField.id };
  };

  // Prefetch analysis while user is still picking fertilizers
  useEffect(() => {
    if (step !== 4 || !selectedField) return;
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(fireAnalysis, 800);
    return () => clearTimeout(prefetchTimerRef.current);
  }, [step, selectedFertilizers]);

  const goToWelcome = () => {
    fireAnalysis();
    setStep(5);
  };

  const handleFinish = async () => {
    if (!selectedField) return;
    setSaving(true);
    saveProfile(selectedField.id, { fieldId: selectedField.id, cropZones, fertilizers: selectedFertilizers, lat: selectedField.lat, lon: selectedField.lon });
    try {
      await fetch('/api/onboarding/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: selectedField.id,
          crop_zones: cropZones.map((z) => ({ zone_name: z.zone_name, crops_by_year: z.crops_by_year })),
          fertilizers_used: selectedFertilizers,
          lat: selectedField.lat, lon: selectedField.lon,
        }),
      });
    } catch (e) { /* best-effort */ }
    setSaving(false);
    navigate('/');
  };

  const canProceedStep2 = selectedFieldId !== null;
  const canProceedStep3 = cropZones.every((z) =>
    z.zone_name.trim() !== '' && YEARS.every((y) => z.crops_by_year[y] && z.crops_by_year[y] !== '')
  );

  /* ── Layout constants ───────────────────────────────────────── */
  const shell = {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'linear-gradient(145deg, #0f1a12 0%, #162219 40%, #1a2e1f 100%)',
    display: 'flex', fontFamily: 'var(--font-body)', overflow: 'hidden',
  };
  const rail = {
    width: 72, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)',
  };
  const mainPanel = { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' };
  const topBar = { display: 'flex', justifyContent: 'flex-end', padding: '20px 28px 0' };
  const contentArea = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '0 48px 32px' };
  const bottomBar = {
    padding: '20px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  };
  const darkInput = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, color: '#fff', fontSize: 13, padding: '10px 14px',
    fontFamily: 'var(--font-body)', outline: 'none', width: '100%',
  };

  return (
    <div style={shell}>
      <InfoModal text={INFO_TEXTS[step]} visible={showInfo} onClose={() => setShowInfo(false)} />

      {/* Left rail */}
      <div style={rail}>
        {[1, 2, 3, 4, 5].map((n) => <StepDot key={n} number={n} active={step >= n} />)}
      </div>

      <div style={mainPanel}>
        {/* Top bar */}
        <div style={topBar}>
          <button
            onClick={() => setShowInfo(true)}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Georgia, serif', fontStyle: 'italic',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.color = 'rgba(255,255,255,0.5)'; }}
          >
            i
          </button>
        </div>

        {/* ── STEP 1: Welcome ──────────────────────────────────── */}
        {step === 1 && (
          <>
            <div style={{
              ...contentArea, alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', gap: 0,
            }}>
              {/* Double-lined box with title */}
              <div style={{
                border: '3px double rgba(255,255,255,0.5)',
                borderRadius: 4,
                padding: '20px 52px',
                marginBottom: 48,
              }}>
                <h1 style={{
                  fontSize: 52, fontWeight: 800, color: '#fff',
                  fontFamily: 'var(--font-display)', letterSpacing: '-1.5px',
                  lineHeight: 1.1, margin: 0,
                }}>
                  Oh Deere!
                </h1>
              </div>

              {/* Animated subtitle — fade-in left to right */}
              <p style={{
                fontSize: 22, color: 'rgba(255,255,255,0.45)',
                fontWeight: 400, letterSpacing: '4px', textTransform: 'uppercase',
                fontFamily: 'var(--font-heading)',
                animation: 'ob-subtitle-reveal 2.5s ease-out forwards',
                animationDelay: '0.4s',
                opacity: 0,
                margin: 0,
              }}>
                Yield Rate Optimizer
              </p>
            </div>
            <div style={bottomBar}>
              <div />
              <NavButton direction="next" onClick={() => setStep(2)} label="Get Started" />
            </div>
          </>
        )}

        {/* ── STEP 2: Plot Selector ────────────────────────────── */}
        {step === 2 && (
          <>
            <div style={contentArea}>
              <h2 style={{
                fontSize: 28, fontWeight: 700, color: '#fff',
                fontFamily: 'var(--font-display)', marginBottom: 6, letterSpacing: '-0.5px',
              }}>
                Plot Selector
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
                Draw your farm boundaries on the satellite map, or select an existing field.
              </p>
              <div ref={mapRef} style={{
                height: 380, borderRadius: 12, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }} />
              {fields.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
                    Your Fields
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fields.map((f) => (
                      <div key={f.id}
                        onClick={() => {
                          setSelectedFieldId(f.id);
                          if (mapInstance.current && f.coords) mapInstance.current.fitBounds(f.coords, { padding: [30, 30] });
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                          background: selectedFieldId === f.id ? 'rgba(61,122,74,0.15)' : 'rgba(255,255,255,0.03)',
                          border: `2px solid ${selectedFieldId === f.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, background: f.color, flexShrink: 0,
                          border: '2px solid rgba(255,255,255,0.2)',
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                            {f.acres} ac{townNames[f.id] ? ` · ${townNames[f.id]}` : ''}
                          </div>
                        </div>
                        {selectedFieldId === f.id && (
                          <span style={{
                            fontSize: 10, color: '#fff', fontWeight: 700,
                            background: 'var(--accent-primary)', padding: '4px 10px',
                            borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.5px',
                          }}>Selected</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={bottomBar}>
              <NavButton direction="back" onClick={() => { mapInstance.current = null; setStep(1); }} label="Back" />
              <NavButton direction="next" onClick={() => setStep(3)} disabled={!canProceedStep2} label="Next" />
            </div>
          </>
        )}

        {/* ── STEP 3: Crop History ─────────────────────────────── */}
        {step === 3 && (
          <>
            <div style={contentArea}>
              <h2 style={{
                fontSize: 28, fontWeight: 700, color: '#fff',
                fontFamily: 'var(--font-display)', marginBottom: 6, letterSpacing: '-0.5px',
              }}>
                Crop History
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
                What crops were planted on <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{selectedField?.name || 'your field'}</strong> over the past 3 years?
              </p>

              {cropZones.map((zone, idx) => (
                <div key={idx} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, padding: 20, marginBottom: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <input
                      type="text" value={zone.zone_name}
                      onChange={(e) => updateZoneName(idx, e.target.value)}
                      placeholder="Zone name"
                      style={{ ...darkInput, flex: 1, fontWeight: 600 }}
                    />
                    {cropZones.length > 1 && (
                      <button onClick={() => removeZone(idx)} style={{
                        background: 'rgba(181,64,58,0.15)', border: '1px solid rgba(181,64,58,0.25)',
                        borderRadius: 8, padding: '8px 14px', color: '#e06058',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-heading)',
                      }}>
                        Remove
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {YEARS.map((year) => (
                      <div key={year}>
                        <label style={{
                          fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)',
                          display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                          {year}
                        </label>
                        <CustomDropdown
                          value={zone.crops_by_year[year] || ''}
                          onChange={(val) => updateZoneCrop(idx, year, val)}
                          options={crops}
                          placeholder="Select crop..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button onClick={addZone} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: 10, padding: '12px 20px', color: 'rgba(255,255,255,0.5)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%',
                fontFamily: 'var(--font-heading)', transition: 'all 0.2s ease',
              }}>
                + Add Zone
              </button>
            </div>
            <div style={bottomBar}>
              <NavButton direction="back" onClick={() => setStep(2)} label="Back" />
              <NavButton direction="next" onClick={() => setStep(4)} disabled={!canProceedStep3} label="Next" />
            </div>
          </>
        )}

        {/* ── STEP 4: Fertilizer Selection ─────────────────────── */}
        {step === 4 && (
          <>
            <div style={contentArea}>
              <h2 style={{
                fontSize: 28, fontWeight: 700, color: '#fff',
                fontFamily: 'var(--font-display)', marginBottom: 6, letterSpacing: '-0.5px',
              }}>
                Fertilizer Selection
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
                Select all fertilizers applied to your field.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {fertilizers.map((f) => {
                  const active = selectedFertilizers.includes(f.name);
                  return (
                    <button key={f.name} onClick={() => toggleFertilizer(f.name)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        padding: '14px 18px', borderRadius: 10, textAlign: 'left',
                        background: active ? 'rgba(61,122,74,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                        color: '#fff', transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        NPK: {f.npk_ratio} | {f.nutrients}
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedFertilizers.length > 0 && (
                <div style={{
                  marginTop: 20, padding: '14px 18px',
                  background: 'rgba(61,122,74,0.08)', borderRadius: 10,
                  border: '1px solid rgba(61,122,74,0.2)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Selected ({selectedFertilizers.length})
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                    {selectedFertilizers.join(', ')}
                  </div>
                </div>
              )}
            </div>
            <div style={bottomBar}>
              <NavButton direction="back" onClick={() => setStep(3)} label="Back" />
              <NavButton direction="next" onClick={goToWelcome} label="Next" />
            </div>
          </>
        )}

        {/* ── STEP 5: Welcome / Analysis Loading ───────────────── */}
        {step === 5 && (
          <>
            <div style={{
              ...contentArea, alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', gap: 0,
            }}>
              <div style={{
                border: '3px double rgba(255,255,255,0.5)',
                borderRadius: 4,
                padding: '20px 52px',
                marginBottom: 48,
                animation: 'ob-fade-in 1s ease-out forwards',
                opacity: 0,
              }}>
                <h1 style={{
                  fontSize: 52, fontWeight: 800, color: '#fff',
                  fontFamily: 'var(--font-display)', letterSpacing: '-1.5px',
                  lineHeight: 1.1, margin: 0,
                }}>
                  Welcome
                </h1>
              </div>

              <p style={{
                fontSize: 22, color: 'rgba(255,255,255,0.45)',
                fontWeight: 400, letterSpacing: '4px', textTransform: 'uppercase',
                fontFamily: 'var(--font-heading)',
                animation: 'ob-subtitle-reveal 2.5s ease-out forwards',
                animationDelay: '0.6s',
                opacity: 0,
                margin: 0,
              }}>
                Your Farm Profile is Ready
              </p>

              <p style={{
                fontSize: 14, color: 'rgba(255,255,255,0.3)',
                marginTop: 36, maxWidth: 420, lineHeight: 1.9,
                animation: 'ob-fade-in 1.2s ease-out forwards',
                animationDelay: '2.2s',
                opacity: 0,
              }}>
                We're analyzing weather patterns, soil composition, pest forecasts,
                drought resilience, and crop rotation history to build your
                personalized yield optimization score.
              </p>
            </div>
            <div style={bottomBar}>
              <NavButton direction="back" onClick={() => setStep(4)} label="Back" />
              <button onClick={handleFinish} disabled={saving}
                style={{
                  padding: '14px 36px', borderRadius: 50,
                  background: saving ? 'rgba(61,122,74,0.5)' : 'linear-gradient(135deg, #3d7a4a 0%, #2d5e38 100%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-heading)',
                  boxShadow: saving ? 'none' : '0 4px 20px rgba(61,122,74,0.35)',
                  transition: 'all 0.2s ease',
                }}
              >
                {saving ? 'Saving...' : 'Enter Dashboard'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
