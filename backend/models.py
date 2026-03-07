"""
Oh Deere! — Pydantic models for structured AI yield analysis output.

Defines the 5 analysis categories (weather, soil health, pest, drought, monoculture)
and the composite YieldAnalysis model used for Claude structured output.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum


class Grade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


class RiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


# ---------------------------------------------------------------------------
# Weather Forecasting
# ---------------------------------------------------------------------------

class WeatherEvent(BaseModel):
    date: str
    event_type: str  # e.g. "frost", "hail", "heavy_rain", "heat_wave", "strong_wind"
    severity: RiskLevel
    description: str


class CropWeatherImpact(BaseModel):
    crop: str
    impact_description: str
    estimated_yield_impact_pct: float  # negative = loss
    mitigation_action: str


class WeatherAnalysis(BaseModel):
    grade: Grade
    risk_level: RiskLevel
    summary: str
    upcoming_events: List[WeatherEvent]
    crop_impacts: List[CropWeatherImpact]
    mitigation_recommendations: List[str]


# ---------------------------------------------------------------------------
# Soil Health
# ---------------------------------------------------------------------------

class NutrientLevel(BaseModel):
    nutrient: str  # "nitrogen", "phosphorus", "potassium", "organic_carbon", etc.
    current_level: str  # "deficient", "low", "adequate", "high", "excessive"
    value: Optional[float] = None
    unit: Optional[str] = None
    recommendation: str


class SoilHealthAnalysis(BaseModel):
    grade: Grade
    risk_level: RiskLevel
    summary: str
    ph_assessment: str
    nutrient_levels: List[NutrientLevel]
    organic_matter_trend: str  # "declining", "stable", "improving"
    fertilizer_impact_assessment: str
    recommendations: List[str]


# ---------------------------------------------------------------------------
# Pest Forecasting
# ---------------------------------------------------------------------------

class PestThreat(BaseModel):
    pest_name: str
    threat_type: str  # "insect", "fungal", "bacterial", "viral", "nematode"
    risk_level: RiskLevel
    affected_crops: List[str]
    source_direction: str  # "regional", "adjacent_county", "statewide", "national"
    description: str


class LowImpactCropSuggestion(BaseModel):
    crop: str
    pest_resistance_score: int  # 0-100, higher = more resistant
    rationale: str


class PestAnalysis(BaseModel):
    grade: Grade
    risk_level: RiskLevel
    summary: str
    active_threats: List[PestThreat]
    regional_spread_risks: List[PestThreat]
    low_impact_crop_suggestions: List[LowImpactCropSuggestion]
    preventive_recommendations: List[str]


# ---------------------------------------------------------------------------
# Drought Resistance
# ---------------------------------------------------------------------------

class DroughtCropSuggestion(BaseModel):
    crop: str
    drought_tolerance_score: int  # 0-100
    water_requirement: str  # "low", "moderate", "high"
    expected_yield_under_drought: str
    rationale: str


class DroughtAnalysis(BaseModel):
    grade: Grade
    risk_level: RiskLevel
    summary: str
    current_drought_status: str  # "none", "abnormally_dry", "moderate", "severe", "extreme", "exceptional"
    drought_outlook_30_day: str
    drought_outlook_90_day: str
    soil_moisture_assessment: str
    resistant_crop_suggestions: List[DroughtCropSuggestion]
    water_conservation_recommendations: List[str]


# ---------------------------------------------------------------------------
# Monoculture Risk
# ---------------------------------------------------------------------------

class RegionalCropData(BaseModel):
    region: str  # county/state name
    primary_crop: str
    crop_percentage: float
    acreage: Optional[float] = None


class DiversificationSuggestion(BaseModel):
    crop: str
    benefit: str
    rotation_fit: str  # "excellent", "good", "fair"
    estimated_yield_benefit_pct: float
    rationale: str


class MonocultureAnalysis(BaseModel):
    grade: Grade
    risk_level: RiskLevel
    summary: str
    risk_score: int  # 0-100, higher = more risky
    consecutive_same_crop_years: int
    farmer_crop_history: List[str]
    regional_crop_data: List[RegionalCropData]
    diversification_suggestions: List[DiversificationSuggestion]
    recommendations: List[str]


# ---------------------------------------------------------------------------
# Full Yield Analysis (composite)
# ---------------------------------------------------------------------------

class YieldAnalysis(BaseModel):
    overall_grade: Grade
    overall_yield_score: int  # 0-100
    summary: str
    weather: WeatherAnalysis
    soil_health: SoilHealthAnalysis
    pest_forecast: PestAnalysis
    drought_resistance: DroughtAnalysis
    monoculture_risk: MonocultureAnalysis


# ---------------------------------------------------------------------------
# Onboarding / Farm Profile
# ---------------------------------------------------------------------------

class FertilizerType(BaseModel):
    name: str
    npk_ratio: str  # e.g. "46-0-0"
    category: str  # "nitrogen", "phosphorus", "potassium", "balanced", "organic", "amendment"
    nutrients: str


class CropZone(BaseModel):
    zone_name: str
    crops_by_year: Dict[str, str]  # { "2023": "Corn", "2024": "Soybean", "2025": "Wheat" }


class FarmProfile(BaseModel):
    field_id: int
    crop_zones: List[CropZone]
    fertilizers_used: List[str]
    lat: float
    lon: float
