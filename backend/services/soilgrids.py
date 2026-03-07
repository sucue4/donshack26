"""ISRIC SoilGrids service — no API key required."""

import httpx
from config import SOILGRIDS_ENDPOINT

PROPERTIES = ["clay", "sand", "silt", "phh2o", "soc", "nitrogen", "cec", "bdod"]
DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"]


async def get_soil_properties(lat: float, lon: float) -> dict:
    """Query SoilGrids for soil properties at a location."""
    params = {
        "lon": lon,
        "lat": lat,
        "property": PROPERTIES,
        "depth": DEPTHS,
        "value": "mean",
    }
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
