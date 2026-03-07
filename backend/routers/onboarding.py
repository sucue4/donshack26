"""
Oh Deere! — Onboarding endpoints.

Provides reference data for farm setup (crops, fertilizers) and
in-memory storage for farm profiles.
"""

import logging
from typing import List

from fastapi import APIRouter, HTTPException
from models import FarmProfile, FertilizerType

logger = logging.getLogger("ohdeere.routers.onboarding")

router = APIRouter()

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

COMMON_CROPS: List[str] = [
    "Corn",
    "Soybeans",
    "Winter Wheat",
    "Spring Wheat",
    "Cotton",
    "Rice",
    "Sorghum/Milo",
    "Barley",
    "Oats",
    "Alfalfa",
    "Hay",
    "Canola",
    "Sunflowers",
    "Sugar Beets",
    "Potatoes",
    "Peanuts",
    "Tobacco",
    "Cereal Rye (Cover)",
    "Crimson Clover (Cover)",
    "Fallow/None",
]

COMMON_FERTILIZERS: List[FertilizerType] = [
    FertilizerType(name="Urea", npk_ratio="46-0-0", category="nitrogen", nutrients="46% nitrogen"),
    FertilizerType(name="DAP", npk_ratio="18-46-0", category="phosphorus", nutrients="18% nitrogen, 46% phosphorus"),
    FertilizerType(name="MAP", npk_ratio="11-52-0", category="phosphorus", nutrients="11% nitrogen, 52% phosphorus"),
    FertilizerType(name="Potash/MOP", npk_ratio="0-0-60", category="potassium", nutrients="60% potassium"),
    FertilizerType(name="Ammonium Nitrate", npk_ratio="34-0-0", category="nitrogen", nutrients="34% nitrogen"),
    FertilizerType(name="10-10-10 Balanced", npk_ratio="10-10-10", category="balanced", nutrients="10% N, 10% P, 10% K"),
    FertilizerType(name="Anhydrous Ammonia", npk_ratio="82-0-0", category="nitrogen", nutrients="82% nitrogen"),
    FertilizerType(name="Calcium Ammonium Nitrate", npk_ratio="27-0-0", category="nitrogen", nutrients="27% nitrogen"),
    FertilizerType(name="Triple Superphosphate", npk_ratio="0-46-0", category="phosphorus", nutrients="46% phosphorus"),
    FertilizerType(name="Ammonium Sulfate", npk_ratio="21-0-0-24S", category="nitrogen", nutrients="21% nitrogen, 24% sulfur"),
    FertilizerType(name="Lime (calcium carbonate)", npk_ratio="0-0-0", category="amendment", nutrients="calcium, raises soil pH"),
    FertilizerType(name="Gypsum", npk_ratio="0-0-0", category="amendment", nutrients="calcium, sulfur; does not change pH"),
    FertilizerType(name="Compost/Manure", npk_ratio="varies", category="organic", nutrients="variable N-P-K, organic matter"),
    FertilizerType(name="Bone Meal", npk_ratio="3-15-0", category="organic", nutrients="3% nitrogen, 15% phosphorus"),
    FertilizerType(name="Blood Meal", npk_ratio="12-0-0", category="organic", nutrients="12% nitrogen"),
    FertilizerType(name="Fish Emulsion", npk_ratio="5-2-2", category="organic", nutrients="5% N, 2% P, 2% K"),
    FertilizerType(name="No fertilizer applied", npk_ratio="0-0-0", category="amendment", nutrients="none"),
]

# ---------------------------------------------------------------------------
# In-memory profile store
# ---------------------------------------------------------------------------

_profiles: dict[int, FarmProfile] = {}

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/crops", response_model=List[str])
async def list_crops():
    """Return the list of common US crops."""
    return COMMON_CROPS


@router.get("/fertilizers", response_model=List[FertilizerType])
async def list_fertilizers():
    """Return the list of common fertilizer types with NPK data."""
    return COMMON_FERTILIZERS


@router.post("/profile", response_model=FarmProfile)
async def save_profile(profile: FarmProfile):
    """Save or update a farm profile (stored in memory)."""
    _profiles[profile.field_id] = profile
    logger.info("Saved farm profile for field_id=%d", profile.field_id)
    return profile


@router.get("/profile/{field_id}", response_model=FarmProfile)
async def get_profile(field_id: int):
    """Retrieve a saved farm profile by field ID."""
    profile = _profiles.get(field_id)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"No profile found for field_id={field_id}")
    return profile
