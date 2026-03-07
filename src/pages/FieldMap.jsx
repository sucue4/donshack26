import React, { useState, useEffect, useRef, useCallback } from 'react';
import HudPanel from '../components/HudPanel';
import MetricCard from '../components/MetricCard';
import {
  getFields, addField, deleteField, updateField,
  computeCentroid, computeAcres, snapToGrid,
} from '../fieldStore';

const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTR = 'Esri, Maxar, Earthstar Geographics';
const STREET_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const STREET_ATTR = '&copy; OpenStreetMap contributors';

const FIELD_COLORS = ['#3d7a4a', '#7ab87f', '#c0a030', '#4a7a8c', '#8a6a3a', '#b5403a', '#6b4a8c'];

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

export default function FieldMap() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layerRef = useRef(null);
  const drawnLayersRef = useRef(null);
  const drawControlRef = useRef(null);
  const fieldPolygonsRef = useRef({});

  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [mapView, setMapView] = useState('satellite');
  const [mapReady, setMapReady] = useState(false);
  const [fieldData, setFieldData] = useState({});
  const [loadingData, setLoadingData] = useState(false);
  const [errors, setErrors] = useState({});
  const [satStatus, setSatStatus] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [townNames, setTownNames] = useState({});

  const loadFields = useCallback(() => {
    setFields(getFields());
  }, []);

  useEffect(() => {
    loadFields();
    const handler = () => loadFields();
    window.addEventListener('ohdeere-fields-changed', handler);
    return () => window.removeEventListener('ohdeere-fields-changed', handler);
  }, [loadFields]);

  // Reverse geocode town names for all fields
  useEffect(() => {
    fields.forEach((f) => {
      if (f.lat && f.lon && !townNames[f.id]) {
        reverseGeocode(f.lat, f.lon).then((name) => {
          setTownNames((prev) => ({ ...prev, [f.id]: name }));
        });
      }
    });
  }, [fields]);

  // Check satellite service status on mount
  useEffect(() => {
    fetch('/api/satellite/status')
      .then((r) => r.json())
      .then((data) => setSatStatus(data))
      .catch(() => setSatStatus({ status: 'error', message: 'Backend unreachable' }));
  }, []);

  // Initialize map
  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;
    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [38.94, -92.313],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
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
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      const rawCoords = layer.getLatLngs()[0].map((ll) => [ll.lat, ll.lng]);
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
      setSelectedField(newField);
      fetchFieldData(newField);
    });

    mapInstance.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Render field polygons with improved visibility
  useEffect(() => {
    if (!mapInstance.current || !mapReady) return;
    const L = window.L;
    const map = mapInstance.current;

    Object.values(fieldPolygonsRef.current).forEach((p) => map.removeLayer(p));
    fieldPolygonsRef.current = {};

    fields.forEach((field) => {
      if (!field.coords || field.coords.length < 3) return;
      const isSelected = selectedField?.id === field.id;
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

      polygon.on('click', () => {
        setSelectedField(field);
        fetchFieldData(field);
      });

      fieldPolygonsRef.current[field.id] = polygon;
    });
  }, [fields, selectedField, mapReady, townNames]);

  const fetchFieldData = async (field) => {
    if (!field) return;
    setLoadingData(true);
    const newErrors = {};
    const newData = {};

    try {
      const soilRes = await fetch(`/api/soil/properties?lat=${field.lat}&lon=${field.lon}`);
      if (!soilRes.ok) {
        const err = await soilRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${soilRes.status}`);
      }
      newData.soil = await soilRes.json();
    } catch (e) { newErrors.soil = e.message; }

    try {
      const wxRes = await fetch(`/api/weather/forecast?lat=${field.lat}&lon=${field.lon}&days=3`);
      if (!wxRes.ok) {
        const err = await wxRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${wxRes.status}`);
      }
      newData.weather = await wxRes.json();
    } catch (e) { newErrors.weather = e.message; }

    try {
      const ndviRes = await fetch('/api/satellite/ndvi?' + new URLSearchParams({
        start_date: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: field.coords, name: field.name }),
      });
      if (!ndviRes.ok) {
        const err = await ndviRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${ndviRes.status}`);
      }
      newData.ndvi = await ndviRes.json();
    } catch (e) { newErrors.ndvi = e.message; }

    setFieldData((prev) => ({ ...prev, [field.id]: newData }));
    setErrors((prev) => ({ ...prev, [field.id]: newErrors }));
    setLoadingData(false);
  };

  const toggleMapView = () => {
    if (!mapInstance.current || !layerRef.current) return;
    const L = window.L;
    mapInstance.current.removeLayer(layerRef.current);
    const newView = mapView === 'satellite' ? 'street' : 'satellite';
    const url = newView === 'satellite' ? SATELLITE_URL : STREET_URL;
    const attr = newView === 'satellite' ? SATELLITE_ATTR : STREET_ATTR;
    layerRef.current = L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(mapInstance.current);
    setMapView(newView);
  };

  const handleDeleteField = (id) => {
    deleteField(id);
    if (selectedField?.id === id) setSelectedField(null);
    setFields(getFields());
    setDeleteConfirm(null);
  };

  const startRename = (e, field) => {
    e.stopPropagation();
    setEditingName(field.id);
    setNameInput(field.name);
  };

  const commitRename = (id) => {
    const trimmed = nameInput.trim();
    if (trimmed) {
      updateField(id, { name: trimmed });
      setFields(getFields());
      if (selectedField?.id === id) {
        setSelectedField((prev) => ({ ...prev, name: trimmed }));
      }
    }
    setEditingName(null);
  };

  const cancelRename = () => {
    setEditingName(null);
  };

  const data = selectedField ? fieldData[selectedField.id] || {} : {};
  const errs = selectedField ? errors[selectedField.id] || {} : {};
  const topSoil = data.soil?.profiles?.[0];
  const wxDaily = data.weather?.daily;
  const ndvi = data.ndvi?.indices?.ndvi;

  return (
    <div className="fade-in">
      <p className="page-subtitle">
        Draw your farm boundaries on the satellite map -- shapes snap to 10m grid (Sentinel-2 resolution)
      </p>

      {satStatus && satStatus.status !== 'ok' && (
        <div className="data-notice data-notice-error" style={{ marginBottom: 12 }}>
          Satellite/NDVI: {satStatus.message}
        </div>
      )}

      <div className="grid-2-1">
        <HudPanel title="Satellite View"
          actions={
            <button className="btn" onClick={toggleMapView} style={{ padding: '4px 10px', fontSize: 10 }}>
              {mapView === 'satellite' ? 'Street View' : 'Satellite View'}
            </button>
          }
        >
          <div
            ref={mapRef}
            style={{ height: 520, borderRadius: 6, overflow: 'hidden' }}
          />
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>
            Use the draw tools (top-left) to outline your fields. Polygons snap to a 10m grid.
          </div>
        </HudPanel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <HudPanel title="Your Fields" actions={
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
          }>
            {fields.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '16px 0', textAlign: 'center' }}>
                No fields defined yet. Use the drawing tools on the map to draw your field boundaries.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fields.map((f) => {
                  const isSelected = selectedField?.id === f.id;
                  const isEditing = editingName === f.id;
                  const isDeleting = deleteConfirm === f.id;

                  return (
                    <div key={f.id} style={{
                      borderRadius: 8,
                      border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: isSelected ? 'rgba(61,122,74,0.06)' : 'var(--bg-panel)',
                      overflow: 'hidden',
                      transition: 'all 0.15s ease',
                    }}>
                      {/* Main row */}
                      <div
                        onClick={() => {
                          if (isEditing) return;
                          setSelectedField(f);
                          fetchFieldData(f);
                          if (mapInstance.current && f.coords) {
                            mapInstance.current.fitBounds(f.coords, { padding: [30, 30] });
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          cursor: isEditing ? 'default' : 'pointer',
                        }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: 4,
                          background: f.color, flexShrink: 0,
                          border: '2px solid rgba(255,255,255,0.3)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(f.id);
                                if (e.key === 'Escape') cancelRename();
                              }}
                              onBlur={() => commitRename(f.id)}
                              autoFocus
                              className="input-field"
                              style={{
                                fontSize: 12, fontWeight: 600, padding: '4px 8px',
                                width: '100%', background: '#fff',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                {f.name}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                                {f.acres} ac{townNames[f.id] ? ` · ${townNames[f.id]}` : ''}
                              </div>
                            </>
                          )}
                        </div>

                        {!isEditing && (
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            <button
                              onClick={(e) => startRename(e, f)}
                              title="Rename field"
                              className="field-action-btn"
                              style={{
                                width: 28, height: 28, borderRadius: 6,
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, color: 'var(--text-secondary)',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                            >
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 1.5l3.5 3.5L5 14.5H1.5V11z"/>
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(f.id); }}
                              title="Delete field"
                              className="field-action-btn"
                              style={{
                                width: 28, height: 28, borderRadius: 6,
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, color: 'var(--text-secondary)',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--status-danger)'; e.currentTarget.style.color = 'var(--status-danger)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                            >
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Delete confirmation bar */}
                      {isDeleting && (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'rgba(181,64,58,0.06)',
                          borderTop: '1px solid rgba(181,64,58,0.12)',
                        }}>
                          <span style={{ fontSize: 11, color: 'var(--status-danger)', fontWeight: 500 }}>
                            Delete this field?
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                              style={{
                                padding: '4px 12px', fontSize: 11, fontWeight: 500,
                                background: 'var(--bg-panel)', border: '1px solid var(--border-color)',
                                borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
                                fontFamily: 'inherit',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteField(f.id); }}
                              style={{
                                padding: '4px 12px', fontSize: 11, fontWeight: 600,
                                background: 'var(--status-danger)', border: '1px solid var(--status-danger)',
                                borderRadius: 4, cursor: 'pointer', color: '#fff',
                                fontFamily: 'inherit',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </HudPanel>

          {selectedField && (
            <HudPanel title="Field Details">
              {loadingData && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>Loading field data...</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--accent-primary)' }}>
                  {selectedField.name}
                </div>

                <DetailRow label="Acreage" value={`${selectedField.acres} ac`} />
                <DetailRow label="Location" value={townNames[selectedField.id] || `${selectedField.lat}, ${selectedField.lon}`} />
                <DetailRow label="Coordinates" value={`${selectedField.lat}, ${selectedField.lon}`} />
                <DetailRow label="Crop" value={selectedField.crop || 'Not set'} />

                <SectionHeader label="SOIL DATA" />
                {errs.soil ? (
                  <ErrorRow message={errs.soil} />
                ) : topSoil ? (
                  <>
                    <DetailRow label="Soil pH" value={topSoil.phh2o || topSoil.ph || '--'} />
                    <DetailRow label="Clay/Silt/Sand" value={`${topSoil.clay || '--'}/${topSoil.silt || '--'}/${topSoil.sand || '--'}%`} />
                    <DetailRow label="Organic C" value={`${topSoil.soc || topSoil.organic || '--'}%`} />
                    <DetailRow label="CEC" value={`${topSoil.cec || '--'} cmol/kg`} />
                  </>
                ) : !loadingData ? (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No soil data loaded</div>
                ) : null}

                <SectionHeader label="WEATHER" />
                {errs.weather ? (
                  <ErrorRow message={errs.weather} />
                ) : wxDaily ? (
                  <>
                    <DetailRow label="Today High" value={`${Math.round(wxDaily.temperature_2m_max?.[0] || 0)} C`} />
                    <DetailRow label="Today Low" value={`${Math.round(wxDaily.temperature_2m_min?.[0] || 0)} C`} />
                    <DetailRow label="Precip Today" value={`${wxDaily.precipitation_sum?.[0] || 0} mm`} />
                  </>
                ) : !loadingData ? (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No weather data loaded</div>
                ) : null}

                <SectionHeader label="NDVI (SATELLITE)" />
                {errs.ndvi ? (
                  <ErrorRow message={errs.ndvi} />
                ) : ndvi ? (
                  <>
                    <DetailRow label="NDVI Mean" value={ndvi.mean?.toFixed(2) || '--'} />
                    <DetailRow label="NDVI Range" value={`${ndvi.min?.toFixed(2) || '--'} - ${ndvi.max?.toFixed(2) || '--'}`} />
                  </>
                ) : !loadingData ? (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No NDVI data loaded</div>
                ) : null}
              </div>
            </HudPanel>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{
      borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 4,
      fontSize: 10, fontWeight: 600, color: 'var(--text-dim)',
      letterSpacing: '0.8px', textTransform: 'uppercase',
    }}>
      {label}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderBottom: '1px solid #f0eeea', paddingBottom: 4 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ErrorRow({ message }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--status-danger)', background: 'rgba(181,64,58,0.06)', padding: '6px 8px', borderRadius: 4, wordBreak: 'break-word' }}>
      {message}
    </div>
  );
}
