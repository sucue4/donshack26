"""Crop planning API routes."""

from fastapi import APIRouter, Query

router = APIRouter()

# Growing Degree Day base temperatures (°F)
GDD_BASES = {
    "corn": 50,
    "soybean": 50,
    "wheat": 32,
}

CROP_DATABASE = [
    {
        "crop": "Corn (Grain)",
        "gdd_maturity": 2700,
        "plant_window": "Apr 15 – May 10",
        "harvest_window": "Sep 25 – Oct 30",
        "min_soil_temp": 50,
        "water_need_in_per_season": 22,
        "nitrogen_need_lb_per_ac": 180,
    },
    {
        "crop": "Soybean",
        "gdd_maturity": 2400,
        "plant_window": "May 5 – May 25",
        "harvest_window": "Sep 20 – Oct 15",
        "min_soil_temp": 55,
        "water_need_in_per_season": 20,
        "nitrogen_need_lb_per_ac": 0,
    },
    {
        "crop": "Winter Wheat",
        "gdd_maturity": 2000,
        "plant_window": "Sep 20 – Oct 15",
        "harvest_window": "Jun 20 – Jul 10",
        "min_soil_temp": 40,
        "water_need_in_per_season": 18,
        "nitrogen_need_lb_per_ac": 120,
    },
    {
        "crop": "Cereal Rye (Cover)",
        "gdd_maturity": 1800,
        "plant_window": "Sep 1 – Oct 30",
        "harvest_window": "May (terminate)",
        "min_soil_temp": 34,
        "water_need_in_per_season": 12,
        "nitrogen_need_lb_per_ac": 0,
    },
]


@router.get("/database")
async def crop_database():
    """Return crop reference database."""
    return {"crops": CROP_DATABASE}


@router.get("/gdd")
async def growing_degree_days(
    crop: str = Query("corn", description="Crop type"),
    temp_max_f: float = Query(85, description="Daily max temp (°F)"),
    temp_min_f: float = Query(58, description="Daily min temp (°F)"),
):
    """Calculate growing degree days for a single day."""
    base = GDD_BASES.get(crop.lower(), 50)
    avg_temp = (temp_max_f + temp_min_f) / 2
    gdd = max(0, avg_temp - base)
    return {
        "crop": crop,
        "base_temp_f": base,
        "daily_avg_f": round(avg_temp, 1),
        "gdd": round(gdd, 1),
    }
