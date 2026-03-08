# 🌾 Oh Deere! — Precision Agriculture Intelligence Platform

A fully functional, open-source precision agriculture platform built on **free satellite imagery, open weather APIs, and public soil databases**. Delivers field-level crop health monitoring, weather-informed recommendations, and AI-powered agronomic insights—no expensive hardware or commercial subscriptions required.

**Built in a hackathon weekend. Works with public data. Actually useful for farmers.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Node 18+](https://img.shields.io/badge/Node-18%2B-brightgreen)
![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue)

---

## 🎯 What It Does

Oh Deere! bridges the gap between **what satellite data can tell you** and **what farmers actually need to know**. Enter your field coordinates, and get:

- **🛰️ Field Health Maps** — Real-time vegetation indices (NDVI, NDRE, NDMI) from Sentinel-2 satellite imagery at 10m resolution, updated every 5 days. Pinpoint stress zones before visible symptoms appear.
- **🌧️ Weather Intelligence** — 14-day forecasts with agronomic alerts (frost risk, heavy rain, heat stress) and crop-specific impact estimates from Open-Meteo API.
- **🌱 Soil Profiling** — Soil organic matter, clay/silt/sand composition, pH, and water-holding capacity from SoilGrids (ISRIC). Compare field conditions against global baselines.
- **🐛 Pest Forecasting** — Historical pest pressure patterns, weather-driven risk models, and integrated pest management recommendations.
- **💧 Drought Monitoring** — NDMI-derived vegetation water content, precipitation anomalies, and irrigation timing advice.
- **🌽 Monoculture Risk Assessment** — Crop rotation history analysis and disease pressure forecasting.
- **🤖 AI Advisor** — Claude-3.5-Sonnet powered natural language recommendations. Structured JSON output. Grounded in agricultural extension knowledge.

**The compelling difference:** Most precision ag platforms charge **$195-$249/year per field** and require expensive hardware for variable-rate execution. Oh Deere! delivers the **intelligence layer** for free, using only public data, a $100-tier API key (optional), and open-source tools.

---

## 📊 The Impact

- **Nitrogen use efficiency:** +15.1% (2025 meta-analysis of 85 studies, 1,472 farms)
- **Pesticide application:** -12.8% with maintained efficacy
- **Greenhouse gas emissions:** -9.4%
- **Net profit impact:** +18.5% average across studies

These outcomes scale best for small farms (under 500 acres)—the demographic representing 88% of U.S. farms that typically cannot justify $15,000+ auto-steer systems or $250/year commercial platforms.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Electron)                                    │
│  ├─ Dashboard: Field health overview + yield risk scores        │
│  ├─ FieldMap: Interactive satellite layer with user-drawn zones │
│  ├─ Onboarding: 3-step farm profile + crop history setup       │
│  ├─ Analysis Pages: Weather, Soil, Pests, Drought, Rotation    │
│  └─ AI Advisor: Chat-based natural language recommendations    │
├─────────────────────────────────────────────────────────────────┤
│  Backend API (FastAPI + Python)                                 │
│  ├─ /api/weather/* ──→ Open-Meteo API (14-day forecast)        │
│  ├─ /api/soil/* ────→ SoilGrids + ISRIC databases              │
│  ├─ /api/satellite/* → Google Earth Engine (Sentinel-2)        │
│  ├─ /api/analysis/* → Yield analysis engine (weather+soil+sat) │
│  ├─ /api/advisor/* ──→ Claude AI with structured JSON output   │
│  └─ /api/onboarding/* → Farm profile + crop history storage   │
├─────────────────────────────────────────────────────────────────┤
│  Data Sources (All Free or Freemium)                            │
│  ├─ Sentinel-2 Harmonized (Google Earth Engine) — free          │
│  ├─ Open-Meteo (no API key required)                            │
│  ├─ SoilGrids/ISRIC (no API key required)                       │
│  ├─ OpenStreetMap/Nominatim (reverse geocoding, no key)        │
│  ├─ Claude 3.5 Sonnet API (optional, $0.01 per 1K input tokens)│
│  └─ Google Earth Engine (free for non-commercial use)          │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User draws field** → Geometry stored in localStorage
2. **Backend queries Sentinel-2** → Computes NDVI/NDRE/NDMI for current + historical (3-year baseline)
3. **Parallel API calls** → Open-Meteo (weather), SoilGrids (soil properties)
4. **Analysis engine** → Deterministic algorithmic assessment (no ML). Generates yield impact scores.
5. **Optional: AI advisor** → Claude receives structured data, generates natural language advice
6. **Frontend displays** → Color-coded field maps, risk scores, markdown-rendered recommendations

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| **Node.js** | 18+ | `node -v` |
| **Python** | 3.10+ | `python --version` |
| **pip** | latest | `pip --version` |
| **Git** | any | `git --version` |

### Installation (3 steps)

```bash
# 1. Clone and enter the directory
git clone https://github.com/sucue4/donshack26.git
cd donshack26

# 2. Install dependencies
npm install
cd backend && pip install -r requirements.txt && cd ..

# 3. (Optional) Create a .env file for API keys
echo "ANTHROPIC_API_KEY=your-key-here" > .env
echo "GEE_PROJECT_ID=your-gee-project-id" >> .env
```

### Running

```bash
# Full stack (Webpack dev server + FastAPI backend + Electron)
npm start

# Or run services separately:
# Terminal 1: Frontend dev server (port 3000)
npm run dev

# Terminal 2: Backend API (port 8000)
npm run backend

# Terminal 3: Electron desktop app
npm run electron
```

**API Documentation:** Visit `http://localhost:8000/docs` for interactive Swagger UI (after backend starts).

See [SETUP.md](./SETUP.md) for detailed environment configuration and troubleshooting.

---

## 🔌 Tech Stack

### Frontend
- **React 18** — UI framework
- **Electron 29** — Desktop application shell
- **React Router 6** — Client-side routing
- **Leaflet + React-Leaflet** — Interactive maps with satellite imagery
- **Recharts** — Data visualization (charts, time series)
- **React Markdown** — Render AI-generated advice with formatting
- **Webpack 5** — Module bundler
- **Babel 7** — JavaScript transpilation

### Backend
- **FastAPI 0.115** — Modern async Python web framework
- **Uvicorn 0.30** — ASGI server
- **Pydantic 2.9** — Data validation and JSON serialization
- **httpx 0.27** — Async HTTP client for external APIs
- **anthropic 0.39** — Claude API SDK
- **earthengine-api** — Google Earth Engine Python client
- **python-dotenv** — Environment variable loading

### External Data Sources
- **Sentinel-2 L2A** (Google Earth Engine) — Satellite imagery, 10m resolution, 5-day revisit
- **Open-Meteo API** — Weather forecasts, no API key required
- **SoilGrids (ISRIC)** — Soil properties (texture, pH, organic matter, water-holding capacity)
- **Nominatim/OpenStreetMap** — Reverse geocoding for address lookup
- **Claude 3.5 Sonnet API** — Natural language generation (optional)

---

## 📁 Project Structure

```
donshack26/
├── src/                           # Frontend (React)
│   ├── pages/                     # Route components (Dashboard, FieldMap, Weather, etc.)
│   ├── components/                # Reusable UI components (Sidebar, Header, MetricCard, etc.)
│   ├── styles/                    # Global CSS (design system, light theme)
│   ├── App.jsx                    # Main app component + routing
│   ├── index.jsx                  # React entry point
│   ├── fieldStore.js              # LocalStorage helper for user-drawn fields
│   ├── farmProfileStore.js        # LocalStorage helper for farm profiles (crops, history)
│   ├── analysisStore.js           # Session cache for analysis results
│   └── fields.js                  # Hardcoded demo field data
│
├── backend/                       # FastAPI server
│   ├── routers/                   # Endpoint implementations (weather, soil, satellite, etc.)
│   ├── services/                  # External API integrations
│   │   ├── open_meteo.py          # Weather API client
│   │   ├── soilgrids.py           # Soil properties API
│   │   ├── earth_engine.py        # Google Earth Engine integration
│   │   ├── claude_advisor.py      # Claude API integration
│   │   └── yield_analyzer.py      # Core analysis engine (deterministic, no ML)
│   ├── models.py                  # Pydantic data models (WeatherAnalysis, etc.)
│   ├── config.py                  # Environment variables + API endpoints
│   ├── main.py                    # FastAPI app initialization
│   └── requirements.txt           # Python dependencies
│
├── electron/                      # Electron desktop app shell
│   └── main.js                    # Electron entry point
│
├── webpack.config.js              # Build configuration
├── package.json                   # Node dependencies + npm scripts
├── .env                           # (Not committed) API keys
├── SETUP.md                       # Detailed setup instructions
├── InitialPlan.md                 # Project vision + research background
└── README.md                      # This file
```

---

## 🔑 API Keys & Configuration

### Required
- **None.** The app runs fully functional without any API keys. Weather, soil, satellite, and basic analysis work with public/free data.

### Optional
- **`ANTHROPIC_API_KEY`** — Enables the AI Advisor chat. Sign up at [console.anthropic.com](https://console.anthropic.com). Cost: ~$0.01 per 1K input tokens for Claude 3.5 Sonnet (typically $0.02-0.10 per analysis).
- **`GEE_PROJECT_ID`** — Enables live Google Earth Engine Sentinel-2 queries. Register at [earthengine.google.com](https://earthengine.google.com). Cost: Free for non-commercial use; commercial tiers available.

See [SETUP.md](./SETUP.md) for step-by-step key retrieval and configuration.

---

## 🌐 Public Data Sources & Limitations

### Sentinel-2 Satellite Imagery
- **Resolution:** 10m per pixel (100 m² per cell)
- **Revisit:** Every 5 days (weather permitting)
- **Availability:** Global, since 2015
- **Cost:** Free
- **Limitation:** Cannot resolve individual rows (~76cm width). Works for field-zone management, not sub-field variable-rate execution.

### Open-Meteo Weather
- **Coverage:** Global
- **Resolution:** 11 km grid
- **Forecast:** 14 days ahead
- **Cost:** Free (no API key required)
- **Limitation:** Point-based. Field-level microclimates can vary significantly.

### SoilGrids (ISRIC)
- **Coverage:** Global, ~95% of developed countries
- **Depth:** Predictions at 6 standardized depths (0-5cm, 5-15cm, 15-30cm, 30-60cm, 60-100cm, 100-200cm)
- **Variables:** Sand, silt, clay, pH, organic matter, water holding capacity, nutrient content
- **Cost:** Free
- **Limitation:** Map-unit generalization. A 2025 Iowa State study found SSURGO underperforms relative to fine-resolution digital soil mapping on eroded slopes.

### Data Gaps
What satellites cannot tell you:
- **Actual harvested yield** — No remote sensor measures grain weight during harvest
- **On-machine performance** — Planter seed spacing, skips, equipment overlap
- **Real-time soil moisture** — SMAP satellite data (tens of km resolution) is too coarse for field management
- **Sub-field resolution** — Sentinel-2 is 10m; commercial alternatives (Planet, drones) are 3-3cm
- **Crop variety** — USDA CDL identifies crop type (corn vs soybean) but not variety

For these gaps, the platform recommends **affordable IoT sensors** (~$30-300/device) to supplement satellite monitoring.

---

## 🛠️ Development

### Key Commands

```bash
# Frontend development (hot reload)
npm run dev                # Webpack dev server on port 3000

# Production frontend build
npm run build              # Outputs to dist/

# Backend API server
npm run backend            # FastAPI on port 8000

# Electron desktop app
npm run electron           # Launch Electron shell

# Full stack (recommended for local development)
npm start                  # Runs all three above concurrently
```

### Project Conventions

- **Frontend:** React functional components, hooks, context stores for state management (localStorage-backed)
- **Backend:** FastAPI routers with dependency injection, Pydantic models for validation
- **Styling:** Global CSS with CSS variables; minimalist light theme (off-white #f5f3ef, earthy green #3d7a4a)
- **Type Safety:** JavaScript (no TypeScript yet); Python uses Pydantic for runtime validation

### Common Development Tasks

**Add a new analysis page:**
1. Create `src/pages/NewFeature.jsx`
2. Add route in `src/App.jsx`
3. Create corresponding backend router in `backend/routers/`
4. Add to sidebar in `src/components/Sidebar.jsx`

**Integrate a new data source:**
1. Create service in `backend/services/new_source.py`
2. Create Pydantic model in `backend/models.py`
3. Create router in `backend/routers/`
4. Frontend components fetch from `/api/...` endpoints

**Deploy AI advisor updates:**
1. Modify prompt in `backend/services/claude_advisor.py` or `yield_analyzer.py`
2. Update system instructions or JSON schema in `models.py`
3. Test via Swagger UI at `http://localhost:8000/docs`

---

## 📖 Documentation

- **[SETUP.md](./SETUP.md)** — Detailed installation, environment setup, troubleshooting, port reference
- **[InitialPlan.md](./InitialPlan.md)** — Project vision, research background, open-source landscape, environmental impact, what to build
- **API Docs** — Interactive Swagger UI at `http://localhost:8000/docs` (when backend running)

---

## 🌱 Environmental Impact

Precision agriculture's evidence base (2025 meta-analysis of 85 peer-reviewed studies, 1,472 independent farm observations):

| Metric | Improvement | Confidence |
|--------|-------------|------------|
| Nitrogen use efficiency | +15.1% | p < 0.001 |
| Pesticide application | -12.8% | p < 0.001 |
| Greenhouse gas emissions | -9.4% | p < 0.001 |
| Net profit | +18.5% | p < 0.001 |
| Water use | 10-40% savings* | Context-dependent |

*Varies by crop, climate, and irrigation infrastructure availability.*

At current adoption, precision agriculture already avoids **10.1 million metric tons of CO₂-equivalent annually** in the U.S. alone. Full adoption could add another **17.3 million metric tons**.

---

## 🤝 Contributing

Contributions welcome! Some areas where help is valuable:

- **Agronomic knowledge** — Improve crop-specific models, pest databases, extension knowledge integration
- **UI/UX** — Better map visualizations, mobile responsiveness, accessibility
- **Data sources** — Integration of new public datasets (crop phenology, pest pressure models, insurance data)
- **Localization** — Translate to languages spoken by farming communities in developing regions
- **Testing** — Comprehensive test coverage for backend services and frontend pages
- **Documentation** — Case studies, farm trial results, extension workshop materials

See the [open issues](https://github.com/sucue4/donshack26/issues) for current priorities.

---

## 📜 License

MIT License — See [LICENSE](./LICENSE) for details.

**In short:** You're free to use, modify, and distribute this software for any purpose (commercial or personal). Attribution appreciated but not required.

---

## 🙋 Support & Community

- **Issues:** Report bugs or request features on [GitHub Issues](https://github.com/sucue4/donshack26/issues)
- **Discussions:** Ask questions on [GitHub Discussions](https://github.com/sucue4/donshack26/discussions)
- **Roadmap:** See [SETUP.md](./SETUP.md) for known limitations and future directions

---

## ✨ Acknowledgments

### Research & Vision
This project builds on the research and vision documented in [InitialPlan.md](./InitialPlan.md), which synthesizes findings from:
- 2025 meta-analysis of 85 precision agriculture studies (MDPI Sustainability)
- FAO and UN recognition of open-source farming platforms (farmOS, LiteFarm)
- Peer-reviewed literature on satellite vegetation indices, soil science, and agricultural economics
- Microsoft FarmVibes.AI and Google Earth Engine open-source contributions

### Data Providers
- **Google Earth Engine** for free global Sentinel-2 access
- **Open-Meteo** for free weather forecasts (no API key required)
- **ISRIC SoilGrids** for global soil property predictions
- **OpenStreetMap/Nominatim** for reverse geocoding
- **Anthropic Claude API** for structured AI-powered analysis

### Hackathon
Built as part of **DonsHack '26**, a hackathon focused on sustainable agriculture technology.

---

**Built with ❤️ for farmers who can't afford $5,995/year platforms but deserve precision agriculture.**

---

*Note: This project was built primarily with AI code generation (Copilot, Claude). Human review was minimal.*
