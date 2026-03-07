/**
 * Farm profile store backed by localStorage.
 * Stores crop history (by zone), fertilizers used, and onboarding status per field.
 */

const STORAGE_KEY = 'ohdeere_farm_profiles';

function getProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  window.dispatchEvent(new CustomEvent('ohdeere-profiles-changed', { detail: profiles }));
}

function getProfile(fieldId) {
  const profiles = getProfiles();
  return profiles[fieldId] || null;
}

function saveProfile(fieldId, profile) {
  const profiles = getProfiles();
  profiles[fieldId] = { ...profile, fieldId, updatedAt: new Date().toISOString() };
  saveProfiles(profiles);
  return profiles[fieldId];
}

function deleteProfile(fieldId) {
  const profiles = getProfiles();
  delete profiles[fieldId];
  saveProfiles(profiles);
}

function isOnboarded(fieldId) {
  const profile = getProfile(fieldId);
  if (!profile) return false;
  return !!(profile.cropZones && profile.cropZones.length > 0 && profile.fertilizers);
}

export {
  getProfiles,
  getProfile,
  saveProfile,
  deleteProfile,
  isOnboarded,
};
