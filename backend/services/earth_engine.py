"""Google Earth Engine satellite service.

Requires authentication: ee.Authenticate() then ee.Initialize(project='<id>')
Returns clear errors when GEE is not properly configured.
"""

import logging
from config import GEE_PROJECT_ID

logger = logging.getLogger("ohdeere.services.earth_engine")

_gee_initialized = False


class SatelliteServiceError(Exception):
    """Raised when the Earth Engine service is unavailable."""
    pass


def _check_gee_configured():
    """Verify GEE config string is reasonable. Raises SatelliteServiceError if not."""
    if not GEE_PROJECT_ID:
        raise SatelliteServiceError(
            "Google Earth Engine not configured. Set GEE_PROJECT_ID in .env with a valid GCP project ID. "
            "Then run 'earthengine authenticate' to set up credentials."
        )
    if ".apps.googleusercontent.com" in GEE_PROJECT_ID:
        raise SatelliteServiceError(
            f"GEE_PROJECT_ID appears to be an OAuth client ID, not a GCP project ID. "
            f"Current value: {GEE_PROJECT_ID[:20]}... — "
            f"Set it to your GCP project ID (e.g., 'my-farm-project-123')."
        )


def _init_gee():
    """Actually initialize the Earth Engine SDK. Raises SatelliteServiceError on failure."""
    global _gee_initialized
    _check_gee_configured()

    if _gee_initialized:
        return

    try:
        import ee
    except ImportError:
        raise SatelliteServiceError(
            "earthengine-api package not installed. Run: pip install earthengine-api"
        )

    try:
        ee.Initialize(project=GEE_PROJECT_ID)
        _gee_initialized = True
        logger.info("Earth Engine initialized with project: %s", GEE_PROJECT_ID)
    except Exception as e:
        err_msg = str(e)
        if "authorize" in err_msg.lower() or "authenticate" in err_msg.lower():
            raise SatelliteServiceError(
                "Earth Engine authentication required. Run 'earthengine authenticate' in your terminal, "
                "then restart the backend."
            )
        elif "not registered" in err_msg.lower() or "not enabled" in err_msg.lower():
            raise SatelliteServiceError(
                f"Earth Engine API not enabled for project '{GEE_PROJECT_ID}'. "
                f"Enable it at: https://console.cloud.google.com/apis/library/earthengine.googleapis.com?project={GEE_PROJECT_ID}"
            )
        else:
            raise SatelliteServiceError(f"Earth Engine initialization failed: {err_msg}")


def deep_status_check() -> dict:
    """Perform a real GEE initialization check. Returns status dict."""
    try:
        _init_gee()
        return {"status": "ok", "message": f"Earth Engine initialized (project: {GEE_PROJECT_ID})"}
    except SatelliteServiceError as e:
        return {"status": "not_configured", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Unexpected error: {e}"}


def get_ndvi_composite(field_geometry: dict, start_date: str, end_date: str) -> dict:
    """
    Compute NDVI composite for a field boundary.
    Raises SatelliteServiceError if GEE is not configured or fails.
    """
    _init_gee()

    try:
        import ee

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
    except Exception as e:
        logger.error("Earth Engine NDVI computation failed: %s", e)
        raise SatelliteServiceError(f"Earth Engine error: {e}")


def get_historical_ndvi(field_geometry: dict, years: int = 3) -> list:
    """Return historical NDVI monthly averages. Raises SatelliteServiceError if GEE is not configured."""
    _init_gee()

    try:
        import ee

        coords = field_geometry.get("coordinates", [])
        if not coords:
            raise SatelliteServiceError("Field geometry has no coordinates.")

        region = ee.Geometry.Polygon(coords)
        import datetime
        end = datetime.date.today()
        start = end.replace(year=end.year - years)

        collection = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(region)
            .filterDate(start.isoformat(), end.isoformat())
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        )

        def add_ndvi(image):
            ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
            return image.addBands(ndvi).set("month", image.date().get("month")).set("year", image.date().get("year"))

        with_ndvi = collection.map(add_ndvi)
        months = []
        for y in range(start.year, end.year + 1):
            for m in range(1, 13):
                monthly = with_ndvi.filter(ee.Filter.calendarRange(y, y, "year")).filter(ee.Filter.calendarRange(m, m, "month"))
                mean = monthly.select("NDVI").mean().reduceRegion(
                    reducer=ee.Reducer.mean(), geometry=region, scale=10, maxPixels=1e8
                )
                months.append({"year": y, "month": m, "ndvi_mean": mean})

        results = ee.List(
            [ee.Dictionary({"year": m["year"], "month": m["month"], "ndvi_mean": m["ndvi_mean"]}) for m in months]
        ).getInfo()

        return [
            {"year": r["year"], "month": r["month"], "ndvi_mean": round(r.get("ndvi_mean", {}).get("NDVI", 0) or 0, 4)}
            for r in results
        ]
    except SatelliteServiceError:
        raise
    except Exception as e:
        raise SatelliteServiceError(f"Earth Engine error: {e}")
