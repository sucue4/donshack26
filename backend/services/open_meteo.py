"""Open-Meteo weather service — no API key required."""

import httpx
from config import OPEN_METEO_FORECAST, OPEN_METEO_HISTORICAL


async def get_forecast(lat: float, lon: float, days: int = 7) -> dict:
    """Fetch weather forecast from Open-Meteo."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join([
            "temperature_2m_max", "temperature_2m_min",
            "precipitation_sum", "et0_fao_evapotranspiration",
            "windspeed_10m_max", "weathercode",
        ]),
        "hourly": ",".join([
            "temperature_2m", "relativehumidity_2m",
            "precipitation", "soil_moisture_0_to_7cm",
            "windspeed_10m",
        ]),
        "timezone": "auto",
        "forecast_days": days,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(OPEN_METEO_FORECAST, params=params)
        resp.raise_for_status()
        return resp.json()


async def get_historical(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    """Fetch historical weather data from Open-Meteo Archive API."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": ",".join([
            "temperature_2m_max", "temperature_2m_min",
            "precipitation_sum", "et0_fao_evapotranspiration",
        ]),
        "timezone": "auto",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(OPEN_METEO_HISTORICAL, params=params)
        resp.raise_for_status()
        return resp.json()
