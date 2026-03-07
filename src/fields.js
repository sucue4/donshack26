/**
 * Shared farm field definitions.
 * Used for plot/field selection across Dashboard, Weather, SoilHealth, and FieldMap.
 */
const FARM_FIELDS = [
  { id: 1, name: 'Field A-1 (Corn)', lat: 38.9475, lon: -92.325, crop: 'Corn', acres: 80 },
  { id: 2, name: 'Field A-2 (Soybean)', lat: 38.9325, lon: -92.325, crop: 'Soybean', acres: 80 },
  { id: 3, name: 'Field B-1 (Corn)', lat: 38.9475, lon: -92.300, crop: 'Corn', acres: 120 },
  { id: 4, name: 'Field C-1 (Wheat)', lat: 38.9325, lon: -92.300, crop: 'Wheat', acres: 95 },
  { id: 5, name: 'Field D-1 (Cover Crop)', lat: 38.9185, lon: -92.325, crop: 'Cover Crop', acres: 65 },
];

export default FARM_FIELDS;
