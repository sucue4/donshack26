"""ISRIC SoilGrids service — no API key required."""

import logging

import httpx
from config import SOILGRIDS_ENDPOINT

logger = logging.getLogger("ohdeere.services.soilgrids")

PROPERTIES = ["clay", "sand", "silt", "phh2o", "soc", "nitrogen", "cec", "bdod"]
DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"]

FALLBACK_PROFILES = [
    {"depth": "0-5cm", "clay": 22, "sand": 38, "silt": 40, "phh2o": 6.5, "soc": 3.2, "nitrogen": 0.18, "cec": 18.4, "bdod": 1.3},
    {"depth": "5-15cm", "clay": 24, "sand": 36, "silt": 40, "phh2o": 6.3, "soc": 2.8, "nitrogen": 0.15, "cec": 17.1, "bdod": 1.35},
    {"depth": "15-30cm", "clay": 28, "sand": 34, "silt": 38, "phh2o": 6.1, "soc": 1.9, "nitrogen": 0.11, "cec": 15.8, "bdod": 1.4},
    {"depth": "30-60cm", "clay": 32, "sand": 30, "silt": 38, "phh2o": 6.0, "soc": 1.2, "nitrogen": 0.08, "cec": 14.2, "bdod": 1.45},
    {"depth": "60-100cm", "clay": 35, "sand": 28, "silt": 37, "phh2o": 5.9, "soc": 0.6, "nitrogen": 0.04, "cec": 12.6, "bdod": 1.5},
]


async def get_soil_properties(lat: float, lon: float) -> dict:
    """Query SoilGrids for soil properties at a location. Falls back to sample data on failure."""
    params = {
        "lon": lon,
        "lat": lat,
        "property": PROPERTIES,
        "depth": DEPTHS,
        "value": "mean",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(SOILGRIDS_ENDPOINT, params=params)
            resp.raise_for_status()
            raw = resp.json()

        # Parse into a friendlier structure
        result = {"location": {"lat": lat, "lon": lon}, "profiles": []}
        properties = raw.get("properties", {})
        layers = properties.get("layers", [])

        depth_data = {d: {} for d in DEPTHS}
        for layer in layers:
            prop_name = layer.get("name", "")
            unit_info = layer.get("unit_measure", {})
            for depth_entry in layer.get("depths", []):
                depth_label = depth_entry.get("label", "")
                values = depth_entry.get("values", {})
                mean_val = values.get("mean")
                if depth_label in depth_data and mean_val is not None:
                    # SoilGrids returns integers with a conversion factor
                    factor = unit_info.get("d_factor", 1)
                    converted = mean_val / factor if factor else mean_val
                    depth_data[depth_label][prop_name] = round(converted, 2)

        for depth, props in depth_data.items():
            if props:
                result["profiles"].append({"depth": depth, **props})

        return result
    except Exception as exc:
        logger.warning("SoilGrids unavailable, using fallback data: %s", exc)
        return {
            "location": {"lat": lat, "lon": lon},
            "profiles": FALLBACK_PROFILES,
            "source": "fallback",
        }
