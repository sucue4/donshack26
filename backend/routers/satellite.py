"""Satellite imagery API routes."""

import logging
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.earth_engine import get_ndvi_composite, get_historical_ndvi, SatelliteServiceError, deep_status_check

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
        # Frontend sends [lat, lon] (Leaflet), GEE needs [lon, lat] (GeoJSON)
        gee_coords = [[lon, lat] for lat, lon in field.coordinates]
        # Close the ring if not already closed
        if gee_coords and gee_coords[0] != gee_coords[-1]:
            gee_coords.append(gee_coords[0])

        geometry = {
            "type": "Polygon",
            "coordinates": [gee_coords],
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


@router.post("/historical-ndvi")
async def historical_ndvi(
    field: FieldGeometry,
    years: int = Query(3, description="Years of history"),
):
    """Get historical NDVI seasonal pattern."""
    try:
        gee_coords = [[lon, lat] for lat, lon in field.coordinates]
        if gee_coords and gee_coords[0] != gee_coords[-1]:
            gee_coords.append(gee_coords[0])
        geometry = {"type": "Polygon", "coordinates": [gee_coords]}
        data = get_historical_ndvi(geometry, years)
        return data
    except SatelliteServiceError as e:
        logger.error("Historical NDVI failed: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Unexpected historical NDVI error: %s", e)
        raise HTTPException(status_code=502, detail=f"Satellite history service unavailable: {e}")


@router.get("/status")
async def satellite_status():
    """Deep check — actually tries to initialize Earth Engine."""
    return deep_status_check()
