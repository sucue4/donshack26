import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEE_PROJECT_ID = os.getenv("GEE_PROJECT_ID", "")

OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_HISTORICAL = "https://archive-api.open-meteo.com/v1/archive"
SOILGRIDS_ENDPOINT = "https://rest.isric.org/soilgrids/v2.0/properties/query"
