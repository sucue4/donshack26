"""
Oh Deere! — Yield analysis endpoints.

Orchestrates data collection from Open-Meteo and SoilGrids, then delegates
to the AI yield analyzer for structured analysis.
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from models import FarmProfile, YieldAnalysis
from services import open_meteo, soilgrids
from services.yield_analyzer import analyze_yield, analyze_category

logger = logging.getLogger("ohdeere.routers.analysis")

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _fetch_external_data(profile: FarmProfile) -> tuple[dict | None, dict | None]:
    """Fetch weather and soil data in parallel with 4-second hard cap per source."""
    async def safe_weather():
        try:
            return await asyncio.wait_for(
                open_meteo.get_forecast(profile.lat, profile.lon, days=7),
                timeout=4.0,
            )
        except Exception as exc:
            logger.warning("Weather data unavailable: %s", exc)
            return None

    async def safe_soil():
        try:
            return await asyncio.wait_for(
                soilgrids.get_soil_properties(profile.lat, profile.lon),
                timeout=4.0,
            )
        except Exception as exc:
            logger.warning("Soil data unavailable: %s", exc)
            return None

    return await asyncio.gather(safe_weather(), safe_soil())


async def _run_full_analysis(profile: FarmProfile) -> YieldAnalysis:
    """Fetch external data and run the full yield analysis."""
    weather_data, soil_data = await _fetch_external_data(profile)

    try:
        return await analyze_yield(profile, weather_data=weather_data, soil_data=soil_data)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("Yield analysis failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")


async def _run_category_analysis(category: str, profile: FarmProfile) -> dict:
    """Fetch external data and run a single-category analysis."""
    weather_data, soil_data = await _fetch_external_data(profile)

    try:
        return await analyze_category(category, profile, weather_data=weather_data, soil_data=soil_data)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("%s analysis failed: %s", category, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/full", response_model=YieldAnalysis)
async def full_analysis(profile: FarmProfile):
    """Run the full 5-category yield analysis."""
    return await _run_full_analysis(profile)


@router.post("/weather")
async def weather_analysis(profile: FarmProfile):
    """Weather forecasting analysis only."""
    return await _run_category_analysis("weather", profile)


@router.post("/soil")
async def soil_analysis(profile: FarmProfile):
    """Soil health analysis only."""
    return await _run_category_analysis("soil_health", profile)


@router.post("/pest")
async def pest_analysis(profile: FarmProfile):
    """Pest forecasting analysis only."""
    return await _run_category_analysis("pest", profile)


@router.post("/drought")
async def drought_analysis(profile: FarmProfile):
    """Drought resistance analysis only."""
    return await _run_category_analysis("drought", profile)


@router.post("/monoculture")
async def monoculture_analysis(profile: FarmProfile):
    """Monoculture risk analysis only."""
    return await _run_category_analysis("monoculture", profile)
