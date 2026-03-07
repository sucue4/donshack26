# Oh Deere! — Dev Team Service Reference

API keys have been distributed. Here's what you're working with.

---

## Google Earth Engine
**What it does:** Primary data layer. Handles Sentinel-2 satellite imagery, USDA Cropland Data Layer, and OpenLandMap soil data — all in one place.

**Packages:** `earthengine-api`, `geemap`

**Auth:** `ee.Authenticate()` then `ee.Initialize(project='<project-id>')`

**Key collection:** `COPERNICUS/S2_SR_HARMONIZED` for Sentinel-2 imagery

---

## Open-Meteo
**What it does:** Weather — historical + 7-day forecast + evapotranspiration. No key needed, fully open.

**Endpoints:**
- Forecast: `https://api.open-meteo.com/v1/forecast`
- Historical: `https://archive-api.open-meteo.com/v1/archive`

**Variables to request:** `temperature_2m`, `precipitation_sum`, `et0_fao_evapotranspiration`, `soil_moisture_0_to_7cm`

**Package:** Just `requests`

---

## SoilGrids (ISRIC)
**What it does:** Supplemental soil data if we need more detail than GEE's OpenLandMap layers. No key needed.

**Endpoint:** `https://rest.isric.org/soilgrids/v2.0/properties/query`

**Returns:** Soil texture, pH, organic carbon, nitrogen content — by depth

**Package:** Just `requests`

---

## Anthropic API (Claude)
**What it does:** The LLM advisor layer. Takes structured JSON from the satellite/weather/soil pipeline, generates natural-language farmer recommendations.

**Package:** `anthropic`

**Auth:** Set env var `ANTHROPIC_API_KEY`

**Usage:** System prompt constrains Claude to act as an agronomist. Feed it the structured field assessment, get back plain-English advice.

---

## Frontend: Streamlit + Folium
**What it does:** Interactive web app with map-based UI. Fastest path to a demoable product.

**Packages:** `streamlit`, `streamlit-folium`, `folium`

**Deploy:** Streamlit Community Cloud, connected to our GitHub repo — gives us a live URL for the demo.

---

## One-liner install

```bash
pip install earthengine-api geemap anthropic streamlit streamlit-folium folium requests numpy
```
