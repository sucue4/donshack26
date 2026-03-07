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

  const loadFields = useCallback(() => {
    setFields(getFields());
  }, []);

  useEffect(() => {
    loadFields();
    const handler = () => loadFields();
    window.addEventListener('ohdeere-fields-changed', handler);
    return () => window.removeEventListener('ohdeere-fields-changed', handler);
  }, [loadFields]);

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

    // Drawing layer
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnLayersRef.current = drawnItems;

    // Draw control
    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#3d7a4a', weight: 2, fillOpacity: 0.15 },
        },
        rectangle: {
          shapeOptions: { color: '#3d7a4a', weight: 2, fillOpacity: 0.15 },
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

    // Handle new shape drawn
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

  // Render field polygons on map when fields change
  useEffect(() => {
    if (!mapInstance.current || !mapReady) return;
    const L = window.L;
    const map = mapInstance.current;

    // Remove old polygons
    Object.values(fieldPolygonsRef.current).forEach((p) => map.removeLayer(p));
    fieldPolygonsRef.current = {};

    fields.forEach((field) => {
      if (!field.coords || field.coords.length < 3) return;
      const polygon = L.polygon(field.coords, {
        color: field.color || '#3d7a4a',
        weight: 2,
        fillColor: field.color || '#3d7a4a',
        fillOpacity: selectedField?.id === field.id ? 0.3 : 0.15,
        dashArray: selectedField?.id === field.id ? null : '5 5',
      }).addTo(map);

      polygon.bindTooltip(field.name, {
        className: 'field-tooltip',
        direction: 'center',
        permanent: false,
      });

      polygon.on('click', () => {
        setSelectedField(field);
        fetchFieldData(field);
      });

      fieldPolygonsRef.current[field.id] = polygon;
    });
  }, [fields, selectedField, mapReady]);

  const fetchFieldData = async (field) => {
    if (!field) return;
    setLoadingData(true);
    const newErrors = {};
    const newData = {};

    // Fetch soil data
    try {
      const soilRes = await fetch(`/api/soil/properties?lat=${field.lat}&lon=${field.lon}`);
      if (!soilRes.ok) {
        const err = await soilRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${soilRes.status}`);
      }
      const soilData = await soilRes.json();
      newData.soil = soilData;
    } catch (e) {
      newErrors.soil = e.message;
    }

    // Fetch weather data
    try {
      const wxRes = await fetch(`/api/weather/forecast?lat=${field.lat}&lon=${field.lon}&days=3`);
      if (!wxRes.ok) {
        const err = await wxRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${wxRes.status}`);
      }
      const wxData = await wxRes.json();
      newData.weather = wxData;
    } catch (e) {
      newErrors.weather = e.message;
    }

    // Fetch NDVI data
    try {
      const ndviRes = await fetch('/api/satellite/ndvi?' + new URLSearchParams({
        start_date: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinates: field.coords,
          name: field.name,
        }),
      });
      if (!ndviRes.ok) {
        const err = await ndviRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${ndviRes.status}`);
      }
      const ndviData = await ndviRes.json();
      newData.ndvi = ndviData;
    } catch (e) {
      newErrors.ndvi = e.message;
    }

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
  };

  const handleRenameField = (id) => {
    updateField(id, { name: nameInput });
    setEditingName(null);
    setFields(getFields());
    if (selectedField?.id === id) {
      setSelectedField({ ...selectedField, name: nameInput });
    }
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {fields.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => {
                        setSelectedField(f);
                        fetchFieldData(f);
                        if (mapInstance.current && f.coords) {
                          mapInstance.current.fitBounds(f.coords, { padding: [30, 30] });
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', flex: 1,
                        background: selectedField?.id === f.id ? 'rgba(61,122,74,0.08)' : 'transparent',
                        border: `1px solid ${selectedField?.id === f.id ? 'rgba(61,122,74,0.2)' : 'transparent'}`,
                        borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                        color: 'var(--text-primary)', fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: f.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        {editingName === f.id ? (
                          <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameField(f.id)}
                            onBlur={() => handleRenameField(f.id)}
                            autoFocus
                            style={{ fontSize: 12, fontWeight: 500, border: '1px solid #ccc', borderRadius: 3, padding: '2px 4px', width: '100%' }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{f.name}</div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                          {f.acres} acres {f.crop ? `-- ${f.crop}` : ''}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingName(f.id); setNameInput(f.name); }}
                      title="Rename"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, padding: '4px', color: 'var(--text-dim)' }}
                    >
                      E
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteField(f.id); }}
                      title="Delete field"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, padding: '4px', color: 'var(--status-danger)' }}
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            )}
          </HudPanel>

          {selectedField && (
            <HudPanel title="Field Details">
              {loadingData && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>Loading field data...</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--accent-primary)' }}>
                  {selectedField.name}
                </div>

                <DetailRow label="Acreage" value={`${selectedField.acres} ac`} />
                <DetailRow label="Location" value={`${selectedField.lat}, ${selectedField.lon}`} />
                <DetailRow label="Crop" value={selectedField.crop || 'Not set'} />

                <div style={{ borderTop: '1px solid #e2e0dc', paddingTop: 8, marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>
                  SOIL DATA
                </div>
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

                <div style={{ borderTop: '1px solid #e2e0dc', paddingTop: 8, marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>
                  WEATHER
                </div>
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

                <div style={{ borderTop: '1px solid #e2e0dc', paddingTop: 8, marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>
                  NDVI (SATELLITE)
                </div>
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
