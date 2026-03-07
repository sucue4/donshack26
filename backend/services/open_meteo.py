"""Open-Meteo weather service — no API key required."""

import logging
from datetime import datetime, timedelta

import httpx
from config import OPEN_METEO_FORECAST, OPEN_METEO_HISTORICAL

logger = logging.getLogger("ohdeere.services.open_meteo")


def _fallback_forecast(lat: float, lon: float, days: int) -> dict:
    """Return representative sample forecast data when the API is unreachable."""
    today = datetime.utcnow().date()
    dates = [(today + timedelta(days=i)).isoformat() for i in range(days)]
    hours = [
        f"{dates[0]}T{h:02d}:00" for h in range(24)
    ]
    # Typical early-spring Midwest values
    daily_highs = [18, 20, 17, 22, 24, 19, 21][:days]
    daily_lows = [6, 8, 5, 9, 11, 7, 8][:days]
    precip = [0.0, 2.4, 8.1, 0.0, 0.0, 5.2, 1.0][:days]
    et0 = [3.2, 3.5, 2.1, 3.8, 4.0, 2.8, 3.0][:days]
    codes = [1, 3, 61, 0, 0, 51, 2][:days]
    hourly_temp = [round(8 + 6 * ((h % 24) / 12 if h % 24 <= 12 else (24 - h % 24) / 12), 1) for h in range(24)]
    hourly_hum = [round(70 - 15 * ((h % 24) / 12 if h % 24 <= 12 else (24 - h % 24) / 12)) for h in range(24)]
    hourly_wind = [round(8 + 4 * ((h % 24) / 14 if h % 24 <= 14 else (24 - h % 24) / 10), 1) for h in range(24)]
    return {
        "latitude": lat,
        "longitude": lon,
        "timezone": "America/Chicago",
        "daily": {
            "time": dates,
            "temperature_2m_max": daily_highs,
            "temperature_2m_min": daily_lows,
            "precipitation_sum": precip,
            "et0_fao_evapotranspiration": et0,
            "wind_speed_10m_max": [12.5, 15.0, 8.2, 18.3, 10.1, 14.6, 11.8][:days],
            "weather_code": codes,
        },
        "hourly": {
            "time": hours,
            "temperature_2m": hourly_temp,
            "relative_humidity_2m": hourly_hum,
            "precipitation": [0.0] * 24,
            "soil_moisture_0_to_7cm": [0.28] * 24,
            "wind_speed_10m": hourly_wind,
        },
        "source": "fallback",
    }


def _fallback_historical(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    """Return representative sample historical data when the API is unreachable."""
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    num_days = max(1, (end - start).days + 1)
    dates = [(start + timedelta(days=i)).isoformat() for i in range(num_days)]
    return {
        "latitude": lat,
        "longitude": lon,
        "timezone": "America/Chicago",
        "daily": {
            "time": dates,
            "temperature_2m_max": [round(18 + 3 * (i % 5), 1) for i in range(num_days)],
            "temperature_2m_min": [round(6 + 2 * (i % 4), 1) for i in range(num_days)],
            "precipitation_sum": [round(2.0 * (i % 3), 1) for i in range(num_days)],
            "et0_fao_evapotranspiration": [round(3.0 + 0.5 * (i % 4), 1) for i in range(num_days)],
        },
        "source": "fallback",
    }


async def get_forecast(lat: float, lon: float, days: int = 7) -> dict:
    """Fetch weather forecast from Open-Meteo. Falls back to sample data on failure."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join([
            "temperature_2m_max", "temperature_2m_min",
            "precipitation_sum", "et0_fao_evapotranspiration",
            "wind_speed_10m_max", "weather_code",
        ]),
        "hourly": ",".join([
            "temperature_2m", "relative_humidity_2m",
            "precipitation", "soil_moisture_0_to_7cm",
            "wind_speed_10m",
        ]),
        "timezone": "auto",
        "forecast_days": days,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(OPEN_METEO_FORECAST, params=params)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Open-Meteo forecast unavailable, using fallback data: %s", exc)
        return _fallback_forecast(lat, lon, days)


async def get_historical(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    """Fetch historical weather data from Open-Meteo. Falls back to sample data on failure."""
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
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(OPEN_METEO_HISTORICAL, params=params)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Open-Meteo historical unavailable, using fallback data: %s", exc)
        return _fallback_historical(lat, lon, start_date, end_date)
