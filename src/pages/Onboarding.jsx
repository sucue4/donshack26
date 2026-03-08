import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import HudPanel from '../components/HudPanel';
import {
  getFields, addField,
  computeCentroid, computeAcres, snapToGrid,
} from '../fieldStore';
import { saveProfile, getProfile } from '../farmProfileStore';

const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTR = 'Esri, Maxar, Earthstar Geographics';
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

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layerRef = useRef(null);
  const drawnLayersRef = useRef(null);
  const fieldPolygonsRef = useRef({});
  const prefetchTimerRef = useRef(null);

  // Fetch reference data
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

  // Load existing fields
  useEffect(() => {
    const loadFields = () => setFields(getFields());
    loadFields();
    window.addEventListener('ohdeere-fields-changed', loadFields);
    return () => window.removeEventListener('ohdeere-fields-changed', loadFields);
  }, []);

  // Reverse geocode town names
  useEffect(() => {
    fields.forEach((f) => {
      if (f.lat && f.lon && !townNames[f.id]) {
        reverseGeocode(f.lat, f.lon).then((name) => {
          setTownNames((prev) => ({ ...prev, [f.id]: name }));
        });
      }
    });
  }, [fields]);

  // Initialize map for Step 1
  useEffect(() => {
    if (step !== 1 || !mapRef.current || mapInstance.current) return;
    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [38.94, -92.313],
      zoom: 14,
      zoomControl: true,
    });

    const layer = L.tileLayer(SATELLITE_URL, {
      attribution: SATELLITE_ATTR,
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = layer;

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnLayersRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
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
        coords: snapped,
        color: FIELD_COLORS[fieldCount % FIELD_COLORS.length],
        crop: '',
        acres,
        lat: centroid.lat,
        lon: centroid.lon,
      });

      setFields(getFields());
      setSelectedFieldId(newField.id);
    });

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [step]);

  // Render field polygons
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
        weight: isSelected ? 4 : 3,
        fillColor: field.color || '#3d7a4a',
        fillOpacity: isSelected ? 0.35 : 0.2,
        dashArray: isSelected ? null : '8 4',
        opacity: isSelected ? 1 : 0.85,
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

  // Load existing profile when field selected
  useEffect(() => {
    if (!selectedFieldId) return;
    const existing = getProfile(selectedFieldId);
    if (existing) {
      if (existing.cropZones && existing.cropZones.length > 0) {
        setCropZones(existing.cropZones);
      }
      if (existing.fertilizers) {
        setSelectedFertilizers(existing.fertilizers);
      }
    }
  }, [selectedFieldId]);

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  const addZone = () => {
    setCropZones((prev) => [
      ...prev,
      { zone_name: `Zone ${prev.length + 1}`, crops_by_year: {} },
    ]);
  };

  const removeZone = (idx) => {
    if (cropZones.length <= 1) return;
    setCropZones((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateZoneName = (idx, name) => {
    setCropZones((prev) => prev.map((z, i) => i === idx ? { ...z, zone_name: name } : z));
  };

  const updateZoneCrop = (idx, year, crop) => {
    setCropZones((prev) => prev.map((z, i) =>
      i === idx ? { ...z, crops_by_year: { ...z.crops_by_year, [year]: crop } } : z
    ));
  };

  const toggleFertilizer = (name) => {
    setSelectedFertilizers((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
    );
  };

  // Pre-generate analysis as soon as crops + fertilizer step is reached,
  // so Dashboard results appear instant when the user clicks "Run Yield Analysis".
  useEffect(() => {
    if (step !== 3 || !selectedField) return;

    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);

    prefetchTimerRef.current = setTimeout(() => {
      const promise = fetch('/api/analysis/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: selectedField.id,
          crop_zones: cropZones.map((z) => ({
            zone_name: z.zone_name,
            crops_by_year: z.crops_by_year,
          })),
          fertilizers_used: selectedFertilizers,
          lat: selectedField.lat,
          lon: selectedField.lon,
        }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e?.detail || `HTTP ${r.status}`));
        return r.json();
      });

      window.__ohdeereAnalysis = { promise, fieldId: selectedField.id };
    }, 800);

    return () => clearTimeout(prefetchTimerRef.current);
  }, [step, selectedFertilizers]);

  const handleFinish = async () => {
    if (!selectedField) return;
    setSaving(true);

    const profile = {
      fieldId: selectedField.id,
      cropZones,
      fertilizers: selectedFertilizers,
      lat: selectedField.lat,
      lon: selectedField.lon,
    };

    saveProfile(selectedField.id, profile);

    // Also save to backend
    try {
      await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: selectedField.id,
          crop_zones: cropZones.map((z) => ({
            zone_name: z.zone_name,
            crops_by_year: z.crops_by_year,
          })),
          fertilizers_used: selectedFertilizers,
          lat: selectedField.lat,
          lon: selectedField.lon,
        }),
      });
    } catch (e) {
      // Profile saved locally, backend save is best-effort
    }

    setSaving(false);
    navigate('/');
  };

  const canProceedStep1 = selectedFieldId !== null;
  const canProceedStep2 = cropZones.every((z) =>
    z.zone_name.trim() !== '' && YEARS.every((y) => z.crops_by_year[y] && z.crops_by_year[y] !== '')
  );

  return (
    <div className="fade-in">
      <p className="page-subtitle">Set up your farm profile for yield analysis</p>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[1, 2, 3].map((s) => (
          <div key={s} style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 6,
            background: step === s ? 'var(--accent-primary)' : step > s ? 'rgba(61,122,74,0.12)' : 'var(--bg-secondary)',
            color: step === s ? '#fff' : step > s ? 'var(--accent-primary)' : 'var(--text-dim)',
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            border: `1px solid ${step === s ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            transition: 'all 0.2s ease',
          }}>
            Step {s}: {s === 1 ? 'Select Plot' : s === 2 ? 'Crop History' : 'Fertilizers'}
          </div>
        ))}
      </div>

      {/* Step 1: Select Plot */}
      {step === 1 && (
        <div>
          <HudPanel title="Select Your Plot">
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Use the drawing tools to outline your farm plot on the satellite map, or click an existing field to select it.
            </p>
            <div ref={mapRef} style={{ height: 420, borderRadius: 6, overflow: 'hidden' }} />
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>
              Draw a polygon or rectangle to outline your field. Shapes snap to 10m grid.
            </div>
          </HudPanel>

          {fields.length > 0 && (
            <HudPanel title="Your Fields" className="mt-3">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fields.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => {
                      setSelectedFieldId(f.id);
                      if (mapInstance.current && f.coords) {
                        mapInstance.current.fitBounds(f.coords, { padding: [30, 30] });
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: selectedFieldId === f.id ? 'rgba(61,122,74,0.06)' : 'var(--bg-panel)',
                      border: `2px solid ${selectedFieldId === f.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      borderRadius: 8, cursor: 'pointer',
                      color: 'var(--text-primary)', fontFamily: 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, background: f.color, flexShrink: 0,
                      border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                        {f.acres} ac{townNames[f.id] ? ` · ${townNames[f.id]}` : ''}
                      </div>
                    </div>
                    {selectedFieldId === f.id && (
                      <span style={{
                        fontSize: 10, color: '#fff', fontWeight: 600,
                        background: 'var(--accent-primary)', padding: '3px 8px',
                        borderRadius: 4,
                      }}>
                        Selected
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </HudPanel>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              className="btn btn-primary"
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
              style={{ padding: '10px 28px', fontSize: 13 }}
            >
              Next: Crop History
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Crop History */}
      {step === 2 && (
        <div>
          <HudPanel title={`Crop History for ${selectedField?.name || 'Field'}`}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Select the crops planted in each zone of your field for the past 3 years.
              Add zones if different parts of your plot had different crops.
            </p>

            {cropZones.map((zone, idx) => (
              <div key={idx} style={{
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                background: 'var(--bg-panel)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    value={zone.zone_name}
                    onChange={(e) => updateZoneName(idx, e.target.value)}
                    placeholder="Zone name"
                    className="input-field"
                    style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '6px 10px' }}
                  />
                  {cropZones.length > 1 && (
                    <button
                      onClick={() => removeZone(idx)}
                      className="btn"
                      style={{ padding: '6px 12px', fontSize: 11, color: 'var(--status-danger)' }}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {YEARS.map((year) => (
                    <div key={year}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                        {year}
                      </label>
                      <select
                        value={zone.crops_by_year[year] || ''}
                        onChange={(e) => updateZoneCrop(idx, year, e.target.value)}
                        className="input-field"
                        style={{ width: '100%', fontSize: 12, padding: '8px 10px' }}
                      >
                        <option value="">Select crop...</option>
                        {crops.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={addZone} className="btn" style={{ fontSize: 12, padding: '8px 16px' }}>
              + Add Zone
            </button>
          </HudPanel>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(1)} style={{ padding: '10px 28px', fontSize: 13 }}>
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={!canProceedStep2}
              onClick={() => setStep(3)}
              style={{ padding: '10px 28px', fontSize: 13 }}
            >
              Next: Fertilizers
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Fertilizers */}
      {step === 3 && (
        <div>
          <HudPanel title="Fertilizers Applied">
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Select all fertilizers you have applied to this field. This data helps calculate dissolved nutrients and soil health predictions.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {fertilizers.map((f) => (
                <button
                  key={f.name}
                  onClick={() => toggleFertilizer(f.name)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: `1px solid ${selectedFertilizers.includes(f.name) ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: selectedFertilizers.includes(f.name) ? 'rgba(61,122,74,0.06)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    color: 'var(--text-primary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    NPK: {f.npk_ratio} | {f.nutrients}
                  </div>
                </button>
              ))}
            </div>

            {selectedFertilizers.length > 0 && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(61,122,74,0.04)', borderRadius: 6, border: '1px solid rgba(61,122,74,0.1)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)', marginBottom: 4 }}>
                  Selected ({selectedFertilizers.length}):
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {selectedFertilizers.join(', ')}
                </div>
              </div>
            )}
          </HudPanel>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(2)} style={{ padding: '10px 28px', fontSize: 13 }}>
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={handleFinish}
              style={{ padding: '10px 28px', fontSize: 13 }}
            >
              {saving ? 'Saving...' : 'Complete Setup'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
