"""Weather API routes."""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Query, HTTPException
from services.open_meteo import get_forecast, get_historical, get_water_balance, get_gdd, WeatherServiceError

logger = logging.getLogger("ohdeere.weather")
router = APIRouter()


@router.get("/forecast")
async def forecast(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    days: int = Query(7, description="Forecast days (1-16)"),
):
    """Get weather forecast for a location."""
    try:
        data = await get_forecast(lat, lon, days)
        return data
    except WeatherServiceError as e:
        logger.error("Weather forecast failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/historical")
async def historical(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
):
    """Get historical weather data for a location."""
    try:
        data = await get_historical(lat, lon, start_date, end_date)
        return data
    except WeatherServiceError as e:
        logger.error("Historical weather failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/water-balance")
async def water_balance(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    days: int = Query(7, description="Forecast days"),
):
    """Get water balance data: soil moisture, ET0, precipitation."""
    try:
        data = await get_water_balance(lat, lon, days)
        return data
    except WeatherServiceError as e:
        logger.error("Water balance failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/gdd")
async def gdd(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    start_date: str = Query(None, description="Start date (YYYY-MM-DD), defaults to season start"),
    end_date: str = Query(None, description="End date (YYYY-MM-DD), defaults to yesterday"),
    base_temp_f: float = Query(50.0, description="Base temperature in Fahrenheit"),
):
    """Compute growing degree days from historical temperature data."""
    if not end_date:
        end_date = (datetime.utcnow() - timedelta(days=5)).strftime("%Y-%m-%d")
    if not start_date:
        start_date = f"{datetime.utcnow().year}-04-01"
    try:
        data = await get_gdd(lat, lon, start_date, end_date, base_temp_f)
        return data
    except WeatherServiceError as e:
        logger.error("GDD computation failed: %s", e)
        raise HTTPException(status_code=502, detail=str(e))
