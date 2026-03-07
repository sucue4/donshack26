"""Claude AI advisor service — requires ANTHROPIC_API_KEY."""

import os
from config import ANTHROPIC_API_KEY

SYSTEM_PROMPT = """You are an expert agronomist AI assistant for a precision agriculture platform called "Oh Deere!". Your role is to analyze satellite imagery (NDVI, NDRE, NDMI), weather data, soil properties, and crop status to provide actionable farming recommendations.

Guidelines:
- Provide specific, data-driven advice based on the information provided
- Always include uncertainty caveats when appropriate
- Recommend consulting local extension services for critical decisions (pesticide rates, seed treatments)
- Reference specific thresholds, growth stages, and timing windows
- Use plain English accessible to non-technical farmers
- Structure responses with clear headers, bullet points, and action items
- Never recommend banned substances or exceed maximum labeled rates
- When data is insufficient, say so and recommend additional scouting or testing
- Consider the complete picture: satellite + weather + soil + crop stage

You serve farmers who operate small-to-medium scale farms (under 1000 acres) in the U.S. Midwest. Your advice should be practical, timely, and grounded in current best practices from university extension services."""


async def get_advice(message: str, history: list = None) -> str:
    """Send a query to Claude and return agronomic advice."""
    if not ANTHROPIC_API_KEY:
        return (
            "⚠️ **AI Advisor Offline**\n\n"
            "The ANTHROPIC_API_KEY environment variable is not set. "
            "To enable AI-powered recommendations:\n\n"
            "1. Get an API key from https://console.anthropic.com\n"
            "2. Add `ANTHROPIC_API_KEY=sk-ant-...` to your `.env` file\n"
            "3. Restart the backend server\n\n"
            "The rest of the platform (weather, soil, satellite data) "
            "works without the AI layer."
        )

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        messages = []
        if history:
            for msg in history:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                })
        messages.append({"role": "user", "content": message})

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

        return response.content[0].text

    except ImportError:
        return "⚠️ The `anthropic` package is not installed. Run: `pip install anthropic`"
    except Exception as e:
        return f"⚠️ AI Advisor error: {e}"
