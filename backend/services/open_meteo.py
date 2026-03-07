"""Open-Meteo weather service — no API key required.

Raises exceptions on failure so callers can show real error messages.
"""

import logging
from datetime import datetime, timedelta

import httpx
from config import OPEN_METEO_FORECAST, OPEN_METEO_HISTORICAL

logger = logging.getLogger("ohdeere.services.open_meteo")


class WeatherServiceError(Exception):
    """Raised when the Open-Meteo API is unreachable or returns an error."""
    pass


async def get_forecast(lat: float, lon: float, days: int = 7) -> dict:
    """Fetch weather forecast from Open-Meteo. Raises WeatherServiceError on failure."""
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
            data = resp.json()
            if "error" in data:
                raise WeatherServiceError(f"Open-Meteo error: {data.get('reason', data['error'])}")
            return data
    except httpx.HTTPStatusError as exc:
        logger.error("Open-Meteo forecast HTTP error: %s", exc)
        raise WeatherServiceError(f"Open-Meteo returned HTTP {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Open-Meteo forecast connection error: %s", exc)
        raise WeatherServiceError(f"Cannot connect to Open-Meteo: {exc}") from exc


async def get_historical(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    """Fetch historical weather data from Open-Meteo. Raises WeatherServiceError on failure."""
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
            data = resp.json()
            if "error" in data:
                raise WeatherServiceError(f"Open-Meteo error: {data.get('reason', data['error'])}")
            return data
    except httpx.HTTPStatusError as exc:
        logger.error("Open-Meteo historical HTTP error: %s", exc)
        raise WeatherServiceError(f"Open-Meteo returned HTTP {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Open-Meteo historical connection error: %s", exc)
        raise WeatherServiceError(f"Cannot connect to Open-Meteo: {exc}") from exc


async def get_water_balance(lat: float, lon: float, days: int = 7) -> dict:
    """Compute water balance from real Open-Meteo data: soil moisture, ET0, precipitation."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join([
            "temperature_2m_max", "temperature_2m_min",
            "precipitation_sum", "et0_fao_evapotranspiration",
        ]),
        "hourly": "soil_moisture_0_to_7cm",
        "timezone": "auto",
        "forecast_days": days,
        "past_days": 7,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(OPEN_METEO_FORECAST, params=params)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise WeatherServiceError(f"Open-Meteo error: {data.get('reason', data['error'])}")

        daily = data.get("daily", {})
        hourly = data.get("hourly", {})

        # Soil moisture trend from hourly data (sample every 6 hours)
        sm_values = hourly.get("soil_moisture_0_to_7cm", [])
        sm_times = hourly.get("time", [])
        moisture_trend = []
        for i in range(0, len(sm_values), 6):
            if i < len(sm_times) and sm_values[i] is not None:
                moisture_trend.append({
                    "time": sm_times[i],
                    "moisture_pct": round(sm_values[i] * 100, 1),
                })

        # ET0 vs precipitation daily comparison
        et0_vals = daily.get("et0_fao_evapotranspiration", [])
        precip_vals = daily.get("precipitation_sum", [])
        times = daily.get("time", [])
        daily_balance = []
        total_precip = 0
        total_et0 = 0
        for i in range(len(times)):
            et0 = et0_vals[i] if i < len(et0_vals) and et0_vals[i] is not None else 0
            precip = precip_vals[i] if i < len(precip_vals) and precip_vals[i] is not None else 0
            total_precip += precip
            total_et0 += et0
            daily_balance.append({
                "date": times[i],
                "et0": round(et0, 1),
                "precipitation": round(precip, 1),
                "balance": round(precip - et0, 1),
            })

        avg_moisture = round(sum(m["moisture_pct"] for m in moisture_trend) / len(moisture_trend), 1) if moisture_trend else None

        return {
            "location": {"lat": lat, "lon": lon},
            "moisture_trend": moisture_trend,
            "daily_balance": daily_balance,
            "summary": {
                "avg_soil_moisture_pct": avg_moisture,
                "total_precipitation_mm": round(total_precip, 1),
                "total_et0_mm": round(total_et0, 1),
                "water_balance_mm": round(total_precip - total_et0, 1),
            },
        }
    except httpx.HTTPStatusError as exc:
        logger.error("Open-Meteo water balance HTTP error: %s", exc)
        raise WeatherServiceError(f"Open-Meteo returned HTTP {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Open-Meteo water balance connection error: %s", exc)
        raise WeatherServiceError(f"Cannot connect to Open-Meteo: {exc}") from exc


async def get_gdd(lat: float, lon: float, start_date: str, end_date: str, base_temp_f: float = 50.0) -> dict:
    """Compute Growing Degree Days from historical Open-Meteo temperature data."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_max,temperature_2m_min",
        "timezone": "auto",
        "temperature_unit": "fahrenheit",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(OPEN_METEO_HISTORICAL, params=params)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise WeatherServiceError(f"Open-Meteo error: {data.get('reason', data['error'])}")

        daily = data.get("daily", {})
        highs = daily.get("temperature_2m_max", [])
        lows = daily.get("temperature_2m_min", [])
        times = daily.get("time", [])

        weekly = {}
        total_gdd = 0
        daily_gdd = []
        for i in range(len(times)):
            if highs[i] is None or lows[i] is None:
                continue
            avg = (highs[i] + lows[i]) / 2
            gdd = max(0, avg - base_temp_f)
            total_gdd += gdd
            daily_gdd.append({
                "date": times[i],
                "gdd": round(gdd, 1),
                "cumulative": round(total_gdd, 1),
            })
            # Aggregate by ISO week
            d = datetime.strptime(times[i], "%Y-%m-%d")
            week_key = f"W{d.isocalendar()[1]}"
            weekly[week_key] = weekly.get(week_key, 0) + gdd

        weekly_gdd = [{"week": k, "gdd": round(v, 1)} for k, v in weekly.items()]

        return {
            "location": {"lat": lat, "lon": lon},
            "period": {"start": start_date, "end": end_date},
            "base_temp_f": base_temp_f,
            "total_gdd": round(total_gdd, 1),
            "weekly_gdd": weekly_gdd,
            "daily_gdd": daily_gdd,
        }
    except httpx.HTTPStatusError as exc:
        logger.error("Open-Meteo GDD HTTP error: %s", exc)
        raise WeatherServiceError(f"Open-Meteo returned HTTP {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Open-Meteo GDD connection error: %s", exc)
        raise WeatherServiceError(f"Cannot connect to Open-Meteo: {exc}") from exc
