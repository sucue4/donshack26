"""
Oh Deere! — Deterministic yield analysis engine.

Computes yield analysis from Open-Meteo weather data and SoilGrids soil data
using established agronomic indices:
  - Precipitation Adequacy Ratio (P/ET0)
  - Growing Degree Day accumulation
  - Soil Quality Index (weighted pH, SOC, N, CEC, compaction, texture)
  - Environmental Pest Pressure Index (temp × humidity × seasonality)
  - Standardised moisture deficit (P-ET0 / ET0)
  - Shannon-Wiener crop diversity index
"""

import logging
import math
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
# Agronomic knowledge base
# ---------------------------------------------------------------------------

# Crop-specific growing parameters (°C unless noted)
CROP_PARAMS = {
    "Corn":      {"t_base": 10, "t_opt_lo": 20, "t_opt_hi": 30, "t_max": 40, "frost_kill": 0,  "gdd_maturity": 1400, "kc": 1.15},
    "Soybean":   {"t_base": 10, "t_opt_lo": 22, "t_opt_hi": 30, "t_max": 38, "frost_kill": 0,  "gdd_maturity": 1200, "kc": 1.10},
    "Wheat":     {"t_base": 0,  "t_opt_lo": 12, "t_opt_hi": 24, "t_max": 34, "frost_kill": -15, "gdd_maturity": 1800, "kc": 1.05},
    "Rice":      {"t_base": 10, "t_opt_lo": 24, "t_opt_hi": 32, "t_max": 40, "frost_kill": 0,  "gdd_maturity": 1600, "kc": 1.20},
    "Cotton":    {"t_base": 15, "t_opt_lo": 25, "t_opt_hi": 35, "t_max": 42, "frost_kill": 2,  "gdd_maturity": 1500, "kc": 1.15},
    "Alfalfa":   {"t_base": 5,  "t_opt_lo": 15, "t_opt_hi": 28, "t_max": 38, "frost_kill": -10, "gdd_maturity": 1100, "kc": 1.00},
    "Barley":    {"t_base": 0,  "t_opt_lo": 12, "t_opt_hi": 22, "t_max": 32, "frost_kill": -12, "gdd_maturity": 1300, "kc": 1.00},
    "Oats":      {"t_base": 0,  "t_opt_lo": 10, "t_opt_hi": 22, "t_max": 30, "frost_kill": -10, "gdd_maturity": 1200, "kc": 1.00},
    "Sorghum":   {"t_base": 10, "t_opt_lo": 25, "t_opt_hi": 33, "t_max": 42, "frost_kill": 2,  "gdd_maturity": 1300, "kc": 1.10},
    "Sunflower": {"t_base": 6,  "t_opt_lo": 18, "t_opt_hi": 28, "t_max": 38, "frost_kill": -2, "gdd_maturity": 1200, "kc": 0.95},
}
_DEFAULT_CROP = {"t_base": 10, "t_opt_lo": 18, "t_opt_hi": 30, "t_max": 38, "frost_kill": 0, "gdd_maturity": 1400, "kc": 1.10}

# Pest biology thresholds — (pest_name, threat_type, min_temp_C, min_humidity%, development_rate_per_degC)
CROP_PEST_DB = {
    "Corn": [
        ("Corn Earworm (Helicoverpa zea)", "insect", 15, 55, 0.05),
        ("European Corn Borer (Ostrinia nubilalis)", "insect", 12, 45, 0.04),
        ("Gray Leaf Spot (Cercospora zeae-maydis)", "fungal", 20, 75, 0.06),
        ("Northern Corn Leaf Blight (Exserohilum turcicum)", "fungal", 18, 70, 0.05),
        ("Corn Rootworm (Diabrotica virgifera)", "insect", 10, 40, 0.03),
    ],
    "Soybean": [
        ("Soybean Aphid (Aphis glycines)", "insect", 15, 50, 0.06),
        ("Bean Leaf Beetle (Cerotoma trifurcata)", "insect", 18, 45, 0.04),
        ("Sudden Death Syndrome (Fusarium virguliforme)", "fungal", 13, 70, 0.05),
        ("Soybean Rust (Phakopsora pachyrhizi)", "fungal", 18, 80, 0.07),
        ("Brown Stem Rot (Cadophora gregata)", "fungal", 15, 65, 0.04),
    ],
    "Wheat": [
        ("Hessian Fly (Mayetiola destructor)", "insect", 10, 45, 0.04),
        ("Wheat Stem Rust (Puccinia graminis)", "fungal", 15, 70, 0.06),
        ("Fusarium Head Blight (Fusarium graminearum)", "fungal", 20, 80, 0.07),
        ("Wheat Aphid (Sitobion avenae)", "insect", 12, 45, 0.05),
        ("Septoria Leaf Blotch (Zymoseptoria tritici)", "fungal", 10, 75, 0.05),
    ],
}
CROP_PEST_DB["_default"] = [
    ("Aphids (Aphidoidea)", "insect", 15, 50, 0.05),
    ("Powdery Mildew (Erysiphales)", "fungal", 15, 65, 0.05),
    ("Root Rot (Rhizoctonia solani)", "fungal", 10, 70, 0.04),
]

# Crop rotation benefit matrix — (crop, benefit, rotation_fit, yield_benefit_pct)
ROTATION_RECS = {
    "Corn": [
        ("Soybean", "Nitrogen fixation saves 40-80 lbs/ac N; breaks rootworm cycle", "excellent", 12),
        ("Wheat", "Different root architecture relieves compaction; suppresses corn diseases", "good", 8),
        ("Oats", "Excellent cover crop; reduces erosion 50%+ and builds organic matter", "good", 6),
    ],
    "Soybean": [
        ("Corn", "High residue adds organic matter; utilizes residual fixed N (est. 40-60 lbs/ac)", "excellent", 15),
        ("Wheat", "Different root depth profile breaks compaction at 6-12\" zone", "good", 8),
        ("Sorghum", "C4 alternative with distinct pest profile and lower water requirement", "good", 7),
    ],
    "Wheat": [
        ("Soybean", "Nitrogen fixation replenishes 40-80 lbs/ac N extracted by wheat", "excellent", 14),
        ("Corn", "Deep roots break plow pan; different nutrient demand profile", "good", 10),
        ("Sunflower", "Taproot to 6ft+ breaks deep compaction; attracts pollinators", "good", 6),
    ],
}
ROTATION_RECS["_default"] = [
    ("Soybean", "Nitrogen fixation adds 40-80 lbs/ac plant-available N to soil", "excellent", 12),
    ("Corn", "High biomass production (4-5 tons/ac residue) builds soil organic matter", "good", 8),
    ("Wheat", "Winter cover reduces erosion 60%+ and breaks warm-season pest cycles", "good", 7),
]


def _classify_texture(clay_gkg, sand_gkg):
    """Classify soil texture from g/kg values. Returns (class, description, drainage, awc)."""
    c = (clay_gkg or 0) / 10  # convert g/kg → %
    s = (sand_gkg or 0) / 10
    if c > 40:
        return "clay", "Heavy clay", "poor", 0.15
    if c > 27:
        if s > 45:
            return "sandy clay loam", "Sandy clay loam", "moderate", 0.16
        return "clay loam", "Clay loam", "moderate", 0.18
    if s > 70:
        return "sandy", "Sandy", "excessive", 0.08
    if s > 50:
        return "sandy loam", "Sandy loam", "good", 0.12
    if c > 15:
        return "loam", "Loam", "good", 0.20
    return "silt loam", "Silt loam", "moderate", 0.22


# ---------------------------------------------------------------------------
# Weather analysis — weighted composite index
# ---------------------------------------------------------------------------

def _analyze_weather(profile: FarmProfile, weather_data: dict | None) -> dict:
    today_str = date.today().isoformat()
    crops = _get_current_year_crops(profile)
    primary_crop = crops[0]
    cp = CROP_PARAMS.get(primary_crop, _DEFAULT_CROP)

    if not weather_data:
        return WeatherAnalysis(
            grade="C", risk_level="moderate",
            summary="Weather data temporarily unavailable. Score assumes baseline conditions for region.",
            upcoming_events=[WeatherEvent(date=today_str, event_type="data_gap", severity="moderate",
                                          description="Weather service temporarily unavailable")],
            crop_impacts=[CropWeatherImpact(crop=primary_crop, impact_description="Unable to compute crop-specific impact without forecast data",
                                            estimated_yield_impact_pct=0.0, mitigation_action="Monitor local forecasts and adjust management accordingly")],
            mitigation_recommendations=["Monitor local weather forecasts daily", "Maintain flexible irrigation scheduling"],
        ).model_dump()

    daily = weather_data.get("daily", {})
    hourly = weather_data.get("hourly", {})
    times = daily.get("time", [])
    max_temps = daily.get("temperature_2m_max", [])
    min_temps = daily.get("temperature_2m_min", [])
    precip_vals = daily.get("precipitation_sum", [])
    et0_vals = daily.get("et0_fao_evapotranspiration", [])
    wind_vals = daily.get("wind_speed_10m_max", [])
    codes = daily.get("weather_code", [])
    hourly_humidity = hourly.get("relative_humidity_2m", [])

    avg_max = _safe_avg(max_temps)
    avg_min = _safe_avg(min_temps)
    avg_temp = (avg_max + avg_min) / 2
    total_precip = sum(p for p in precip_vals if p is not None)
    total_et0 = sum(e for e in et0_vals if e is not None)
    max_wind = max((w for w in wind_vals if w is not None), default=0)
    avg_humidity = _safe_avg(hourly_humidity) if hourly_humidity else 60

    # ---- Component 1: Temperature Suitability (0-100) ----
    # Distance from crop optimal range, scaled
    opt_mid = (cp["t_opt_lo"] + cp["t_opt_hi"]) / 2
    if cp["t_opt_lo"] <= avg_temp <= cp["t_opt_hi"]:
        temp_score = 100.0
    elif avg_temp < cp["t_opt_lo"]:
        deviation = cp["t_opt_lo"] - avg_temp
        temp_score = max(0, 100 - deviation * 5)  # -5 pts per °C below optimal
    else:
        deviation = avg_temp - cp["t_opt_hi"]
        temp_score = max(0, 100 - deviation * 7)  # -7 pts per °C above (heat more damaging)

    # Frost penalty: each day below crop frost-kill threshold
    frost_days = []
    for i, t in enumerate(min_temps):
        if t is not None and t <= cp["frost_kill"]:
            frost_days.append((times[i] if i < len(times) else today_str, t))
            temp_score -= 12  # hard penalty per frost event

    # Heat stress: each day above crop max
    heat_days = []
    for i, t in enumerate(max_temps):
        if t is not None and t >= cp["t_max"]:
            heat_days.append((times[i] if i < len(times) else today_str, t))
            temp_score -= 10

    temp_score = _clamp(temp_score)

    # ---- Component 2: Moisture Adequacy (0-100) ----
    # P/ET0 ratio — the precipitation adequacy ratio
    p_et0 = total_precip / total_et0 if total_et0 > 0 else 1.0
    # Optimal P/ET0 for crop: Kc (crop coefficient). Below Kc = deficit, above 2*Kc = excess
    kc = cp["kc"]
    if p_et0 < 0.3 * kc:
        moisture_score = max(0, p_et0 / (0.3 * kc) * 40)  # severe deficit
    elif p_et0 < kc:
        moisture_score = 40 + (p_et0 - 0.3 * kc) / (0.7 * kc) * 60  # moderate deficit to adequate
    elif p_et0 <= 1.8 * kc:
        moisture_score = 100.0  # adequate to slight surplus
    else:
        excess = p_et0 - 1.8 * kc
        moisture_score = max(30, 100 - excess * 25)  # waterlogging risk
    moisture_score = _clamp(moisture_score)

    # ---- Component 3: Wind & Severe Weather (0-100) ----
    wind_severe_score = 100.0
    severe_events = []
    for i, w in enumerate(wind_vals):
        if w is not None and w > 45:
            d = times[i] if i < len(times) else today_str
            severe_events.append(("strong_wind", d, w))
            wind_severe_score -= min(20, (w - 45) * 0.8)  # proportional to excess speed
    for i, c in enumerate(codes):
        if c is not None and c >= 95:
            d = times[i] if i < len(times) else today_str
            label = "Thunderstorm with hail" if c >= 96 else "Thunderstorm"
            severe_events.append((label, d, c))
            wind_severe_score -= 15
    for i, p in enumerate(precip_vals):
        if p is not None and p > 40:
            d = times[i] if i < len(times) else today_str
            severe_events.append(("heavy_rain", d, p))
            wind_severe_score -= 10
    wind_severe_score = _clamp(wind_severe_score)

    # ---- Component 4: GDD Trend (0-100) ----
    # Accumulate GDD from the 7-day forecast
    total_gdd = 0
    for hi, lo in zip(max_temps, min_temps):
        if hi is not None and lo is not None:
            avg_day = (hi + lo) / 2
            total_gdd += max(0, avg_day - cp["t_base"])
    # Expected GDD for a 7-day window during growing season
    expected_weekly_gdd = cp["gdd_maturity"] / 150 * 7  # ~150-day season
    month = date.today().month
    if 4 <= month <= 10:
        gdd_ratio = total_gdd / expected_weekly_gdd if expected_weekly_gdd > 0 else 1.0
        gdd_score = _clamp(min(100, gdd_ratio * 100))
    else:
        gdd_score = 70  # off-season, neutral

    # ---- Weighted Composite ----
    composite = (
        temp_score * 0.30 +
        moisture_score * 0.30 +
        wind_severe_score * 0.20 +
        gdd_score * 0.20
    )
    composite = _clamp(round(composite))
    grade = _score_to_grade(composite)

    # ---- Build events ----
    events = []
    for d, t in frost_days:
        events.append(WeatherEvent(date=d, event_type="frost",
                                   severity="high" if t <= -5 else "moderate",
                                   description=f"Low of {round(t, 1)}°C — below {primary_crop} frost-kill threshold ({cp['frost_kill']}°C)"))
    for d, t in heat_days:
        events.append(WeatherEvent(date=d, event_type="heat_wave",
                                   severity="critical" if t >= cp["t_max"] + 3 else "high",
                                   description=f"High of {round(t, 1)}°C — exceeds {primary_crop} maximum ({cp['t_max']}°C)"))
    for etype, d, val in severe_events:
        if etype == "strong_wind":
            events.append(WeatherEvent(date=d, event_type="strong_wind", severity="high" if val > 60 else "moderate",
                                       description=f"Winds up to {round(val)}km/h — lodging risk threshold is 45km/h"))
        elif etype == "heavy_rain":
            events.append(WeatherEvent(date=d, event_type="heavy_rain", severity="high" if val > 50 else "moderate",
                                       description=f"Precipitation of {round(val, 1)}mm — waterlogging and erosion risk"))
        else:
            events.append(WeatherEvent(date=d, event_type="thunderstorm", severity="critical" if "hail" in etype.lower() else "high",
                                       description=f"{etype} — potential crop and equipment damage"))

    if not events:
        events.append(WeatherEvent(date=times[0] if times else today_str, event_type="favorable", severity="low",
                                   description="No significant weather events in 7-day forecast"))

    # ---- Crop impacts ----
    crop_impacts = []
    for crop_name in crops[:4]:
        cpar = CROP_PARAMS.get(crop_name, _DEFAULT_CROP)
        impact_pct = 0.0
        desc_parts = []
        mit = "Continue standard management practices"

        # Frost impact
        n_frost = sum(1 for _, t in frost_days if t <= cpar["frost_kill"])
        if n_frost:
            impact_pct -= n_frost * 8
            desc_parts.append(f"{n_frost} frost event(s) below kill threshold ({cpar['frost_kill']}°C)")
            mit = "Delay planting or apply frost protection"

        # Heat impact
        n_heat = sum(1 for _, t in heat_days if t >= cpar["t_max"])
        if n_heat:
            impact_pct -= n_heat * 5
            desc_parts.append(f"{n_heat} day(s) above max temp ({cpar['t_max']}°C)")
            mit = "Increase irrigation frequency to offset evaporative stress"

        # Moisture impact
        if p_et0 < 0.5 * cpar["kc"]:
            deficit = round((cpar["kc"] - p_et0) * total_et0, 1)
            impact_pct -= 5
            desc_parts.append(f"P/ET0 ratio {round(p_et0, 2)} below crop Kc {cpar['kc']} (deficit ~{deficit}mm)")
            mit = "Schedule irrigation to close the {:.0f}mm moisture gap".format(deficit)
        elif p_et0 > 2.0 * cpar["kc"]:
            impact_pct -= 3
            desc_parts.append(f"Excess moisture — P/ET0 ratio {round(p_et0, 2)} (saturation risk)")
            mit = "Ensure drainage systems are clear; avoid compaction from field traffic"

        if not desc_parts:
            if composite >= 75:
                impact_pct = round((composite - 70) * 0.15, 1)
                desc_parts.append(f"Favorable conditions — temp suitability {round(temp_score)}/100, moisture adequacy {round(moisture_score)}/100")
                mit = f"Conditions support healthy {crop_name} development"
            else:
                desc_parts.append(f"Marginal conditions — temp suitability {round(temp_score)}/100, moisture adequacy {round(moisture_score)}/100")

        crop_impacts.append(CropWeatherImpact(
            crop=crop_name, impact_description="; ".join(desc_parts),
            estimated_yield_impact_pct=round(impact_pct, 1), mitigation_action=mit,
        ))

    # ---- Recommendations ----
    recs = []
    if frost_days:
        recs.append(f"Frost risk: {len(frost_days)} day(s) below {cp['frost_kill']}°C — delay planting of {primary_crop} until daily lows stabilize above {cp['frost_kill'] + 3}°C")
    if heat_days:
        recs.append(f"Heat stress: {len(heat_days)} day(s) above {cp['t_max']}°C — increase irrigation frequency and consider shade cloth for sensitive growth stages")
    if p_et0 < 0.7 * kc:
        deficit_mm = round((kc * total_et0) - total_precip, 1)
        recs.append(f"Water deficit: P/ET0 = {round(p_et0, 2)} (crop Kc = {kc}) — irrigate ~{deficit_mm}mm to meet crop demand")
    elif p_et0 > 2.0 * kc:
        recs.append(f"Excess moisture: P/ET0 = {round(p_et0, 2)} — clear drainage, delay any tillage until soil dries")
    if max_wind > 45:
        recs.append(f"Wind advisory: gusts up to {round(max_wind)}km/h — secure structures; lodging risk for tall crops above 45km/h")
    if avg_temp < cp["t_opt_lo"] - 5 and 3 <= month <= 9:
        recs.append(f"Below-optimum temperatures: avg {round(avg_temp, 1)}°C vs. {primary_crop} optimal {cp['t_opt_lo']}-{cp['t_opt_hi']}°C — delayed emergence expected")
    if not recs:
        recs.append("Conditions are within optimal ranges — maintain regular crop management schedule")
        recs.append("Continue monitoring 7-day forecasts for emerging risks")

    # ---- Summary ----
    summary = (
        f"Composite score {composite}/100. "
        f"Temp suitability {round(temp_score)}/100, "
        f"moisture adequacy {round(moisture_score)}/100 (P/ET0 = {round(p_et0, 2)}), "
        f"GDD accumulation {round(total_gdd, 1)}°C·days. "
        f"Avg high {round(avg_max, 1)}°C, low {round(avg_min, 1)}°C, "
        f"total precip {round(total_precip, 1)}mm over 7 days."
    )

    return WeatherAnalysis(
        grade=grade, risk_level=_score_to_risk(composite), summary=summary,
        upcoming_events=events[:8], crop_impacts=crop_impacts, mitigation_recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Soil analysis — Soil Quality Index
# ---------------------------------------------------------------------------

def _analyze_soil(profile: FarmProfile, soil_data: dict | None) -> dict:
    if not soil_data or not soil_data.get("profiles"):
        return SoilHealthAnalysis(
            grade="C", risk_level="moderate",
            summary="Soil data temporarily unavailable. Score assumes baseline conditions.",
            ph_assessment="Soil testing recommended to determine pH levels.",
            nutrient_levels=[NutrientLevel(nutrient="General", current_level="adequate", recommendation="Conduct soil test for precise nutrient analysis")],
            organic_matter_trend="stable",
            fertilizer_impact_assessment="Unable to assess without soil data. Conduct a soil test before adjusting fertilizer program.",
            recommendations=["Conduct comprehensive soil test", "Maintain current fertilizer program until results are available"],
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

    tex_class, tex_label, drainage, awc = _classify_texture(clay, sand)
    clay_pct = round((clay or 0) / 10, 1)
    sand_pct = round((sand or 0) / 10, 1)
    silt_pct = round((silt or 0) / 10, 1)

    nutrients = []
    recs = []

    # ---- pH Suitability Index (Gaussian, μ=6.5, σ=1.0) ----
    if ph is not None:
        ph_score = 100 * math.exp(-0.5 * ((ph - 6.5) / 1.0) ** 2)
        ph_score = _clamp(round(ph_score))

        if 6.0 <= ph <= 7.0:
            ph_text = f"pH {round(ph, 1)} — within the optimal 6.0-7.0 range (suitability index {ph_score}/100). Nutrient availability is maximised."
            ph_level = "adequate"
        elif 5.5 <= ph < 6.0:
            ph_text = f"pH {round(ph, 1)} — slightly acidic (suitability index {ph_score}/100). Aluminium toxicity risk is low, but lime application would improve P availability."
            ph_level = "low"
            recs.append(f"Soil pH {round(ph, 1)}: apply agricultural lime (2-3 tons/ac) to raise pH toward 6.5 for optimal nutrient availability")
        elif 7.0 < ph <= 7.5:
            ph_text = f"pH {round(ph, 1)} — slightly alkaline (suitability index {ph_score}/100). Monitor Fe and Mn micronutrient availability."
            ph_level = "adequate"
        elif ph < 5.5:
            ph_text = f"pH {round(ph, 1)} — strongly acidic (suitability index {ph_score}/100). Aluminium toxicity likely; significant nutrient lockout expected."
            ph_level = "deficient"
            recs.append(f"Critical: pH {round(ph, 1)} requires lime application (3-5 tons/ac) — Al toxicity reduces root growth and P uptake")
        else:
            ph_text = f"pH {round(ph, 1)} — alkaline (suitability index {ph_score}/100). Phosphorus and micronutrient availability may be limited."
            ph_level = "high"
            recs.append(f"pH {round(ph, 1)}: consider elemental sulfur or ammonium-based fertilizers to gradually lower pH")

        nutrients.append(NutrientLevel(nutrient="pH", current_level=ph_level, value=round(ph, 1), unit="pH",
                                       recommendation=f"Suitability index: {ph_score}/100"))
    else:
        ph_score = 50
        ph_text = "pH data not available — soil testing recommended."

    # ---- SOC Index (relative to texture-based expectation) ----
    # Expected SOC: loam ~20, clay ~25, sandy ~12 g/kg (NRCS benchmarks)
    expected_soc = 25 if "clay" in tex_class else (12 if "sand" in tex_class else 20)
    if soc is not None:
        soc_ratio = soc / expected_soc
        soc_score = _clamp(round(min(100, soc_ratio * 100)))
        om_pct = round(soc * 0.172, 2)  # SOC → OM using Van Bemmelen factor 1.724

        if soc_ratio >= 1.0:
            soc_level = "high"
            soc_desc = f"SOC {round(soc, 1)} g/kg ({om_pct}% OM) — meets/exceeds {tex_class} benchmark of {expected_soc} g/kg (index {soc_score}/100)"
        elif soc_ratio >= 0.6:
            soc_level = "adequate"
            soc_desc = f"SOC {round(soc, 1)} g/kg ({om_pct}% OM) — {round(soc_ratio * 100)}% of {tex_class} benchmark (index {soc_score}/100)"
        elif soc_ratio >= 0.35:
            soc_level = "low"
            soc_desc = f"SOC {round(soc, 1)} g/kg ({om_pct}% OM) — below {tex_class} benchmark of {expected_soc} g/kg (index {soc_score}/100)"
            recs.append(f"SOC at {round(soc_ratio * 100)}% of benchmark: incorporate cover crops and reduce tillage to build organic carbon")
        else:
            soc_level = "deficient"
            soc_desc = f"SOC {round(soc, 1)} g/kg ({om_pct}% OM) — critically low for {tex_class} (index {soc_score}/100)"
            recs.append(f"Critical SOC deficiency: add compost (2-4 tons/ac) and implement continuous cover cropping")

        nutrients.append(NutrientLevel(nutrient="Organic Carbon", current_level=soc_level,
                                       value=round(soc, 1), unit="g/kg", recommendation=soc_desc))
    else:
        soc_score = 50

    # ---- Nitrogen Sufficiency Index ----
    # Sufficiency range: 1.0-3.0 g/kg total N (NRCS)
    if nitrogen is not None:
        n_score = _clamp(round(min(100, (nitrogen / 1.5) * 100)))  # 1.5 g/kg = 100%
        if nitrogen >= 2.0:
            n_level, n_rec = "high", f"Total N {round(nitrogen, 2)} g/kg — well-supplied (index {n_score}/100). Reduce N fertilizer to avoid excess."
        elif nitrogen >= 1.0:
            n_level, n_rec = "adequate", f"Total N {round(nitrogen, 2)} g/kg — sufficient for most crops (index {n_score}/100)"
            if nitrogen < 1.3:
                recs.append("Nitrogen borderline adequate — side-dress N at V6 stage if corn shows pale green colour")
        elif nitrogen >= 0.5:
            n_level = "low"
            n_rec = f"Total N {round(nitrogen, 2)} g/kg — below sufficiency (index {n_score}/100). Supplement recommended."
            recs.append(f"Low nitrogen ({round(nitrogen, 2)} g/kg): apply 120-180 lbs/ac N for corn, 0-30 lbs/ac for soybeans")
            n_score = max(n_score - 10, 0)
        else:
            n_level = "deficient"
            n_rec = f"Total N {round(nitrogen, 2)} g/kg — severely deficient (index {n_score}/100)"
            recs.append(f"Severe N deficiency: apply split N (60 lbs/ac at planting + 80 lbs/ac at V6)")

        nutrients.append(NutrientLevel(nutrient="Nitrogen (total)", current_level=n_level,
                                       value=round(nitrogen, 2), unit="g/kg", recommendation=n_rec))
    else:
        n_score = 50

    # ---- CEC Quality Index ----
    # Expected CEC: clay 25-40, loam 15-25, sandy 3-10 cmol/kg
    expected_cec = 32 if "clay" in tex_class else (7 if "sand" in tex_class else 20)
    if cec is not None:
        cec_ratio = cec / expected_cec
        cec_score = _clamp(round(min(100, cec_ratio * 100)))
        if cec >= 15:
            cec_level = "adequate" if cec < 25 else "high"
        elif cec >= 5:
            cec_level = "low"
            recs.append(f"CEC {round(cec, 1)} cmol/kg: limited nutrient holding — split fertiliser applications to reduce leaching losses")
        else:
            cec_level = "deficient"
            recs.append(f"Very low CEC ({round(cec, 1)}): add organic matter and consider slow-release fertiliser formulations")

        nutrients.append(NutrientLevel(nutrient="CEC (Cation Exchange)", current_level=cec_level,
                                       value=round(cec, 1), unit="cmol/kg",
                                       recommendation=f"{round(cec_ratio * 100)}% of expected for {tex_class} (index {cec_score}/100)"))
    else:
        cec_score = 50

    # ---- Compaction Index (Bulk Density) ----
    # Ideal BD by texture: sandy 1.55, loam 1.35, clay 1.15 g/cm³
    ideal_bd = 1.15 if "clay" in tex_class else (1.55 if "sand" in tex_class else 1.35)
    if bdod is not None:
        if bdod <= ideal_bd:
            bd_score = 100
        else:
            bd_score = _clamp(round(max(0, 100 - (bdod - ideal_bd) * 250)))  # steep penalty above ideal
        if bdod > ideal_bd + 0.25:
            recs.append(f"Bulk density {round(bdod, 2)} g/cm³ exceeds threshold ({ideal_bd + 0.25}) — deep rip or cover crop with taproot (e.g., radish) recommended")
        nutrients.append(NutrientLevel(nutrient="Bulk Density", current_level="adequate" if bd_score >= 70 else ("high" if bd_score >= 40 else "excessive"),
                                       value=round(bdod, 2), unit="g/cm³",
                                       recommendation=f"Compaction index {bd_score}/100 (ideal ≤{ideal_bd} for {tex_class})"))
    else:
        bd_score = 70

    # ---- Texture Suitability ----
    # Loam is ideal (100), divergence penalised
    if "loam" in tex_class and "sand" not in tex_class and "clay" not in tex_class:
        tex_score = 95
    elif "silt loam" == tex_class or "clay loam" == tex_class:
        tex_score = 80
    elif "sandy loam" == tex_class or "sandy clay loam" == tex_class:
        tex_score = 70
    elif "sand" in tex_class:
        tex_score = 45
        if "sand" not in " ".join(recs).lower():
            recs.append(f"Sandy texture ({sand_pct}% sand): low AWC ({awc} in/in) — consider more frequent, lighter irrigation and organic amendments")
    elif tex_class == "clay":
        tex_score = 50
        if "clay" not in " ".join(recs).lower():
            recs.append(f"Heavy clay ({clay_pct}% clay): poor aeration and drainage — ensure adequate tile drainage")
    else:
        tex_score = 65

    # Add texture to nutrients display
    nutrients.append(NutrientLevel(nutrient="Texture", current_level=tex_label.lower(),
                                   value=None, unit=f"{clay_pct}% clay, {sand_pct}% sand, {silt_pct}% silt",
                                   recommendation=f"AWC ~{awc} in/in, drainage: {drainage}"))

    # ---- Weighted Composite SQI ----
    composite = round(
        ph_score * 0.25 +
        soc_score * 0.20 +
        n_score * 0.20 +
        cec_score * 0.15 +
        bd_score * 0.10 +
        tex_score * 0.10
    )
    composite = _clamp(composite)

    # ---- Organic matter trend ----
    has_organic = any(k in " ".join(profile.fertilizers_used).lower()
                      for k in ("compost", "manure", "fish", "bone meal", "blood meal")) if profile.fertilizers_used else False
    if soc and soc >= expected_soc * 0.9:
        om_trend = "improving" if has_organic else "stable"
    elif soc and soc < expected_soc * 0.5:
        om_trend = "declining" if not has_organic else "stable"
    else:
        om_trend = "stable"

    # ---- Fertilizer assessment ----
    ferts = profile.fertilizers_used or []
    if not ferts:
        fert_text = "No fertilizers reported. Soil test-based nutrient management plan recommended."
    else:
        has_n = any(k in " ".join(ferts).lower() for k in ("urea", "ammon", "nitrate", "10-10-10", "blood meal", "fish", "manure", "compost"))
        has_p = any(k in " ".join(ferts).lower() for k in ("dap", "map", "phosphate", "superphosphate", "10-10-10", "bone meal", "manure", "compost"))
        has_k = any(k in " ".join(ferts).lower() for k in ("potash", "10-10-10", "manure", "compost"))
        supplied = []
        if has_n:
            supplied.append("N")
        if has_p:
            supplied.append("P")
        if has_k:
            supplied.append("K")
        missing = [x for x in ["N", "P", "K"] if x not in supplied]
        fert_text = f"Current program ({', '.join(ferts[:3])}) supplies: {', '.join(supplied) if supplied else 'limited nutrients'}."
        if missing:
            fert_text += f" Missing coverage for: {', '.join(missing)}."
        if ph and ph < 5.8 and not any("lime" in f.lower() for f in ferts):
            fert_text += f" Lime application needed — pH {round(ph, 1)} limits nutrient uptake."

    if not recs:
        recs.append("Soil conditions are favorable — maintain current management practices")
        recs.append("Schedule annual soil testing to track trends over time")

    summary = (
        f"Soil Quality Index {composite}/100. "
        f"{tex_label} texture ({clay_pct}% clay, {sand_pct}% sand)"
        + (f", pH {round(ph, 1)} (index {ph_score}/100)" if ph else "")
        + (f", SOC {round(soc, 1)} g/kg ({round(soc / expected_soc * 100)}% of benchmark)" if soc else "")
        + (f", CEC {round(cec, 1)} cmol/kg" if cec else "")
        + "."
    )

    return SoilHealthAnalysis(
        grade=_score_to_grade(composite), risk_level=_score_to_risk(composite), summary=summary,
        ph_assessment=ph_text, nutrient_levels=nutrients, organic_matter_trend=om_trend,
        fertilizer_impact_assessment=fert_text, recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Pest analysis — Environmental Pressure Index
# ---------------------------------------------------------------------------

def _analyze_pest(profile: FarmProfile, weather_data: dict | None) -> dict:
    month = date.today().month
    is_growing = 4 <= month <= 10

    if weather_data:
        daily = weather_data.get("daily", {})
        hourly = weather_data.get("hourly", {})
        avg_temp = (_safe_avg(daily.get("temperature_2m_max", [])) + _safe_avg(daily.get("temperature_2m_min", []))) / 2 if daily.get("temperature_2m_max") else 20
        avg_humidity = _safe_avg(hourly.get("relative_humidity_2m", [])) if hourly.get("relative_humidity_2m") else 60
        max_temp = max((t for t in daily.get("temperature_2m_max", []) if t is not None), default=avg_temp)
        total_precip = sum(p for p in daily.get("precipitation_sum", []) if p is not None)
    else:
        avg_temp = 22 if is_growing else 5
        avg_humidity = 65
        max_temp = avg_temp + 5
        total_precip = 20

    crops = _get_current_year_crops(profile)
    # Consecutive years of same crop amplifies pest pressure
    max_consec = _compute_consecutive(profile)

    active = []
    regional = []
    max_epi = 0  # track highest environmental pressure index

    for crop_name in crops:
        pests = CROP_PEST_DB.get(crop_name, CROP_PEST_DB["_default"])
        for pest_name, threat_type, temp_min, humid_min, dev_rate in pests:
            # Environmental Pressure Index = temp_factor × humidity_factor × season_factor × host_factor
            temp_excess = max(0, avg_temp - temp_min)
            temp_factor = min(1.0, temp_excess / 15)  # saturates at 15°C above threshold

            humid_excess = max(0, avg_humidity - humid_min)
            humidity_factor = min(1.0, humid_excess / 30)  # saturates at 30% above threshold

            season_factor = 1.0 if is_growing else max(0.1, (month - 2) / 8) if month <= 6 else max(0.1, (12 - month) / 4)
            host_factor = min(1.5, 1.0 + (max_consec - 1) * 0.15)  # monoculture amplifies

            epi = temp_factor * humidity_factor * season_factor * host_factor * 100
            epi = _clamp(round(epi))
            max_epi = max(max_epi, epi)

            if epi >= 30:
                if epi >= 65:
                    risk = "high"
                elif epi >= 40:
                    risk = "moderate"
                else:
                    risk = "low"

                active.append(PestThreat(
                    pest_name=pest_name, threat_type=threat_type, risk_level=risk,
                    affected_crops=[crop_name], source_direction="regional",
                    description=(
                        f"EPI {epi}/100 — temp factor {round(temp_factor, 2)} ({round(avg_temp, 1)}°C vs. {temp_min}°C threshold), "
                        f"humidity factor {round(humidity_factor, 2)} ({round(avg_humidity)}% vs. {humid_min}% threshold)"
                        + (f", host factor {round(host_factor, 2)} ({max_consec}yr same crop)" if max_consec > 1 else "")
                    )
                ))
            elif epi >= 10:
                regional.append(PestThreat(
                    pest_name=pest_name, threat_type=threat_type, risk_level="low",
                    affected_crops=[crop_name], source_direction="statewide",
                    description=f"EPI {epi}/100 — below action threshold but conditions approaching; monitor if temp rises above {temp_min + 5}°C"
                ))

    # Score: inverse of max EPI
    composite = _clamp(round(100 - max_epi * 0.8))
    if not is_growing:
        composite = max(composite, 70)

    if not active:
        if is_growing:
            active.append(PestThreat(pest_name="No active threats", threat_type="insect", risk_level="low",
                                     affected_crops=crops[:2], source_direction="regional",
                                     description=f"EPI below action threshold at {round(avg_temp, 1)}°C, {round(avg_humidity)}% RH — conditions unfavourable for major pests"))
        else:
            active.append(PestThreat(pest_name="Winter dormancy period", threat_type="insect", risk_level="low",
                                     affected_crops=crops[:1], source_direction="regional",
                                     description=f"Avg temp {round(avg_temp, 1)}°C — most pest species inactive below 10°C"))

    # Crop suggestions — filter out farmer's current crops, compute resistance
    suggestions = []
    for resistant_crop, base_score, rationale in [
        ("Rye", 85, "Allelopathic compounds suppress soil-borne pathogens and nematodes"),
        ("Sorghum", 82, "Tannins and waxy cuticle deter Lepidoptera and sucking insects"),
        ("Buckwheat", 80, "Rapid canopy closure (21 days) outcompetes weeds; minimal insect pest pressure"),
        ("Oats", 78, "Cool-season window avoids peak warm-season pest populations"),
        ("Sunflower", 75, "Distinct pest complex — breaks disease/insect cycles from row crops"),
    ]:
        if resistant_crop not in crops:
            suggestions.append(LowImpactCropSuggestion(crop=resistant_crop, pest_resistance_score=base_score, rationale=rationale))
        if len(suggestions) >= 3:
            break

    # Recommendations
    recs = []
    n_moderate_plus = len([t for t in active if t.risk_level in ("moderate", "high")])
    has_fungal = any(t.threat_type == "fungal" and t.risk_level in ("moderate", "high") for t in active)
    has_insect = any(t.threat_type == "insect" and t.risk_level in ("moderate", "high") for t in active)
    if has_fungal:
        recs.append(f"Fungal pressure elevated at {round(avg_humidity)}% RH — scout for leaf lesions and apply preventive fungicide if disease incidence >5%")
        if total_precip > 20:
            recs.append(f"Recent rainfall ({round(total_precip, 1)}mm) prolongs leaf wetness — improve row spacing for airflow")
    if has_insect:
        recs.append("Implement IPM scouting on 5-7 day cycle — apply insecticide only when economic thresholds are exceeded")
    if max_consec >= 3:
        recs.append(f"Consecutive {crops[0]} ({max_consec} years) amplifies pest buildup — rotation reduces pest pressure 30-50%")
    if not recs:
        recs.append("Current conditions: low pest pressure — continue routine 7-day scouting cycle")
        recs.append("Maintain beneficial insect habitat (grassy waterways, field borders) for natural pest suppression")

    summary = (
        f"Composite pest score {composite}/100. "
        f"Peak EPI {max_epi}/100 at {round(avg_temp, 1)}°C, {round(avg_humidity)}% RH. "
        f"{n_moderate_plus} threat(s) at/above moderate level."
        + (f" Fungal pressure elevated." if has_fungal else "")
    )

    return PestAnalysis(
        grade=_score_to_grade(composite), risk_level=_score_to_risk(composite), summary=summary,
        active_threats=active[:6], regional_spread_risks=regional[:4],
        low_impact_crop_suggestions=suggestions[:3], preventive_recommendations=recs[:5],
    ).model_dump()


# ---------------------------------------------------------------------------
# Drought analysis — moisture deficit index
# ---------------------------------------------------------------------------

def _analyze_drought(profile: FarmProfile, weather_data: dict | None, soil_data: dict | None = None) -> dict:
    crops = _get_current_year_crops(profile)
    primary_crop = crops[0]
    cp = CROP_PARAMS.get(primary_crop, _DEFAULT_CROP)

    if not weather_data:
        return DroughtAnalysis(
            grade="C", risk_level="moderate",
            summary="Weather data unavailable — drought status estimated at baseline.",
            current_drought_status="none", drought_outlook_30_day="Insufficient data for projection",
            drought_outlook_90_day="Insufficient data for projection",
            soil_moisture_assessment="Field observation recommended.",
            resistant_crop_suggestions=_build_drought_crops(crops),
            water_conservation_recommendations=["Monitor local drought reports", "Maintain flexible irrigation scheduling"],
        ).model_dump()

    daily = weather_data.get("daily", {})
    hourly = weather_data.get("hourly", {})
    precip_vals = daily.get("precipitation_sum", [])
    et0_vals = daily.get("et0_fao_evapotranspiration", [])
    sm_vals = hourly.get("soil_moisture_0_to_7cm", [])

    total_precip = sum(p for p in precip_vals if p is not None)
    total_et0 = sum(e for e in et0_vals if e is not None)
    water_bal = total_precip - total_et0
    avg_sm = _safe_avg(sm_vals) * 100 if sm_vals else None  # volumetric → %

    # ---- Moisture Deficit Index (MDI) ----
    # Relative deficit = (P - ET0) / ET0 — positive=surplus, negative=deficit
    if total_et0 > 0:
        relative_deficit = water_bal / total_et0
    else:
        relative_deficit = 0

    # MDI score: +1.0 = surplus (100), 0 = balanced (65), -1.0 = severe deficit (0)
    deficit_score = _clamp(round(65 + relative_deficit * 45))

    # ---- Soil Moisture Adequacy ----
    # Surface 0-7cm FC estimate by texture (% volumetric)
    # Surface dries faster than root zone — these are ~70% of root-zone FC
    if soil_data and soil_data.get("profiles"):
        top = soil_data["profiles"][0]
        tex_class, _, _, _ = _classify_texture(top.get("clay"), top.get("sand"))
        fc_lookup = {"clay": 30, "clay loam": 26, "sandy clay loam": 22,
                     "silt loam": 24, "loam": 22, "sandy loam": 16, "sandy": 10}
        fc_est = fc_lookup.get(tex_class, 22)
    else:
        fc_est = 22  # default surface loam estimate

    if avg_sm is not None:
        sm_ratio = avg_sm / fc_est
        sm_score = _clamp(round(min(100, sm_ratio * 100)))
    else:
        sm_score = 50  # unknown
        sm_ratio = None

    # ---- Composite drought score ----
    # Dynamic weighting: when P/ET0 shows surplus, surface dryness is normal
    # between rain events — don't let it override the precipitation signal
    p_et0 = total_precip / total_et0 if total_et0 > 0 else 1.0

    if avg_sm is not None:
        if p_et0 > 1.0:
            # Surplus precipitation — surface dryness is normal between rain events
            composite = round(deficit_score * 0.70 + sm_score * 0.30)
            # Floor: clear precipitation surplus should not produce drought grades
            if p_et0 > 1.2:
                composite = max(composite, 72)
        elif p_et0 < 0.5:
            # Deficit confirmed by precip — soil moisture is critical indicator
            composite = round(deficit_score * 0.35 + sm_score * 0.65)
        else:
            composite = round(deficit_score * 0.50 + sm_score * 0.50)
    else:
        composite = deficit_score
    composite = _clamp(composite)

    # ---- Drought classification ----
    if composite >= 80:
        status = "none"
    elif composite >= 65:
        status = "abnormally_dry" if relative_deficit < -0.1 else "none"
    elif composite >= 50:
        status = "moderate" if relative_deficit < -0.3 else "abnormally_dry"
    elif composite >= 35:
        status = "severe"
    elif composite >= 20:
        status = "extreme"
    else:
        status = "exceptional"

    # ---- Outlooks based on trend ----
    # Check if precipitation is trending up or down over the 7-day window
    if len(precip_vals) >= 4:
        first_half = sum(p for p in precip_vals[:len(precip_vals)//2] if p is not None)
        second_half = sum(p for p in precip_vals[len(precip_vals)//2:] if p is not None)
        precip_trend = "increasing" if second_half > first_half * 1.3 else ("decreasing" if second_half < first_half * 0.7 else "stable")
    else:
        precip_trend = "stable"

    outlooks = {
        "none": (
            f"No drought conditions expected. Precipitation trend: {precip_trend}",
            "Seasonal outlook favorable — current moisture levels adequate for crop demand"
        ),
        "abnormally_dry": (
            f"Drier-than-normal conditions developing (MDI {deficit_score}/100). Precipitation trend: {precip_trend}",
            "Monitor closely — may develop into moderate drought without rainfall within 3-4 weeks"
        ),
        "moderate": (
            f"Moderate drought likely to persist (MDI {deficit_score}/100). Supplement irrigation to meet crop Kc = {cp['kc']}",
            f"Extended dry period probable — plan for {round(cp['kc'] * total_et0 - total_precip, 1)}mm/week supplemental irrigation"
        ),
        "severe": (
            f"Severe drought conditions expected to continue. Water deficit {abs(round(water_bal, 1))}mm over 7 days",
            "Prolonged drought likely — evaluate drought-resistant alternatives and crop insurance coverage"
        ),
        "extreme": (
            f"Extreme conditions. Critical water deficit of {abs(round(water_bal, 1))}mm. Immediate action required",
            "Emergency drought management — prioritise irrigation for highest-value crops at critical growth stages"
        ),
        "exceptional": (
            f"Exceptional drought. Severe crop stress inevitable without immediate irrigation intervention",
            "Consider crop abandonment for non-irrigated fields; focus water resources on irrigated acreage"
        ),
    }
    o30, o90 = outlooks.get(status, outlooks["moderate"])

    # ---- Soil moisture assessment ----
    if avg_sm is not None:
        if sm_ratio and sm_ratio > 0.9:
            sm_text = f"Soil moisture {round(avg_sm, 1)}% ({round(sm_ratio * 100)}% of estimated field capacity) — adequate. No irrigation adjustment needed."
        elif sm_ratio and sm_ratio > 0.6:
            sm_text = f"Soil moisture {round(avg_sm, 1)}% ({round(sm_ratio * 100)}% of FC) — moderate depletion. Begin irrigation when depletion reaches 50% of available water."
        elif sm_ratio and sm_ratio > 0.35:
            sm_text = f"Soil moisture {round(avg_sm, 1)}% ({round(sm_ratio * 100)}% of FC) — significant depletion. Irrigate promptly to prevent crop stress."
        else:
            sm_text = f"Soil moisture {round(avg_sm, 1)}% ({round(sm_ratio * 100)}% of FC) — below wilting point risk. Immediate irrigation critical."
    else:
        sm_text = "Soil moisture sensors not available in forecast data — recommend field tensiometer or probe readings."

    # ---- Recommendations ----
    recs = []
    if status in ("moderate", "severe", "extreme", "exceptional"):
        deficit_mm = abs(round(water_bal, 1))
        recs.append(f"Irrigation needed: {deficit_mm}mm deficit this week. For {primary_crop} (Kc={cp['kc']}), apply ~{round(deficit_mm * cp['kc'], 1)}mm")
        recs.append("Prioritise irrigation for crops at reproductive stages (pollination, grain fill) where yield impact is greatest")
        recs.append("Apply 2-3\" organic mulch to reduce evaporative losses by 25-50%")
    if status in ("abnormally_dry", "moderate"):
        recs.append("Reduce tillage to preserve soil moisture and surface residue cover")
        recs.append(f"Monitor soil moisture at {primary_crop} root zone depth (12-24\") to optimise irrigation timing")
    if not recs:
        recs.append("No drought-specific actions needed — maintain standard irrigation schedule")
        recs.append("Continue monitoring soil moisture and ET0 forecasts for developing deficits")

    summary = (
        f"Drought index {composite}/100. "
        f"Moisture deficit index {deficit_score}/100, P/ET0 = {round(total_precip, 1)}/{round(total_et0, 1)}mm (ratio {round(total_precip / total_et0 if total_et0 > 0 else 1, 2)}). "
        + (f"Soil moisture {round(avg_sm, 1)}% ({round(sm_ratio * 100)}% FC). " if avg_sm is not None and sm_ratio else "")
        + f"Status: {status.replace('_', ' ')}."
    )

    return DroughtAnalysis(
        grade=_score_to_grade(composite), risk_level=_score_to_risk(composite), summary=summary,
        current_drought_status=status, drought_outlook_30_day=o30, drought_outlook_90_day=o90,
        soil_moisture_assessment=sm_text,
        resistant_crop_suggestions=_build_drought_crops(crops),
        water_conservation_recommendations=recs[:5],
    ).model_dump()


def _build_drought_crops(exclude_crops):
    """Build drought-resistant crop suggestions, excluding farmer's current crops."""
    db = [
        ("Sorghum", 90, "low", "75-85% of normal",
         "C4 photosynthesis + deep fibrous root system (6ft+) enables efficient water extraction under deficit"),
        ("Millet", 88, "low", "70-80% of normal",
         "60-90 day maturity minimises drought exposure; water-use efficiency 2-3x higher than corn"),
        ("Sunflower", 75, "moderate", "65-75% of normal",
         "Taproot to 6ft+ accesses deep moisture; adjusts leaf angle to reduce transpiration under stress"),
        ("Chickpea", 72, "low", "60-70% of normal",
         "Osmotic adjustment maintains turgor at low water potential; indeterminate growth resumes after rain"),
        ("Barley", 68, "moderate", "60-70% of normal",
         "Early maturation (100-120 days) avoids mid-summer drought peak; lower Kc than corn"),
    ]
    result = []
    for crop, score, water, yld, rationale in db:
        if crop not in exclude_crops:
            result.append(DroughtCropSuggestion(crop=crop, drought_tolerance_score=score,
                                                water_requirement=water, expected_yield_under_drought=yld, rationale=rationale))
        if len(result) >= 4:
            break
    return result


# ---------------------------------------------------------------------------
# Monoculture analysis — Shannon-Wiener diversity
# ---------------------------------------------------------------------------

def _compute_consecutive(profile: FarmProfile) -> int:
    """Compute max consecutive same-crop years across all zones."""
    max_c = 0
    for zone in profile.crop_zones:
        years_sorted = sorted(zone.crops_by_year.items())
        consec = 1
        for i in range(1, len(years_sorted)):
            if years_sorted[i][1] == years_sorted[i - 1][1] and years_sorted[i][1]:
                consec += 1
            else:
                consec = 1
            max_c = max(max_c, consec)
        max_c = max(max_c, consec)
    return max_c


def _analyze_monoculture(profile: FarmProfile) -> dict:
    # ---- Extract crop history ----
    all_crops = []
    for zone in profile.crop_zones:
        for _, crop in sorted(zone.crops_by_year.items()):
            if crop:
                all_crops.append(crop)

    unique_crops = list(dict.fromkeys(all_crops)) or ["None reported"]
    total = len(all_crops) or 1
    max_consecutive = _compute_consecutive(profile)

    # Crop frequency distribution
    crop_counts = {}
    for c in all_crops:
        crop_counts[c] = crop_counts.get(c, 0) + 1
    dominant = max(crop_counts, key=crop_counts.get) if crop_counts else "Unknown"
    dominant_pct = crop_counts.get(dominant, 0) / total * 100

    # ---- Shannon-Wiener Diversity Index ----
    # H' = -Σ(pi × ln(pi)) where pi = proportion of crop i
    h_prime = 0
    for count in crop_counts.values():
        p = count / total
        if p > 0:
            h_prime -= p * math.log(p)

    h_max = math.log(len(crop_counts)) if len(crop_counts) > 1 else 1
    evenness = h_prime / h_max if h_max > 0 else 0  # Pielou's J (0-1)
    effective_species = math.exp(h_prime)  # exp(H')

    # ---- Consecutive-year yield drag ----
    # Research: corn-after-corn yields 10-15% less than corn-after-soybean (Plourde et al. 2013)
    # Each additional consecutive year compounds the drag
    yield_drag_pct = 0
    if max_consecutive >= 2:
        yield_drag_pct = min(30, 10 + (max_consecutive - 2) * 5)  # 10, 15, 20, 25, 30%

    # ---- Composite risk score (0-100, higher = more risky) ----
    diversity_score = _clamp(round(evenness * 100))  # 0 = monoculture, 100 = perfect evenness
    consecutive_penalty = min(50, max(0, (max_consecutive - 1) * 18))  # 0, 18, 36, 50

    risk_score = _clamp(round(100 - diversity_score + consecutive_penalty))

    # Yield score (inverse of risk)
    composite = _clamp(100 - risk_score)

    # ---- Regional context (estimated from farm data) ----
    regional = []
    if dominant != "Unknown":
        regional.append(RegionalCropData(region="Farm average", primary_crop=dominant,
                                         crop_percentage=round(dominant_pct, 1), acreage=None))
        second_crops = [c for c in unique_crops if c != dominant]
        if second_crops:
            second_pct = crop_counts.get(second_crops[0], 0) / total * 100
            regional.append(RegionalCropData(region="Farm secondary", primary_crop=second_crops[0],
                                             crop_percentage=round(second_pct, 1), acreage=None))

    # ---- Rotation suggestions ----
    recs_data = ROTATION_RECS.get(dominant, ROTATION_RECS["_default"])
    suggestions = []
    for crop, benefit, fit, yld_pct in recs_data:
        suggestions.append(DiversificationSuggestion(
            crop=crop, benefit=benefit, rotation_fit=fit, estimated_yield_benefit_pct=yld_pct,
            rationale=f"Rotating from {dominant} after {max_consecutive}yr: expected +{yld_pct}% yield vs. continuous {dominant}"
        ))

    # ---- Recommendations ----
    recs = []
    if max_consecutive >= 3:
        recs.append(f"Break {max_consecutive}-year {dominant} monoculture — continuous same-crop estimated yield drag: -{yield_drag_pct}%")
        recs.append(f"Corn-after-soybean typically yields 10-15% more than corn-after-corn (Plourde et al. 2013)")
    elif max_consecutive >= 2:
        recs.append(f"Second consecutive year of {dominant} — expect ~{yield_drag_pct}% yield drag vs. rotated field")
        recs.append(f"Plan rotation for next season to capture {recs_data[0][3]}% yield benefit")
    if evenness < 0.5:
        recs.append(f"Shannon evenness {round(evenness, 2)} (low diversity) — target ≥3 crop species in rotation over 4 years")
    if effective_species < 2 and len(crop_counts) > 1:
        recs.append(f"Effective species count: {round(effective_species, 1)} — diversification would reduce risk and improve soil biology")
    if not recs:
        recs.append(f"Good rotation diversity (Shannon H' = {round(h_prime, 2)}, evenness = {round(evenness, 2)}) — continue current rotation strategy")
        recs.append("Consider adding a legume phase if not already in rotation for biological N fixation")

    summary = (
        f"Diversity index: Shannon H' = {round(h_prime, 2)}, evenness = {round(evenness, 2)}, "
        f"effective species = {round(effective_species, 1)}. "
        f"{max_consecutive} consecutive year(s) of {dominant}"
        + (f" (est. yield drag -{yield_drag_pct}%)" if yield_drag_pct > 0 else "")
        + f". Risk score {risk_score}/100."
    )

    return MonocultureAnalysis(
        grade=_score_to_grade(composite), risk_level=_score_to_risk(composite), summary=summary,
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
    "drought": lambda p, w, s: _analyze_drought(p, w, s),
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
            f"{cat.replace('_', ' ').title()}: {results[cat]['summary'][:120]}"
            for cat in CATEGORY_MODELS
        ),
        "weather": results["weather"],
        "soil_health": results["soil_health"],
        "pest_forecast": results["pest"],
        "drought_resistance": results["drought"],
        "monoculture_risk": results["monoculture"],
    })
