"""
Oh Deere! — AI-powered yield analysis orchestrator.

Collects data from Open-Meteo and SoilGrids, combines it with the farmer's
crop history and fertilizer data, then sends everything to Claude for
structured JSON analysis matching the Pydantic models in models.py.

Uses Anthropic tool_use to guarantee JSON output matches the Pydantic schemas.
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

MODEL_NAME = "claude-3-5-sonnet-20241022"

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
Your job is to analyze all provided data and produce a structured yield-rate analysis
by calling the provided tool with the analysis result.

You will be given:
- Farm profile: crop zones with historical crop choices by year, fertilizers used, GPS coordinates.
- Weather data: 7-day forecast and recent conditions from Open-Meteo.
- Soil data: SoilGrids profiles (clay, sand, silt, pH, organic carbon, nitrogen, CEC, bulk density) at multiple depths.

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

IMPORTANT:
- Use realistic data-driven assessments. If data is limited, state assumptions clearly in summary fields.
- All list fields MUST contain at least one item.
- You MUST call the provided tool with your analysis. Do NOT return plain text.
"""


def _build_tool_schema(model_cls) -> dict:
    """Generate an Anthropic tool definition from a Pydantic model."""
    schema = model_cls.model_json_schema()
    # Anthropic tools don't support $defs at the top level; inline them.
    schema = _resolve_refs(schema, schema.get("$defs", {}))
    schema.pop("$defs", None)
    schema.pop("title", None)
    return schema


def _resolve_refs(obj, defs):
    """Recursively resolve $ref pointers against the $defs dict."""
    if isinstance(obj, dict):
        if "$ref" in obj:
            ref_name = obj["$ref"].rsplit("/", 1)[-1]
            resolved = defs.get(ref_name, {})
            resolved = _resolve_refs(resolved, defs)
            merged = {k: v for k, v in resolved.items() if k != "title"}
            return merged
        return {k: _resolve_refs(v, defs) for k, v in obj.items() if k != "title"}
    if isinstance(obj, list):
        return [_resolve_refs(item, defs) for item in obj]
    return obj


def _build_user_prompt(
    farm_profile: FarmProfile,
    weather_data: dict | None,
    soil_data: dict | None,
    category: str | None = None,
) -> str:
    """Build the user message with all available data."""
    parts = ["## Farm Profile"]
    parts.append(f"- Location: lat={farm_profile.lat}, lon={farm_profile.lon}")
    ferts = ", ".join(farm_profile.fertilizers_used) if farm_profile.fertilizers_used else "None reported"
    parts.append(f"- Fertilizers used: {ferts}")
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
        parts.append(f"\nAnalyze the **{category}** category and call the tool with the result.")
    else:
        parts.append("\nPerform the FULL yield analysis across all 5 categories and call the tool with the result.")

    return "\n".join(parts)


def _get_client() -> anthropic.Anthropic:
    """Return an Anthropic client, raising if the key is not configured."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. "
            "Add it to your .env file to enable AI-powered yield analysis."
        )
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _extract_tool_input(response) -> dict:
    """Extract the tool call input from Claude's response."""
    for block in response.content:
        if block.type == "tool_use":
            return block.input
    raise ValueError(
        "Claude did not return a tool call. "
        f"Response: {[b.type for b in response.content]}"
    )


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
    tool_schema = _build_tool_schema(YieldAnalysis)

    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        tools=[{
            "name": "yield_analysis",
            "description": "Submit the complete yield analysis with all 5 categories.",
            "input_schema": tool_schema,
        }],
        tool_choice={"type": "tool", "name": "yield_analysis"},
    )

    parsed = _extract_tool_input(response)
    logger.info("Claude full analysis tool call received, keys: %s", list(parsed.keys()))
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
    tool_schema = _build_tool_schema(model_cls)
    tool_name = f"{category}_analysis"

    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        tools=[{
            "name": tool_name,
            "description": f"Submit the {category} analysis result.",
            "input_schema": tool_schema,
        }],
        tool_choice={"type": "tool", "name": tool_name},
    )

    parsed = _extract_tool_input(response)
    logger.info("Claude %s analysis tool call received", category)
    validated = model_cls.model_validate(parsed)
    return validated.model_dump()
