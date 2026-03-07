"""
Oh Deere! — AI-powered yield analysis orchestrator.

Collects data from Open-Meteo and SoilGrids, combines it with the farmer's
crop history and fertilizer data, then sends everything to Claude for
structured JSON analysis matching the Pydantic models in models.py.
"""

import json
import logging

import anthropic
from config import ANTHROPIC_API_KEY
from models import (
    FarmProfile,
    YieldAnalysis,
    WeatherAnalysis,
    SoilHealthAnalysis,
    PestAnalysis,
    DroughtAnalysis,
    MonocultureAnalysis,
)

logger = logging.getLogger("ohdeere.services.yield_analyzer")

CATEGORY_MODELS = {
    "weather": WeatherAnalysis,
    "soil_health": SoilHealthAnalysis,
    "pest": PestAnalysis,
    "drought": DroughtAnalysis,
    "monoculture": MonocultureAnalysis,
}

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an expert agronomist AI for the "Oh Deere!" precision agriculture platform.
Your job is to analyze all provided data and produce a structured JSON yield-rate analysis.

You will be given:
- Farm profile: crop zones with historical crop choices by year, fertilizers used, GPS coordinates.
- Weather data: 7-day forecast and recent conditions from Open-Meteo.
- Soil data: SoilGrids profiles (clay, sand, silt, pH, organic carbon, nitrogen, CEC, bulk density) at multiple depths.

You MUST respond with **valid JSON only** — no markdown, no commentary, no code fences.

The 5 analysis categories are:

1. **Weather Forecasting** (key: "weather")
   - Grade the weather outlook (A-F) and assign a risk level (low/moderate/high/critical).
   - Identify upcoming severe weather events with dates.
   - Assess crop-specific yield impacts (percent, negative = loss).
   - Provide mitigation recommendations.

2. **Soil Health** (key: "soil_health")
   - Grade overall soil health and assign a risk level.
   - Assess pH, nutrient levels (nitrogen, phosphorus, potassium, organic carbon, etc.),
     organic matter trend, and the impact of the farmer's fertilizer choices.
   - Provide actionable recommendations.

3. **Pest Forecasting** (key: "pest_forecast")
   - Grade pest risk and assign a risk level.
   - List active threats and regional spread risks with threat type, affected crops, and severity.
   - Suggest low-impact crop alternatives with pest resistance scores (0-100).
   - Provide preventive recommendations.

4. **Drought Resistance** (key: "drought_resistance")
   - Grade drought risk and assign a risk level.
   - Assess current drought status and 30/90-day outlook.
   - Evaluate soil moisture based on weather and soil data.
   - Suggest drought-resistant crops with tolerance scores (0-100) and water requirements.
   - Provide water conservation recommendations.

5. **Monoculture Risk** (key: "monoculture_risk")
   - Grade monoculture risk and assign a risk level.
   - Compute a risk score (0-100, higher = riskier) and consecutive same-crop years.
   - List the farmer's crop history and regional crop data.
   - Suggest diversification options with rotation fit and estimated yield benefit.
   - Provide recommendations.

When returning the FULL analysis, also include top-level fields:
- "overall_grade": best summary grade (A-F)
- "overall_yield_score": 0-100 composite score
- "summary": a 2-3 sentence executive summary

Grade meanings (use these for all categories):
  A = Excellent conditions, yield well above average expected
  B = Good conditions, yield above average expected
  C = Fair conditions, average yield expected
  D = Poor conditions, below-average yield expected
  F = Critical conditions, significant yield loss expected

Risk level meanings:
  low = No immediate concern
  moderate = Monitor closely
  high = Action recommended soon
  critical = Immediate action required

IMPORTANT: Use realistic data-driven assessments. If data is limited, state assumptions clearly in the summary fields.
All list fields must contain at least one item.
"""


def _build_user_prompt(
    farm_profile: FarmProfile,
    weather_data: dict | None,
    soil_data: dict | None,
    category: str | None = None,
) -> str:
    """Build the user message with all available data."""
    parts = ["## Farm Profile"]
    parts.append(f"- Location: lat={farm_profile.lat}, lon={farm_profile.lon}")
    parts.append(f"- Fertilizers used: {', '.join(farm_profile.fertilizers_used) or 'None reported'}")
    parts.append("- Crop zones:")
    for zone in farm_profile.crop_zones:
        years = ", ".join(f"{y}: {c}" for y, c in sorted(zone.crops_by_year.items()))
        parts.append(f"  - {zone.zone_name}: {years}")

    if weather_data:
        parts.append("\n## Weather Data (Open-Meteo)")
        parts.append(json.dumps(weather_data, indent=2, default=str))
    else:
        parts.append("\n## Weather Data\nNo weather data available — use general knowledge for the location.")

    if soil_data:
        parts.append("\n## Soil Data (SoilGrids)")
        parts.append(json.dumps(soil_data, indent=2, default=str))
    else:
        parts.append("\n## Soil Data\nNo soil data available — use general knowledge for the location.")

    if category:
        parts.append(f"\nReturn ONLY the JSON for the **{category}** analysis category.")
    else:
        parts.append("\nReturn the FULL yield analysis JSON with all 5 categories.")

    return "\n".join(parts)


def _get_client() -> anthropic.Anthropic:
    """Return an Anthropic client, raising if the key is not configured."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. "
            "Add it to your .env file to enable AI-powered yield analysis."
        )
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from Claude's response, stripping any markdown fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (possibly ```json)
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
    if cleaned.endswith("```"):
        cleaned = cleaned[: -3]
    return json.loads(cleaned.strip())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def analyze_yield(
    farm_profile: FarmProfile,
    weather_data: dict = None,
    soil_data: dict = None,
) -> YieldAnalysis:
    """Run the full 5-category yield analysis via Claude and return structured output."""
    client = _get_client()
    user_prompt = _build_user_prompt(farm_profile, weather_data, soil_data)

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text = response.content[0].text
    logger.info("Claude full analysis response length: %d chars", len(raw_text))

    parsed = _parse_json_response(raw_text)
    return YieldAnalysis.model_validate(parsed)


async def analyze_category(
    category: str,
    farm_profile: FarmProfile,
    weather_data: dict = None,
    soil_data: dict = None,
) -> dict:
    """Run a single-category yield analysis via Claude and return the validated dict."""
    if category not in CATEGORY_MODELS:
        raise ValueError(f"Unknown category '{category}'. Must be one of: {list(CATEGORY_MODELS.keys())}")

    model_cls = CATEGORY_MODELS[category]
    client = _get_client()
    user_prompt = _build_user_prompt(farm_profile, weather_data, soil_data, category=category)

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text = response.content[0].text
    logger.info("Claude %s analysis response length: %d chars", category, len(raw_text))

    parsed = _parse_json_response(raw_text)
    validated = model_cls.model_validate(parsed)
    return validated.model_dump()
