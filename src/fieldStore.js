/**
 * Shared field store backed by localStorage.
 * Replaces hardcoded fields.js — all pages use this for user-drawn farm fields.
 */

const STORAGE_KEY = 'ohdeere_fields';

function getFields() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFields(fields) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  window.dispatchEvent(new CustomEvent('ohdeere-fields-changed', { detail: fields }));
}

function addField(field) {
  const fields = getFields();
  const id = field.id || Date.now();
  const newField = { ...field, id, createdAt: new Date().toISOString() };
  fields.push(newField);
  saveFields(fields);
  return newField;
}

function updateField(id, updates) {
  const fields = getFields();
  const idx = fields.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  fields[idx] = { ...fields[idx], ...updates };
  saveFields(fields);
  return fields[idx];
}

function deleteField(id) {
  const fields = getFields().filter((f) => f.id !== id);
  saveFields(fields);
}

function getFieldById(id) {
  return getFields().find((f) => f.id === id) || null;
}

/**
 * Compute the centroid of a polygon defined by [[lat, lng], ...] coords.
 */
function computeCentroid(coords) {
  if (!coords || coords.length === 0) return { lat: 0, lon: 0 };
  const sum = coords.reduce(
    (acc, [lat, lng]) => ({ lat: acc.lat + lat, lon: acc.lon + lng }),
    { lat: 0, lon: 0 }
  );
  return {
    lat: Math.round((sum.lat / coords.length) * 1e6) / 1e6,
    lon: Math.round((sum.lon / coords.length) * 1e6) / 1e6,
  };
}

/**
 * Compute area in acres from polygon coords [[lat, lng], ...].
 * Uses the Shoelace formula on approximate metric distances.
 */
function computeAcres(coords) {
  if (!coords || coords.length < 3) return 0;
  const toRad = (d) => (d * Math.PI) / 180;
  const centroid = computeCentroid(coords);
  const cosLat = Math.cos(toRad(centroid.lat));
  // Convert lat/lng to meters relative to centroid
  const points = coords.map(([lat, lng]) => ({
    x: (lng - centroid.lon) * cosLat * 111320,
    y: (lat - centroid.lat) * 110540,
  }));
  // Shoelace formula for area in m²
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  area = Math.abs(area) / 2;
  // Convert m² to acres (1 acre = 4046.86 m²)
  return Math.round((area / 4046.86) * 10) / 10;
}

/**
 * Snap polygon coordinates to a ~10m grid (Sentinel-2 pixel resolution).
 * Grid step: ~10m in lat/lon degrees.
 */
function snapToGrid(coords, gridMeters = 10) {
  const latStep = gridMeters / 110540;
  const snap = (val, step) => Math.round(val / step) * step;
  return coords.map(([lat, lng]) => {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const lonStep = gridMeters / (111320 * cosLat);
    return [
      Math.round(snap(lat, latStep) * 1e6) / 1e6,
      Math.round(snap(lng, lonStep) * 1e6) / 1e6,
    ];
  });
}

export {
  getFields,
  addField,
  updateField,
  deleteField,
  getFieldById,
  computeCentroid,
  computeAcres,
  snapToGrid,
};
