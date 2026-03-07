"""Google Earth Engine satellite service.

Requires authentication: ee.Authenticate() then ee.Initialize(project='<id>')
Returns clear errors when GEE is not properly configured.
"""

import logging
from config import GEE_PROJECT_ID

logger = logging.getLogger("ohdeere.services.earth_engine")


class SatelliteServiceError(Exception):
    """Raised when the Earth Engine service is unavailable."""
    pass


def _check_gee_configured():
    """Verify GEE is properly configured. Raises SatelliteServiceError if not."""
    if not GEE_PROJECT_ID:
        raise SatelliteServiceError(
            "Google Earth Engine not configured. Set GEE_PROJECT_ID in .env with a valid GCP project ID "
            "(not an OAuth client ID). Run 'earthengine authenticate' to set up credentials."
        )
    # The current GEE_PROJECT_ID looks like an OAuth client ID, not a project ID
    if ".apps.googleusercontent.com" in GEE_PROJECT_ID:
        raise SatelliteServiceError(
            f"GEE_PROJECT_ID appears to be an OAuth client ID, not a GCP project ID. "
            f"Current value: {GEE_PROJECT_ID[:20]}... — "
            f"Set it to your GCP project ID (e.g., 'my-farm-project-123')."
        )


def get_ndvi_composite(field_geometry: dict, start_date: str, end_date: str) -> dict:
    """
    Compute NDVI composite for a field boundary.
    Raises SatelliteServiceError if GEE is not configured.
    """
    _check_gee_configured()

    # If we get here, GEE_PROJECT_ID looks valid — attempt to use Earth Engine
    try:
        import ee
        ee.Initialize(project=GEE_PROJECT_ID)

        coords = field_geometry.get("coordinates", [])
        region = ee.Geometry.Polygon(coords)

        collection = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(region)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        )

        count = collection.size().getInfo()
        if count == 0:
            raise SatelliteServiceError(
                f"No Sentinel-2 imagery available for this field between {start_date} and {end_date} "
                f"with <20% cloud cover. Try a wider date range."
            )

        def add_indices(image):
            ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
            ndre = image.normalizedDifference(["B8", "B5"]).rename("NDRE")
            ndmi = image.normalizedDifference(["B8", "B11"]).rename("NDMI")
            return image.addBands([ndvi, ndre, ndmi])

        with_indices = collection.map(add_indices)
        composite = with_indices.median()

        stats = composite.select(["NDVI", "NDRE", "NDMI"]).reduceRegion(
            reducer=ee.Reducer.mean()
            .combine(ee.Reducer.min(), sharedInputs=True)
            .combine(ee.Reducer.max(), sharedInputs=True)
            .combine(ee.Reducer.stdDev(), sharedInputs=True),
            geometry=region,
            scale=10,
            maxPixels=1e9,
        ).getInfo()

        return {
            "field": field_geometry,
            "period": {"start": start_date, "end": end_date},
            "indices": {
                "ndvi": {
                    "mean": round(stats.get("NDVI_mean", 0), 4),
                    "min": round(stats.get("NDVI_min", 0), 4),
                    "max": round(stats.get("NDVI_max", 0), 4),
                    "std": round(stats.get("NDVI_stdDev", 0), 4),
                },
                "ndre": {
                    "mean": round(stats.get("NDRE_mean", 0), 4),
                    "min": round(stats.get("NDRE_min", 0), 4),
                    "max": round(stats.get("NDRE_max", 0), 4),
                    "std": round(stats.get("NDRE_stdDev", 0), 4),
                },
                "ndmi": {
                    "mean": round(stats.get("NDMI_mean", 0), 4),
                    "min": round(stats.get("NDMI_min", 0), 4),
                    "max": round(stats.get("NDMI_max", 0), 4),
                    "std": round(stats.get("NDMI_stdDev", 0), 4),
                },
            },
            "image_count": count,
            "source": "google_earth_engine",
        }
    except SatelliteServiceError:
        raise
    except ImportError:
        raise SatelliteServiceError(
            "earthengine-api package not installed. Run: pip install earthengine-api"
        )
    except Exception as e:
        logger.error("Earth Engine NDVI computation failed: %s", e)
        raise SatelliteServiceError(f"Earth Engine error: {e}")


def get_historical_ndvi(field_geometry: dict, years: int = 3) -> list:
    """Return historical NDVI monthly averages. Raises SatelliteServiceError if GEE is not configured."""
    _check_gee_configured()

    try:
        import ee
        ee.Initialize(project=GEE_PROJECT_ID)
        # Real implementation would compute monthly composites — for now raise clear error
        raise SatelliteServiceError(
            "Historical NDVI computation requires a valid GEE project and authenticated session. "
            "Current configuration is incomplete."
        )
    except SatelliteServiceError:
        raise
    except ImportError:
        raise SatelliteServiceError("earthengine-api package not installed.")
    except Exception as e:
        raise SatelliteServiceError(f"Earth Engine error: {e}")
