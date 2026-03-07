"""Satellite imagery API routes."""

import logging
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.earth_engine import get_ndvi_composite, get_historical_ndvi, SatelliteServiceError

logger = logging.getLogger("ohdeere.satellite")
router = APIRouter()


class FieldGeometry(BaseModel):
    coordinates: List[List[float]]  # [[lat, lon], ...]
    name: Optional[str] = "Unnamed Field"


@router.post("/ndvi")
async def compute_ndvi(
    field: FieldGeometry,
    start_date: str = Query("2025-01-01"),
    end_date: str = Query("2025-03-07"),
):
    """Compute NDVI/NDRE/NDMI for a field boundary."""
    try:
        geometry = {
            "type": "Polygon",
            "coordinates": field.coordinates,
            "name": field.name,
        }
        data = get_ndvi_composite(geometry, start_date, end_date)
        return data
    except SatelliteServiceError as e:
        logger.error("NDVI computation failed: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Unexpected NDVI error: %s", e)
        raise HTTPException(status_code=502, detail=f"Satellite service unavailable: {e}")


@router.get("/historical-ndvi")
async def historical_ndvi(years: int = Query(3, description="Years of history")):
    """Get historical NDVI seasonal pattern."""
    try:
        data = get_historical_ndvi({}, years)
        return data
    except SatelliteServiceError as e:
        logger.error("Historical NDVI failed: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Unexpected historical NDVI error: %s", e)
        raise HTTPException(status_code=502, detail=f"Satellite history service unavailable: {e}")


@router.get("/status")
async def satellite_status():
    """Check if satellite services are properly configured."""
    try:
        from services.earth_engine import _check_gee_configured
        _check_gee_configured()
        return {"status": "configured", "message": "Google Earth Engine is configured"}
    except SatelliteServiceError as e:
        return {"status": "not_configured", "message": str(e)}
