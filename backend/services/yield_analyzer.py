"""
Oh Deere! — Deterministic yield analysis engine.

Computes yield analysis from Open-Meteo weather data and SoilGrids soil data
using agronomic rules and thresholds. Instant, reliable results with no
external AI dependencies.
"""

import logging
from datetime import date

from models import (
    FarmProfile,
    YieldAnalysis,
    WeatherAnalysis,
    WeatherEvent,
    CropWeatherImpact,
    SoilHealthAnalysis,
    NutrientLevel,
    PestAnalysis,
    PestThreat,
    LowImpactCropSuggestion,
    DroughtAnalysis,
    DroughtCropSuggestion,
    MonocultureAnalysis,
    RegionalCropData,
    DiversificationSuggestion,
)

logger = logging.getLogger("ohdeere.services.yield_analyzer")

# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

_GRADE_SCORE = {"A": 95, "B": 80, "C": 60, "D": 40, "F": 15}
_SCORE_THRESHOLDS = [(90, "A"), (75, "B"), (50, "C"), (30, "D"), (0, "F")]

CATEGORY_MODELS = {
    "weather": WeatherAnalysis,
    "soil_health": SoilHealthAnalysis,
    "pest": PestAnalysis,
    "drought": DroughtAnalysis,
    "monoculture": MonocultureAnalysis,
}


def _score_to_grade(score: float) -> str:
    for threshold, grade in _SCORE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "F"


def _score_to_risk(score: float) -> str:
    if score >= 80:
        return "low"
    if score >= 60:
        return "moderate"
    if score >= 35:
        return "high"
    return "critical"


def _grades_to_overall(grades: list) -> tuple:
    avg = sum(_GRADE_SCORE.get(g, 60) for g in grades) / len(grades)
    for threshold, grade in _SCORE_THRESHOLDS:
        if avg >= threshold:
            return grade, round(avg)
    return "F", round(avg)


def _clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def _safe_avg(values):
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else 0


def _get_crops(profile: FarmProfile) -> list[str]:
    crops = set()
    for zone in profile.crop_zones:
        for crop in zone.crops_by_year.values():
            if crop:
                crops.add(crop)
    return list(crops) or ["Corn"]


def _get_current_year_crops(profile: FarmProfile) -> list[str]:
    year = str(date.today().year)
    prev = str(date.today().year - 1)
    crops = set()
    for zone in profile.crop_zones:
        c = zone.crops_by_year.get(year) or zone.crops_by_year.get(prev)
        if c:
            crops.add(c)
    return list(crops) or _get_crops(profile)


# ---------------------------------------------------------------------------
# Knowledge base
# ---------------------------------------------------------------------------

CROP_THRESHOLDS = {
    "Corn": {"frost_sensitive": True, "heat_c": 35, "optimal": (18, 32)},
    "Soybean": {"frost_sensitive": True, "heat_c": 35, "optimal": (20, 30)},
    "Wheat": {"frost_sensitive": False, "heat_c": 32, "optimal": (12, 25)},
    "Rice": {"frost_sensitive": True, "heat_c": 38, "optimal": (22, 35)},
    "Cotton": {"frost_sensitive": True, "heat_c": 38, "optimal": (20, 35)},
    "Alfalfa": {"frost_sensitive": False, "heat_c": 35, "optimal": (15, 30)},
    "Barley": {"frost_sensitive": False, "heat_c": 30, "optimal": (10, 24)},
    "Oats": {"frost_sensitive": False, "heat_c": 30, "optimal": (10, 24)},
    "Sorghum": {"frost_sensitive": True, "heat_c": 40, "optimal": (25, 35)},
    "Sunflower": {"frost_sensitive": True, "heat_c": 35, "optimal": (18, 30)},
}

CROP_PEST_DB = {
    "Corn": [
        ("Corn Earworm", "insect", 20, 60),
        ("European Corn Borer", "insect", 18, 50),
        ("Gray Leaf Spot", "fungal", 22, 75),
        ("Northern Corn Leaf Blight", "fungal", 18, 70),
    ],
    "Soybean": [
        ("Soybean Aphid", "insect", 18, 55),
        ("Bean Leaf Beetle", "insect", 20, 50),
        ("Sudden Death Syndrome", "fungal", 15, 70),
        ("Soybean Rust", "fungal", 20, 80),
    ],
    "Wheat": [
        ("Hessian Fly", "insect", 12, 50),
        ("Wheat Stem Rust", "fungal", 15, 70),
        ("Fusarium Head Blight", "fungal", 20, 80),
        ("Wheat Aphid", "insect", 15, 50),
    ],
}
CROP_PEST_DB["_default"] = [
    ("Aphids", "insect", 18, 55),
    ("Powdery Mildew", "fungal", 15, 70),
    ("Root Rot", "fungal", 10, 75),
]

ROTATION_RECS = {
    "Corn": [
        ("Soybean", "Nitrogen fixation reduces fertilizer needs and breaks corn pest cycles", "excellent", 12),
        ("Wheat", "Different root depth and pest profile improves soil structure", "good", 8),
        ("Oats", "Excellent cover crop that reduces erosion and builds organic matter", "good", 6),
    ],
    "Soybean": [
        ("Corn", "High biomass adds organic matter; uses residual fixed nitrogen", "excellent", 15),
        ("Wheat", "Different root structure breaks compaction layers", "good", 8),
        ("Sorghum", "Drought-tolerant alternative with distinct pest profile", "good", 7),
    ],
    "Wheat": [
        ("Soybean", "Nitrogen fixation replenishes soil after wheat extraction", "excellent", 14),
        ("Corn", "Different nutrient demands and root architecture", "good", 10),
        ("Sunflower", "Deep taproot breaks compaction, attracts pollinators", "good", 6),
    ],
}
ROTATION_RECS["_default"] = [
    ("Soybean", "Nitrogen fixation improves soil fertility for subsequent crops", "excellent", 12),
    ("Corn", "High biomass production builds soil organic matter", "good", 8),
    ("Wheat", "Winter cover reduces erosion and breaks pest cycles", "good", 7),
]

DROUGHT_CROP_DB = [
    DroughtCropSuggestion(crop="Sorghum", drought_tolerance_score=90, water_requirement="low",
                          expected_yield_under_drought="75-85% of normal", rationale="C4 photosynthesis and deep root system enable efficient water use under deficit conditions"),
    DroughtCropSuggestion(crop="Millet", drought_tolerance_score=88, water_requirement="low",
                          expected_yield_under_drought="70-80% of normal", rationale="Short growing season and low water requirement minimize drought exposure window"),
    DroughtCropSuggestion(crop="Sunflower", drought_tolerance_score=75, water_requirement="moderate",
                          expected_yield_under_drought="65-75% of normal", rationale="Deep taproot system accesses subsurface moisture during extended dry periods"),
    DroughtCropSuggestion(crop="Chickpea", drought_tolerance_score=72, water_requirement="low",
                          expected_yield_under_drought="60-70% of normal", rationale="Adapted to semi-arid growing conditions with minimal irrigation needs"),
    DroughtCropSuggestion(crop="Barley", drought_tolerance_score=68, water_requirement="moderate",
                          expected_yield_under_drought="60-70% of normal", rationale="Early maturation avoids late-season drought stress common in summer months"),
]

PEST_RESISTANT_CROPS = [
    LowImpactCropSuggestion(crop="Rye", pest_resistance_score=85, rationale="Strong allelopathic properties suppress weeds and many soil-borne pests"),
    LowImpactCropSuggestion(crop="Sorghum", pest_resistance_score=82, rationale="Natural tannins and waxy leaf coating deter common row-crop insects"),
    LowImpactCropSuggestion(crop="Buckwheat", pest_resistance_score=80, rationale="Rapid canopy closure outcompetes weeds; few insect pest issues"),
    LowImpactCropSuggestion(crop="Oats", pest_resistance_score=78, rationale="Cool-season growth window avoids peak warm-season pest pressure"),
    LowImpactCropSuggestion(crop="Sunflower", pest_resistance_score=75, rationale="Few shared pest profiles with major row crops in rotation"),
]


def _classify_texture(clay, sand):
    """Classify soil texture from g/kg values. Returns (name, description)."""
    c = (clay or 0) / 10
    s = (sand or 0) / 10
    if c > 40:
        return "clay", "Heavy clay texture — high water retention but poor drainage and aeration"
    if c > 27:
        return "clay loam", "Moderate-heavy texture — good water retention with fair drainage"
    if s > 70:
        return "sandy", "Sandy texture — rapid drainage with low water and nutrient retention"
    if s > 50:
        return "sandy loam", "Sandy loam — moderate drainage with fair nutrient retention"
    if c > 15:
        return "loam", "Loam texture — well-balanced drainage, water retention, and aeration"
    return "silt loam", "Silt loam — good water retention and nutrient availability"


# ---------------------------------------------------------------------------
# Weather analysis
# ---------------------------------------------------------------------------

def _analyze_weather(profile: FarmProfile, weather_data: dict | None) -> dict:
    today_str = date.today().isoformat()

    if not weather_data:
        return WeatherAnalysis(
            grade="C", risk_level="moderate",
            summary="Weather data temporarily unavailable — using baseline estimates for this region.",
            upcoming_events=[WeatherEvent(date=today_str, event_type="data_gap", severity="moderate",
                                          description="Weather service temporarily unavailable")],
            crop_impacts=[CropWeatherImpact(crop="All crops", impact_description="Unable to assess specific impacts without forecast data",
                                            estimated_yield_impact_pct=0, mitigation_action="Monitor local weather forecasts")],
            mitigation_recommendations=["Monitor local forecasts daily", "Maintain flexible irrigation scheduling"],
        ).model_dump()

    daily = weather_data.get("daily", {})
    hourly = weather_data.get("hourly", {})
    times = daily.get("time", [])
    max_temps = daily.get("temperature_2m_max", [])
    min_temps = daily.get("temperature_2m_min", [])
    precip = daily.get("precipitation_sum", [])
    et0_vals = daily.get("et0_fao_evapotranspiration", [])
    wind = daily.get("wind_speed_10m_max", [])
    codes = daily.get("weather_code", [])
    hourly_humidity = hourly.get("relative_humidity_2m", [])

    avg_max = _safe_avg(max_temps)
    avg_min = _safe_avg(min_temps)
    total_precip = sum(p for p in precip if p is not None)
    total_et0 = sum(e for e in et0_vals if e is not None)
    max_wind_val = max((w for w in wind if w is not None), default=0)
    avg_humidity = _safe_avg(hourly_humidity) if hourly_humidity else 60

    score = 100
    events = []
    recs = []

    # Frost
    frost_count = 0
    for i, t in enumerate(min_temps):
        if t is not None and t <= 0:
            frost_count += 1
            d = times[i] if i < len(times) else today_str
            events.append(WeatherEvent(date=d, event_type="frost",
                                       severity="high" if t <= -5 else "moderate",
                                       description=f"Low of {round(t, 1)}°C — frost damage risk for sensitive crops"))
    score -= frost_count * 12
    if frost_count:
        recs.append("Delay planting of frost-sensitive crops until frost risk has passed")
        recs.append("Use row covers or frost blankets to protect established seedlings")

    # Heat stress
    heat_count = 0
    for i, t in enumerate(max_temps):
        if t is not None and t >= 35:
            heat_count += 1
            d = times[i] if i < len(times) else today_str
            events.append(WeatherEvent(date=d, event_type="heat_wave",
                                       severity="critical" if t >= 40 else "high",
                                       description=f"High of {round(t, 1)}°C — heat stress likely for most crops"))
    score -= heat_count * 10
    if heat_count:
        recs.append("Increase irrigation frequency during heat events to reduce crop stress")
        recs.append("Apply mulch to reduce soil temperature and conserve moisture")

    # Heavy rain
    for i, p in enumerate(precip):
        if p is not None and p > 25:
            d = times[i] if i < len(times) else today_str
            events.append(WeatherEvent(date=d, event_type="heavy_rain",
                                       severity="high" if p > 50 else "moderate",
                                       description=f"Precipitation of {round(p, 1)}mm — waterlogging and erosion risk"))
            score -= 8
    if any(p and p > 25 for p in precip):
        recs.append("Ensure field drainage systems are clear before heavy rainfall events")
        recs.append("Avoid field operations during and after heavy rain to prevent compaction")

    # Wind
    for i, w in enumerate(wind):
        if w is not None and w > 50:
            d = times[i] if i < len(times) else today_str
            events.append(WeatherEvent(date=d, event_type="strong_wind",
                                       severity="high" if w > 70 else "moderate",
                                       description=f"Winds up to {round(w)}km/h — lodging risk for tall crops"))
            score -= 8
    if max_wind_val > 50:
        recs.append("Secure support structures for tall crops ahead of high-wind events")

    # Severe weather codes
    for i, c in enumerate(codes):
        if c is not None and c >= 95:
            d = times[i] if i < len(times) else today_str
            label = "Thunderstorm with hail" if c >= 96 else "Thunderstorm"
            sev = "critical" if c >= 96 else "high"
            events.append(WeatherEvent(date=d, event_type="thunderstorm", severity=sev,
                                       description=f"{label} expected — potential for crop and equipment damage"))
            score -= 10

    # Water balance
    water_bal = total_precip - total_et0
    if water_bal < -20:
        score -= 8
        recs.append(f"Water deficit of {abs(round(water_bal, 1))}mm forecast — supplement with irrigation")
    elif water_bal > 40:
        score -= 5
        recs.append(f"Water surplus of {round(water_bal, 1)}mm forecast — monitor for waterlogging")

    # Cool temps
    avg_temp = (avg_max + avg_min) / 2
    if avg_temp < 10:
        score -= 5
        recs.append("Cool temperatures may slow crop growth — consider cold-tolerant varieties")

    if not events:
        events.append(WeatherEvent(date=times[0] if times else today_str, event_type="favorable", severity="low",
                                   description="No significant weather events expected — favorable conditions"))
    if not recs:
        recs.append("Conditions are favorable — maintain regular crop management schedule")
        recs.append("Continue monitoring 7-day forecasts for any shifts in weather patterns")

    score = _clamp(score)
    grade = _score_to_grade(score)

    # Crop impacts
    crops = _get_current_year_crops(profile)
    crop_impacts = []
    for crop_name in crops[:4]:
        thresh = CROP_THRESHOLDS.get(crop_name, CROP_THRESHOLDS.get("Corn", {}))
        impact = 0
        desc = f"Conditions within acceptable range for {crop_name}"
        mit = "Continue standard management practices"

        if frost_count and thresh.get("frost_sensitive", True):
            impact -= frost_count * 5
            desc = f"Frost risk — {frost_count} event(s) below 0°C may damage {crop_name}"
            mit = "Delay planting or apply frost protection"
        elif heat_count:
            ht = thresh.get("heat_c", 35)
            hot = sum(1 for t in max_temps if t is not None and t >= ht)
            if hot:
                impact -= hot * 4
                desc = f"Heat stress on {hot} day(s) exceeding {ht}°C threshold for {crop_name}"
                mit = "Increase irrigation and monitor for heat stress symptoms"
        elif water_bal < -15:
            impact -= 3
            desc = f"Water deficit may reduce {crop_name} yields without supplemental irrigation"
            mit = "Schedule irrigation to maintain adequate soil moisture"

        if impact == 0 and score >= 75:
            impact = 2
            desc = f"Favorable conditions support healthy {crop_name} development"
            mit = "Maintain current practices — weather conditions are supportive"

        crop_impacts.append(CropWeatherImpact(crop=crop_name, impact_description=desc,
                                              estimated_yield_impact_pct=round(impact, 1), mitigation_action=mit))

    parts = [f"7-day forecast: avg high {round(avg_max, 1)}°C, avg low {round(avg_min, 1)}°C, "
             f"{round(total_precip, 1)}mm total precipitation"]
    if frost_count:
        parts.append(f"{frost_count} frost event(s)")
    if heat_count:
        parts.append(f"{heat_count} heat stress day(s)")
    if abs(water_bal) > 10:
        parts.append(f"water balance {'+' if water_bal > 0 else ''}{round(water_bal, 1)}mm")

    return WeatherAnalysis(
        grade=grade, risk_level=_score_to_risk(score),
        summary=". ".join(parts) + ".",
        upcoming_events=events[:8], crop_impacts=crop_impacts, mitigation_recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Soil analysis
# ---------------------------------------------------------------------------

def _analyze_soil(profile: FarmProfile, soil_data: dict | None) -> dict:
    if not soil_data or not soil_data.get("profiles"):
        return SoilHealthAnalysis(
            grade="C", risk_level="moderate",
            summary="Soil data temporarily unavailable — using baseline estimates.",
            ph_assessment="Soil testing recommended to determine pH levels for this field.",
            nutrient_levels=[NutrientLevel(nutrient="General", current_level="adequate", recommendation="Conduct comprehensive soil test for precise nutrient analysis")],
            organic_matter_trend="stable",
            fertilizer_impact_assessment="Unable to assess fertilizer impact without soil data. Conduct a soil test before adjusting fertilizer program.",
            recommendations=["Conduct comprehensive soil test", "Maintain current fertilizer program until test results are available"],
        ).model_dump()

    top = soil_data["profiles"][0]
    ph = top.get("phh2o")
    soc = top.get("soc")
    nitrogen = top.get("nitrogen")
    cec = top.get("cec")
    clay = top.get("clay")
    sand = top.get("sand")
    silt = top.get("silt")
    bdod = top.get("bdod")

    score = 100
    nutrients = []
    recs = []

    # pH assessment
    if ph is not None:
        if 6.0 <= ph <= 7.0:
            ph_text = f"pH {round(ph, 1)} — optimal range for most crops. Good nutrient availability expected."
        elif 5.5 <= ph < 6.0:
            ph_text = f"pH {round(ph, 1)} — slightly acidic. Most crops tolerate this but lime application could improve nutrient uptake."
            score -= 5
            recs.append("Consider lime application to raise pH closer to 6.5 for optimal nutrient availability")
        elif 7.0 < ph <= 7.5:
            ph_text = f"pH {round(ph, 1)} — slightly alkaline. Monitor micronutrient availability, especially iron and manganese."
            score -= 5
        elif ph < 5.5:
            ph_text = f"pH {round(ph, 1)} — acidic. Significant nutrient lockout likely. Lime application recommended."
            score -= 15
            recs.append("Apply agricultural lime to raise soil pH — acidic conditions limit nutrient availability")
        else:
            ph_text = f"pH {round(ph, 1)} — alkaline. May limit availability of phosphorus and micronutrients."
            score -= 12
            recs.append("Consider sulfur application to lower soil pH for improved nutrient availability")

        nutrients.append(NutrientLevel(nutrient="pH", current_level="adequate" if 5.8 <= ph <= 7.2 else ("low" if ph < 5.8 else "high"),
                                       value=round(ph, 1), unit="pH", recommendation=ph_text.split(". ", 1)[-1] if ". " in ph_text else "Within acceptable range"))
    else:
        ph_text = "pH data not available — soil testing recommended."

    # Organic carbon
    if soc is not None:
        if soc >= 25:
            soc_level, soc_desc = "high", f"Soil organic carbon {round(soc, 1)} g/kg (high) — excellent organic matter levels support microbial activity and nutrient cycling."
        elif soc >= 15:
            soc_level, soc_desc = "adequate", f"Soil organic carbon {round(soc, 1)} g/kg (adequate) — reasonable organic matter supporting soil structure."
            score -= 3
        elif soc >= 8:
            soc_level, soc_desc = "low", f"Soil organic carbon {round(soc, 1)} g/kg (low) — consider cover crops or organic amendments to build organic matter."
            score -= 10
            recs.append("Incorporate cover crops or compost to increase soil organic carbon levels")
        else:
            soc_level, soc_desc = "deficient", f"Soil organic carbon {round(soc, 1)} g/kg (very low) — organic matter depletion reduces water retention and fertility."
            score -= 18
            recs.append("Urgent: add organic amendments (compost, manure) and implement cover cropping to rebuild organic matter")

        nutrients.append(NutrientLevel(nutrient="Organic Carbon", current_level=soc_level,
                                       value=round(soc, 1), unit="g/kg", recommendation=soc_desc.split(" — ", 1)[-1] if " — " in soc_desc else "Maintain current levels"))

    # Nitrogen
    if nitrogen is not None:
        if nitrogen >= 2.0:
            n_level = "high"
            score -= 0
        elif nitrogen >= 1.2:
            n_level = "adequate"
            score -= 3
        elif nitrogen >= 0.6:
            n_level = "low"
            score -= 10
            recs.append("Apply nitrogen fertilizer or plant nitrogen-fixing cover crops to address deficiency")
        else:
            n_level = "deficient"
            score -= 15
            recs.append("Significant nitrogen deficiency — apply urea or ammonium-based fertilizer before planting")

        n_rec = {"high": "Adequate nitrogen — reduce applications to avoid excess", "adequate": "Nitrogen sufficient for most crops",
                 "low": "Supplement with nitrogen fertilizer", "deficient": "Apply nitrogen fertilizer immediately"}
        nutrients.append(NutrientLevel(nutrient="Nitrogen", current_level=n_level,
                                       value=round(nitrogen, 2), unit="g/kg", recommendation=n_rec[n_level]))

    # CEC
    if cec is not None:
        if cec >= 25:
            cec_level = "high"
        elif cec >= 12:
            cec_level = "adequate"
            score -= 3
        elif cec >= 5:
            cec_level = "low"
            score -= 8
            recs.append("Low CEC indicates limited nutrient-holding capacity — split fertilizer applications for better efficiency")
        else:
            cec_level = "deficient"
            score -= 12

        nutrients.append(NutrientLevel(nutrient="CEC", current_level=cec_level,
                                       value=round(cec, 1), unit="cmol/kg",
                                       recommendation="Good nutrient retention" if cec >= 12 else "Split fertilizer applications to reduce leaching"))

    # Bulk density / compaction
    if bdod is not None:
        if bdod > 1.6:
            score -= 10
            recs.append(f"Bulk density {round(bdod, 2)} g/cm³ indicates compaction — consider deep tillage or cover crops with deep taproots")
            nutrients.append(NutrientLevel(nutrient="Bulk Density", current_level="high",
                                           value=round(bdod, 2), unit="g/cm³", recommendation="Compaction detected — deep tillage recommended"))
        elif bdod > 1.4:
            score -= 4
            nutrients.append(NutrientLevel(nutrient="Bulk Density", current_level="adequate",
                                           value=round(bdod, 2), unit="g/cm³", recommendation="Moderate density — monitor for compaction trends"))

    # Texture
    tex_name, tex_desc = _classify_texture(clay, sand)
    if "sandy" in tex_name:
        score -= 5
        recs.append("Sandy soil has low water retention — consider more frequent, lighter irrigation")
    elif "clay" == tex_name:
        score -= 5
        recs.append("Heavy clay may impede drainage — ensure adequate tile drainage or raised beds")

    if not nutrients:
        nutrients.append(NutrientLevel(nutrient="General", current_level="adequate",
                                       recommendation="Soil properties within normal ranges"))
    if not recs:
        recs.append("Soil conditions are favorable — maintain current management practices")
        recs.append("Schedule annual soil testing to track nutrient trends over time")

    # Organic matter trend
    has_organic = any(f.lower() in ("compost", "manure", "fish emulsion", "bone meal", "blood meal")
                      for f in profile.fertilizers_used) if profile.fertilizers_used else False
    if soc and soc >= 20:
        om_trend = "improving" if has_organic else "stable"
    elif soc and soc < 10:
        om_trend = "declining" if not has_organic else "stable"
    else:
        om_trend = "stable"

    # Fertilizer assessment
    ferts = profile.fertilizers_used or []
    if not ferts:
        fert_text = "No fertilizers reported. Soil test results should guide a targeted fertilizer program."
    else:
        has_n = any(k in " ".join(ferts).lower() for k in ("urea", "ammon", "nitrate", "10-10-10", "blood meal", "fish", "manure", "compost"))
        has_p = any(k in " ".join(ferts).lower() for k in ("dap", "map", "phosphate", "superphosphate", "10-10-10", "bone meal", "manure", "compost"))
        has_k = any(k in " ".join(ferts).lower() for k in ("potash", "10-10-10", "manure", "compost"))
        parts = []
        if has_n:
            parts.append("nitrogen sources present")
        if has_p:
            parts.append("phosphorus sources present")
        if has_k:
            parts.append("potassium sources present")
        coverage = ", ".join(parts) if parts else "limited nutrient coverage"
        fert_text = f"Current program includes {', '.join(ferts[:3])}{'...' if len(ferts) > 3 else ''}. Nutrient coverage: {coverage}."
        if not has_n and nitrogen is not None and nitrogen < 1.2:
            fert_text += " Consider adding a nitrogen source to address low soil nitrogen."
        if ph is not None and ph < 5.8 and not any("lime" in f.lower() for f in ferts):
            fert_text += " Lime application recommended to correct acidic pH."

    score = _clamp(score)
    summary_parts = [f"Surface soil ({top.get('depth', '0-5cm')}): {tex_name} texture"]
    if ph is not None:
        summary_parts.append(f"pH {round(ph, 1)}")
    if soc is not None:
        summary_parts.append(f"organic carbon {round(soc, 1)} g/kg")
    if cec is not None:
        summary_parts.append(f"CEC {round(cec, 1)}")

    return SoilHealthAnalysis(
        grade=_score_to_grade(score), risk_level=_score_to_risk(score),
        summary=", ".join(summary_parts) + ".",
        ph_assessment=ph_text,
        nutrient_levels=nutrients,
        organic_matter_trend=om_trend,
        fertilizer_impact_assessment=fert_text,
        recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Pest analysis
# ---------------------------------------------------------------------------

def _analyze_pest(profile: FarmProfile, weather_data: dict | None) -> dict:
    month = date.today().month
    is_growing = 4 <= month <= 10

    if weather_data:
        hourly = weather_data.get("hourly", {})
        daily = weather_data.get("daily", {})
        avg_temp = _safe_avg(daily.get("temperature_2m_max", []) + daily.get("temperature_2m_min", [])) if daily.get("temperature_2m_max") else 20
        avg_temp = (_safe_avg(daily.get("temperature_2m_max", [])) + _safe_avg(daily.get("temperature_2m_min", []))) / 2 if daily.get("temperature_2m_max") else 20
        avg_humidity = _safe_avg(hourly.get("relative_humidity_2m", [])) if hourly.get("relative_humidity_2m") else 60
    else:
        avg_temp = 22 if is_growing else 8
        avg_humidity = 65

    crops = _get_current_year_crops(profile)
    score = 100
    active = []
    regional = []

    for crop_name in crops:
        pests = CROP_PEST_DB.get(crop_name, CROP_PEST_DB["_default"])
        for pest_name, threat_type, temp_min, humid_min in pests:
            if avg_temp >= temp_min and avg_humidity >= humid_min and is_growing:
                severity = avg_temp - temp_min + (avg_humidity - humid_min) * 0.3
                if severity > 25:
                    risk = "high"
                    score -= 10
                elif severity > 12:
                    risk = "moderate"
                    score -= 5
                else:
                    risk = "low"
                    score -= 2

                active.append(PestThreat(
                    pest_name=pest_name, threat_type=threat_type, risk_level=risk,
                    affected_crops=[crop_name], source_direction="regional",
                    description=f"Conditions favorable ({round(avg_temp, 1)}°C, {round(avg_humidity)}% humidity) — {threat_type} pressure {'elevated' if risk != 'low' else 'present'}"
                ))
            elif is_growing and avg_temp >= temp_min - 5:
                regional.append(PestThreat(
                    pest_name=pest_name, threat_type=threat_type, risk_level="low",
                    affected_crops=[crop_name], source_direction="statewide",
                    description=f"Below threshold but approaching — monitor if temperatures rise above {temp_min}°C"
                ))

    if not is_growing:
        score = min(score, 95)
        active = active or [PestThreat(
            pest_name="Winter dormancy", threat_type="insect", risk_level="low",
            affected_crops=crops[:1], source_direction="regional",
            description="Most pest activity dormant during winter months — minimal risk")]

    if not active:
        active.append(PestThreat(
            pest_name="General monitoring", threat_type="insect", risk_level="low",
            affected_crops=crops[:2], source_direction="regional",
            description="No specific pest threats detected under current conditions"))

    recs = []
    has_fungal = any(t.threat_type == "fungal" and t.risk_level in ("moderate", "high") for t in active)
    has_insect = any(t.threat_type == "insect" and t.risk_level in ("moderate", "high") for t in active)
    if has_fungal:
        recs.append("Scout fields for early fungal symptoms — apply preventive fungicide if disease pressure is confirmed")
        recs.append("Improve airflow between rows through proper plant spacing to reduce fungal disease risk")
    if has_insect:
        recs.append("Implement integrated pest management (IPM) — scout weekly and use economic thresholds before spraying")
        recs.append("Encourage beneficial insect populations through habitat strips and reduced broad-spectrum insecticide use")
    if not recs:
        recs.append("Continue routine scouting on a 7-day cycle to detect any emerging pest issues early")
        recs.append("Maintain crop residue management to reduce overwintering pest habitat")

    score = _clamp(score)
    n_active = len([t for t in active if t.risk_level in ("moderate", "high")])
    summary = f"{n_active} active threat(s) detected at {round(avg_temp, 1)}°C, {round(avg_humidity)}% humidity. "
    summary += "Elevated pressure for fungal diseases." if has_fungal else "Pest pressure within manageable levels."

    return PestAnalysis(
        grade=_score_to_grade(score), risk_level=_score_to_risk(score), summary=summary,
        active_threats=active[:6], regional_spread_risks=regional[:4],
        low_impact_crop_suggestions=[c for c in PEST_RESISTANT_CROPS if c.crop not in crops][:3],
        preventive_recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Drought analysis
# ---------------------------------------------------------------------------

def _analyze_drought(profile: FarmProfile, weather_data: dict | None) -> dict:
    if not weather_data:
        return DroughtAnalysis(
            grade="C", risk_level="moderate",
            summary="Weather data unavailable — drought status estimated as baseline.",
            current_drought_status="none", drought_outlook_30_day="Insufficient data for 30-day projection",
            drought_outlook_90_day="Insufficient data for 90-day projection",
            soil_moisture_assessment="Soil moisture data unavailable — field observation recommended.",
            resistant_crop_suggestions=[c.model_copy() for c in DROUGHT_CROP_DB[:3]],
            water_conservation_recommendations=["Monitor local drought reports", "Maintain flexible irrigation scheduling"],
        ).model_dump()

    daily = weather_data.get("daily", {})
    hourly = weather_data.get("hourly", {})
    precip = daily.get("precipitation_sum", [])
    et0_vals = daily.get("et0_fao_evapotranspiration", [])
    sm_vals = hourly.get("soil_moisture_0_to_7cm", [])

    total_precip = sum(p for p in precip if p is not None)
    total_et0 = sum(e for e in et0_vals if e is not None)
    water_bal = total_precip - total_et0
    avg_sm = _safe_avg(sm_vals) * 100 if sm_vals else None  # to percent

    # Classify drought status
    if water_bal > 0 and (avg_sm is None or avg_sm > 28):
        status = "none"
        score = 95
    elif water_bal > -5 and (avg_sm is None or avg_sm > 22):
        status = "none"
        score = 88
    elif water_bal > -15 and (avg_sm is None or avg_sm > 18):
        status = "abnormally_dry"
        score = 70
    elif water_bal > -25 and (avg_sm is None or avg_sm > 13):
        status = "moderate"
        score = 50
    elif water_bal > -40 and (avg_sm is None or avg_sm > 8):
        status = "severe"
        score = 30
    else:
        status = "extreme"
        score = 15

    # Outlooks
    if status == "none":
        o30 = "No drought conditions expected in the next 30 days based on current precipitation trends"
        o90 = "Seasonal outlook favorable — adequate moisture levels projected through the growing season"
    elif status == "abnormally_dry":
        o30 = "Drier-than-normal conditions may persist — monitor precipitation forecasts closely"
        o90 = "Watch for developing drought if below-normal precipitation continues"
    elif status == "moderate":
        o30 = "Drought conditions likely to continue without significant rainfall — irrigation recommended"
        o90 = "Extended dry period possible — plan for supplemental irrigation needs"
    else:
        o30 = "Severe moisture deficit expected to persist — immediate water conservation measures needed"
        o90 = "Prolonged drought conditions likely — evaluate crop insurance and drought-resistant alternatives"

    # Soil moisture text
    if avg_sm is not None:
        if avg_sm > 30:
            sm_text = f"Soil moisture at {round(avg_sm, 1)}% — adequate levels for crop growth. No irrigation adjustments needed."
        elif avg_sm > 20:
            sm_text = f"Soil moisture at {round(avg_sm, 1)}% — moderate levels. Monitor for decline and prepare irrigation."
        elif avg_sm > 10:
            sm_text = f"Soil moisture at {round(avg_sm, 1)}% — below optimal. Crops may show early stress symptoms. Irrigate promptly."
        else:
            sm_text = f"Soil moisture at {round(avg_sm, 1)}% — critically low. Immediate irrigation required to prevent crop loss."
    else:
        sm_text = "Soil moisture data not available from forecast — field observation recommended."

    recs = []
    if status in ("moderate", "severe", "extreme"):
        recs.append("Prioritize irrigation for crops at critical growth stages (flowering, grain fill)")
        recs.append("Apply mulch to reduce evaporation and maintain soil moisture between irrigations")
        recs.append("Consider deficit irrigation strategies to maximize water use efficiency")
    if status in ("abnormally_dry", "moderate"):
        recs.append("Monitor soil moisture at root zone depth to time irrigation precisely")
        recs.append("Reduce tillage to preserve soil moisture and structure")
    if not recs:
        recs.append("No drought-specific actions needed — maintain regular irrigation schedule")
        recs.append("Continue monitoring soil moisture and weather forecasts for changes")

    score = _clamp(score)
    summary_parts = [f"Water balance: {'+' if water_bal > 0 else ''}{round(water_bal, 1)}mm over 7 days"]
    if avg_sm is not None:
        summary_parts.append(f"soil moisture {round(avg_sm, 1)}%")
    status_label = status.replace("_", " ")
    summary_parts.append(f"drought status: {status_label}")

    return DroughtAnalysis(
        grade=_score_to_grade(score), risk_level=_score_to_risk(score),
        summary=". ".join(s.capitalize() if i == 0 else s for i, s in enumerate(summary_parts)) + ".",
        current_drought_status=status,
        drought_outlook_30_day=o30, drought_outlook_90_day=o90,
        soil_moisture_assessment=sm_text,
        resistant_crop_suggestions=[c.model_copy() for c in DROUGHT_CROP_DB[:4]],
        water_conservation_recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Monoculture analysis
# ---------------------------------------------------------------------------

def _analyze_monoculture(profile: FarmProfile) -> dict:
    # Analyze crop history
    all_crops = []
    max_consecutive = 0
    for zone in profile.crop_zones:
        years_sorted = sorted(zone.crops_by_year.items())
        for _, crop in years_sorted:
            if crop:
                all_crops.append(crop)

        consecutive = 1
        for i in range(1, len(years_sorted)):
            if years_sorted[i][1] == years_sorted[i - 1][1] and years_sorted[i][1]:
                consecutive += 1
            else:
                consecutive = 1
            max_consecutive = max(max_consecutive, consecutive)

    unique_crops = list(dict.fromkeys(all_crops)) or ["None reported"]
    crop_counts = {}
    for c in all_crops:
        crop_counts[c] = crop_counts.get(c, 0) + 1

    total = len(all_crops) or 1
    dominant = max(crop_counts, key=crop_counts.get) if crop_counts else "Unknown"
    dominant_pct = crop_counts.get(dominant, 0) / total * 100

    # Risk score: 0-100 where higher = more risky
    risk_score = 0
    if max_consecutive >= 4:
        risk_score = 85
    elif max_consecutive >= 3:
        risk_score = 65
    elif max_consecutive >= 2:
        risk_score = 40
    elif len(set(all_crops)) <= 1 and all_crops:
        risk_score = 50
    else:
        risk_score = max(0, 20 - len(set(all_crops)) * 5)

    if dominant_pct > 70:
        risk_score = max(risk_score, 60)
    elif dominant_pct > 50:
        risk_score = max(risk_score, 35)

    # Score is inverted (high risk_score = low yield score)
    score = _clamp(100 - risk_score)

    # Regional data (estimated based on farm's primary crops)
    regional = []
    if dominant != "Unknown":
        regional.append(RegionalCropData(region="County average", primary_crop=dominant, crop_percentage=round(dominant_pct * 0.9, 1), acreage=125000))
        second = [c for c in unique_crops if c != dominant]
        if second:
            regional.append(RegionalCropData(region="State average", primary_crop=second[0], crop_percentage=round(100 - dominant_pct * 0.9, 1), acreage=4200000))
        regional.append(RegionalCropData(region="National average", primary_crop=dominant, crop_percentage=round(min(dominant_pct * 0.7, 45), 1), acreage=18500000))

    # Rotation suggestions
    recs_data = ROTATION_RECS.get(dominant, ROTATION_RECS["_default"])
    suggestions = [
        DiversificationSuggestion(crop=c, benefit=b, rotation_fit=f, estimated_yield_benefit_pct=y,
                                  rationale=f"Rotating from {dominant} to {c} after {max_consecutive} year(s) provides {b.lower()}")
        for c, b, f, y in recs_data
        if c not in unique_crops or max_consecutive > 1
    ]

    recs = []
    if max_consecutive >= 3:
        recs.append(f"Break {max_consecutive}-year {dominant} monoculture immediately — rotate to a different crop family next season")
        recs.append("Soil-borne disease and pest pressure increase significantly after 3+ consecutive years of the same crop")
    elif max_consecutive >= 2:
        recs.append(f"Consider rotating away from {dominant} next season to break 2-year pattern")
        recs.append("Crop rotation improves soil health, reduces pest buildup, and typically increases yields 8-15%")
    if len(set(all_crops)) < 3:
        recs.append("Increase crop diversity to at least 3 species in rotation for optimal soil health and risk management")
    if not recs:
        recs.append("Good crop rotation practices observed — continue diversified planting strategy")
        recs.append("Consider adding a legume to the rotation for nitrogen fixation benefits")

    summary = f"{max_consecutive} consecutive year(s) of {dominant}. "
    if risk_score > 60:
        summary += f"High monoculture risk ({risk_score}/100). Immediate rotation recommended."
    elif risk_score > 35:
        summary += f"Moderate monoculture risk ({risk_score}/100). Plan crop rotation for next season."
    else:
        summary += f"Low monoculture risk ({risk_score}/100). Rotation practices are adequate."

    return MonocultureAnalysis(
        grade=_score_to_grade(score), risk_level=_score_to_risk(score), summary=summary,
        risk_score=risk_score, consecutive_same_crop_years=max_consecutive,
        farmer_crop_history=unique_crops[:6], regional_crop_data=regional[:3],
        diversification_suggestions=suggestions[:3], recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_ANALYZERS = {
    "weather": lambda p, w, s: _analyze_weather(p, w),
    "soil_health": lambda p, w, s: _analyze_soil(p, s),
    "pest": lambda p, w, s: _analyze_pest(p, w),
    "drought": lambda p, w, s: _analyze_drought(p, w),
    "monoculture": lambda p, w, s: _analyze_monoculture(p),
}


async def analyze_category(
    category: str,
    farm_profile: FarmProfile,
    weather_data: dict = None,
    soil_data: dict = None,
) -> dict:
    """Run a single-category yield analysis and return the validated dict."""
    if category not in _ANALYZERS:
        raise ValueError(f"Unknown category '{category}'. Must be one of: {list(_ANALYZERS.keys())}")
    return _ANALYZERS[category](farm_profile, weather_data, soil_data)


async def analyze_yield(
    farm_profile: FarmProfile,
    weather_data: dict = None,
    soil_data: dict = None,
) -> YieldAnalysis:
    """Run all 5 category analyses and assemble into YieldAnalysis."""
    results = {cat: _ANALYZERS[cat](farm_profile, weather_data, soil_data) for cat in CATEGORY_MODELS}
    grades = [results[c]["grade"] for c in CATEGORY_MODELS]
    overall_grade, overall_score = _grades_to_overall(grades)

    logger.info("Yield analysis complete — grade: %s (%s/100)", overall_grade, overall_score)

    return YieldAnalysis.model_validate({
        "overall_grade": overall_grade,
        "overall_yield_score": overall_score,
        "summary": " | ".join(
            f"{cat.replace('_', ' ').title()}: {results[cat]['summary'][:100]}"
            for cat in CATEGORY_MODELS
        ),
        "weather": results["weather"],
        "soil_health": results["soil_health"],
        "pest_forecast": results["pest"],
        "drought_resistance": results["drought"],
        "monoculture_risk": results["monoculture"],
    })
