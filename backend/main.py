"""
Oh Deere! — Backend API Server
FastAPI application serving weather, soil, satellite, and AI advisor endpoints.
"""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import weather, soil, satellite, advisor, crops

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

app.include_router(weather.router, prefix="/api/weather", tags=["Weather"])
app.include_router(soil.router, prefix="/api/soil", tags=["Soil"])
app.include_router(satellite.router, prefix="/api/satellite", tags=["Satellite"])
app.include_router(advisor.router, prefix="/api", tags=["AI Advisor"])
app.include_router(crops.router, prefix="/api/crops", tags=["Crops"])


@app.get("/api/health")
def health_check():
    return {"status": "online", "service": "Oh Deere! Backend"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
