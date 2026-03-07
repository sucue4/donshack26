"""Soil API routes."""

import logging
from fastapi import APIRouter, Query, HTTPException
from services.soilgrids import get_soil_properties, SoilServiceError

logger = logging.getLogger("ohdeere.soil")
router = APIRouter()


@router.get("/properties")
async def soil_properties(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """Get soil properties from ISRIC SoilGrids for a location."""
    try:
        data = await get_soil_properties(lat, lon)
        return data
    except SoilServiceError as e:
        logger.error("Soil properties failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))
