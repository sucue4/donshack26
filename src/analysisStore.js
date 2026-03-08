/**
 * Shared analysis cache — Dashboard stores full results here,
 * sub-pages read from cache for instant navigation.
 */

const CACHE_KEY = 'ohdeere_analysis_cache';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function _read() {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function _write(data) {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

/** Store full analysis result for a field */
export function cacheAnalysis(fieldId, analysis) {
  const store = _read();
  store[String(fieldId)] = { data: analysis, ts: Date.now() };
  _write(store);
}

/** Get cached analysis for a field, or null if stale/missing */
export function getCachedAnalysis(fieldId) {
  const store = _read();
  const entry = store[String(fieldId)];
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return entry.data;
}

/** Get a single category from cached full analysis */
export function getCachedCategory(fieldId, category) {
  const full = getCachedAnalysis(fieldId);
  if (!full) return null;
  const keyMap = {
    weather: 'weather',
    soil: 'soil_health',
    pest: 'pest_forecast',
    drought: 'drought_resistance',
    monoculture: 'monoculture_risk',
  };
  return full[keyMap[category]] || null;
}

/** Clear cache for a specific field or all */
export function clearAnalysisCache(fieldId) {
  if (fieldId) {
    const store = _read();
    delete store[String(fieldId)];
    _write(store);
  } else {
    sessionStorage.removeItem(CACHE_KEY);
  }
}
