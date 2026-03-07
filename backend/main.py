"""
Oh Deere! — Backend API Server
FastAPI application serving weather, soil, satellite, and AI advisor endpoints.
"""

import logging
import time
import uvicorn
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import weather, soil, satellite, advisor, crops
from config import ANTHROPIC_API_KEY, GEE_PROJECT_ID, OPEN_METEO_FORECAST, SOILGRIDS_ENDPOINT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("ohdeere")

app = FastAPI(
    title="Oh Deere! API",
    description="Precision Agriculture Intelligence Platform — Backend Services",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 1)
    logger.info("%s %s -> %s (%sms)", request.method, request.url.path, response.status_code, duration)
    return response


app.include_router(weather.router, prefix="/api/weather", tags=["Weather"])
app.include_router(soil.router, prefix="/api/soil", tags=["Soil"])
app.include_router(satellite.router, prefix="/api/satellite", tags=["Satellite"])
app.include_router(advisor.router, prefix="/api", tags=["AI Advisor"])
app.include_router(crops.router, prefix="/api/crops", tags=["Crops"])


@app.get("/api/health")
def health_check():
    return {"status": "online", "service": "Oh Deere! Backend"}


@app.get("/api/status")
async def service_status():
    """Diagnostic endpoint: check health of all external services."""
    results = {}

    # Check Open-Meteo
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(OPEN_METEO_FORECAST, params={"latitude": 0, "longitude": 0, "daily": "temperature_2m_max", "timezone": "auto", "forecast_days": 1})
            results["weather"] = {"status": "ok" if resp.status_code == 200 else "error", "code": resp.status_code}
    except Exception as e:
        results["weather"] = {"status": "error", "detail": str(e)}

    # Check SoilGrids
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(SOILGRIDS_ENDPOINT, params={"lon": 0, "lat": 0, "property": "clay", "depth": "0-5cm", "value": "mean"})
            results["soil"] = {"status": "ok" if resp.status_code in (200, 400) else "error", "code": resp.status_code}
    except Exception as e:
        results["soil"] = {"status": "error", "detail": str(e)}

    # Check Claude / Anthropic
    results["ai_advisor"] = {
        "status": "ok" if ANTHROPIC_API_KEY else "unconfigured",
        "detail": "API key set" if ANTHROPIC_API_KEY else "ANTHROPIC_API_KEY not set in .env",
    }

    # Check Earth Engine
    results["satellite"] = {
        "status": "ok" if GEE_PROJECT_ID else "demo_mode",
        "detail": "Project configured" if GEE_PROJECT_ID else "GEE_PROJECT_ID not set -- using demo data",
    }

    # Crops (local data, always available)
    results["crops"] = {"status": "ok", "detail": "Local database"}

    all_ok = all(s.get("status") == "ok" for s in results.values())
    return {"overall": "ok" if all_ok else "degraded", "services": results}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
