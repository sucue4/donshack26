"""Google Earth Engine satellite service.

Requires authentication: ee.Authenticate() then ee.Initialize(project='<id>')
"""

# NOTE: Earth Engine requires local authentication and project setup.
# This module provides the interface; actual EE calls require a valid
# service account or authenticated session.


def get_ndvi_composite(field_geometry: dict, start_date: str, end_date: str) -> dict:
    """
    Compute NDVI composite for a field boundary.
    Returns mean NDVI, NDRE, and NDMI for the field.

    In production, this calls Google Earth Engine:
      ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(geometry)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

    For demo/offline mode, returns representative sample data.
    """
    return {
        "field": field_geometry,
        "period": {"start": start_date, "end": end_date},
        "indices": {
            "ndvi": {"mean": 0.74, "min": 0.52, "max": 0.88, "std": 0.08},
            "ndre": {"mean": 0.38, "min": 0.22, "max": 0.48, "std": 0.06},
            "ndmi": {"mean": 0.21, "min": 0.08, "max": 0.35, "std": 0.07},
        },
        "cloud_cover_pct": 8.2,
        "imagery_date": end_date,
        "source": "demo_mode",
        "note": "Configure GEE_PROJECT_ID in .env for live satellite data",
    }


def get_historical_ndvi(field_geometry: dict, years: int = 3) -> list:
    """Return historical NDVI monthly averages for comparison."""
    # Demo data representing seasonal NDVI curve
    months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    # Typical Midwest corn NDVI seasonal pattern
    seasonal = [0.18, 0.18, 0.22, 0.35, 0.55, 0.72, 0.82, 0.78, 0.65, 0.38, 0.22, 0.18]
    return [{"month": m, "ndvi_avg": v} for m, v in zip(months, seasonal)]
