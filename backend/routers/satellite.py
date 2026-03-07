"""Satellite imagery API routes."""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional
from services.earth_engine import get_ndvi_composite, get_historical_ndvi

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
    geometry = {
        "type": "Polygon",
        "coordinates": field.coordinates,
        "name": field.name,
    }
    data = get_ndvi_composite(geometry, start_date, end_date)
    return data


@router.get("/historical-ndvi")
async def historical_ndvi(years: int = Query(3, description="Years of history")):
    """Get historical NDVI seasonal pattern."""
    data = get_historical_ndvi({}, years)
    return data
