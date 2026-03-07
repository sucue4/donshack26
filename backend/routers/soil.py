"""Soil API routes."""

import logging
from fastapi import APIRouter, Query
from services.soilgrids import get_soil_properties

logger = logging.getLogger("ohdeere.soil")
router = APIRouter()


@router.get("/properties")
async def soil_properties(
    lat: float = Query(38.94, description="Latitude"),
    lon: float = Query(-92.31, description="Longitude"),
):
    """Get soil properties from ISRIC SoilGrids for a location."""
    data = await get_soil_properties(lat, lon)
    return data
