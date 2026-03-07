"""Weather API routes."""

from fastapi import APIRouter, Query
from services.open_meteo import get_forecast, get_historical

router = APIRouter()


@router.get("/forecast")
async def forecast(
    lat: float = Query(38.94, description="Latitude"),
    lon: float = Query(-92.31, description="Longitude"),
    days: int = Query(7, description="Forecast days (1-16)"),
):
    """Get weather forecast for a location."""
    data = await get_forecast(lat, lon, days)
    return data


@router.get("/historical")
async def historical(
    lat: float = Query(38.94, description="Latitude"),
    lon: float = Query(-92.31, description="Longitude"),
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
):
    """Get historical weather data for a location."""
    data = await get_historical(lat, lon, start_date, end_date)
    return data
