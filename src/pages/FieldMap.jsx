import React, { useState, useEffect, useRef } from 'react';
import HudPanel from '../components/HudPanel';

const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Esri, Maxar, Earthstar Geographics';

const SAMPLE_FIELDS = [
  { id: 1, name: 'Field A-1 (Corn)', coords: [[38.955, -92.335], [38.955, -92.315], [38.940, -92.315], [38.940, -92.335]], color: '#00d4ff', crop: 'Corn', acres: 80 },
  { id: 2, name: 'Field A-2 (Soybean)', coords: [[38.940, -92.335], [38.940, -92.315], [38.925, -92.315], [38.925, -92.335]], color: '#00ff88', crop: 'Soybean', acres: 80 },
  { id: 3, name: 'Field B-1 (Corn)', coords: [[38.955, -92.310], [38.955, -92.290], [38.940, -92.290], [38.940, -92.310]], color: '#00d4ff', crop: 'Corn', acres: 120 },
  { id: 4, name: 'Field C-1 (Wheat)', coords: [[38.940, -92.310], [38.940, -92.290], [38.925, -92.290], [38.925, -92.310]], color: '#ffaa00', crop: 'Wheat', acres: 95 },
  { id: 5, name: 'Field D-1 (Cover Crop)', coords: [[38.925, -92.335], [38.925, -92.315], [38.912, -92.315], [38.912, -92.335]], color: '#ff3355', crop: 'Cover Crop', acres: 65 },
];

export default function FieldMap() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [selectedField, setSelectedField] = useState(null);
  const [mapReady, setMapReady] = useState(false);

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

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 18,
    }).addTo(map);

    SAMPLE_FIELDS.forEach((field) => {
      const polygon = L.polygon(field.coords, {
        color: field.color,
        weight: 2,
        fillColor: field.color,
        fillOpacity: 0.15,
        dashArray: '5 5',
      }).addTo(map);

      polygon.bindTooltip(field.name, {
        className: 'field-tooltip',
        direction: 'center',
        permanent: false,
      });

      polygon.on('click', () => setSelectedField(field));
    });

    mapInstance.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  return (
    <div className="fade-in">
      <div className="page-title">
        <span className="title-icon">◎</span> Field Map
      </div>
      <p className="page-subtitle">Interactive satellite view of your fields — click a field for details</p>

      <div className="grid-2-1">
        <HudPanel title="Satellite View" icon="◎">
          <div
            ref={mapRef}
            style={{ height: 500, borderRadius: 6, overflow: 'hidden' }}
          />
        </HudPanel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <HudPanel title="Field Registry" icon="▦">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SAMPLE_FIELDS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setSelectedField(f);
                    if (mapInstance.current) {
                      mapInstance.current.fitBounds(f.coords, { padding: [30, 30] });
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    background: selectedField?.id === f.id ? 'rgba(0,212,255,0.1)' : 'transparent',
                    border: `1px solid ${selectedField?.id === f.id ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
                    borderRadius: 4, cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 0.15s ease', color: 'var(--text-primary)', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: f.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{f.acres} acres</div>
                  </div>
                </button>
              ))}
            </div>
          </HudPanel>

          {selectedField && (
            <HudPanel title="Field Details" icon="◇">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--accent-primary)' }}>
                  {selectedField.name}
                </div>
                {[
                  ['Crop', selectedField.crop],
                  ['Acreage', `${selectedField.acres} ac`],
                  ['NDVI', '0.74 (Good)'],
                  ['Soil Type', 'Silt Loam'],
                  ['Last Scouted', '3 days ago'],
                  ['Growth Stage', 'V8 (Corn)'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderBottom: '1px solid rgba(0,212,255,0.06)', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--text-dim)' }}>{k}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </HudPanel>
          )}
        </div>
      </div>
    </div>
  );
}
