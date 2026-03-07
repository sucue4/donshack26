"""Weather API routes."""

import logging
from fastapi import APIRouter, Query, HTTPException
from services.open_meteo import get_forecast, get_historical

logger = logging.getLogger("ohdeere.weather")
router = APIRouter()


@router.get("/forecast")
async def forecast(
    lat: float = Query(38.94, description="Latitude"),
    lon: float = Query(-92.31, description="Longitude"),
    days: int = Query(7, description="Forecast days (1-16)"),
):
    """Get weather forecast for a location."""
    try:
        data = await get_forecast(lat, lon, days)
        return data
    except Exception as e:
        logger.error("Weather forecast failed for lat=%s lon=%s: %s", lat, lon, e)
        raise HTTPException(status_code=502, detail=f"Weather service unavailable: {e}")


@router.get("/historical")
async def historical(
    lat: float = Query(38.94, description="Latitude"),
    lon: float = Query(-92.31, description="Longitude"),
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
):
    """Get historical weather data for a location."""
    try:
        data = await get_historical(lat, lon, start_date, end_date)
        return data
    except Exception as e:
        logger.error("Historical weather failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Weather history service unavailable: {e}")
