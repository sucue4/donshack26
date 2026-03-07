# Oh Deere! — Quick Setup Guide

Get the project running on your local machine in a few minutes.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| **Node.js** | 18+ | `node -v` |
| **npm** | 9+ | `npm -v` |
| **Python** | 3.10+ | `python --version` |
| **pip** | latest | `pip --version` |
| **Git** | any | `git --version` |

---

## 1 — Clone the Repo

```bash
git clone https://github.com/sucue4/donshack26.git
cd donshack26
```

---

## 2 — Install Dependencies

### Node (frontend + Electron)

```bash
npm install
```

### Python (backend)

```bash
cd backend
pip install -r requirements.txt
cd ..
```

> **Tip:** Use a virtual environment to keep things clean:
>
> ```bash
> python -m venv venv
> source venv/bin/activate   # macOS / Linux
> venv\Scripts\activate      # Windows
> pip install -r backend/requirements.txt
> ```

---

## 3 — Environment Variables

Create a **`.env`** file in the **project root** (next to `package.json`):

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
GEE_PROJECT_ID=your-gee-project-id
```

### How to get each key

| Variable | Required? | Where to get it |
|----------|-----------|-----------------|
| `ANTHROPIC_API_KEY` | Optional — needed for the AI Advisor | Sign up at <https://console.anthropic.com>, create an API key |
| `GEE_PROJECT_ID` | Optional — needed for live satellite imagery | Register at <https://earthengine.google.com>, create a Cloud project, then run `ee.Authenticate()` once |

> **Note:** The app still works without these keys. Weather, soil data, crop planning, and the full UI run without any API keys. The AI Advisor will show a setup prompt, and satellite endpoints will return demo data.

---

## 4 — Run the Project

### Option A — Full stack (recommended)

Starts the Webpack dev server, Electron desktop app, and Python backend all at once:

```bash
npm start
```

### Option B — Run services individually

Open three terminals:

```bash
# Terminal 1 — Frontend dev server (port 3000)
npm run dev

# Terminal 2 — Python backend API (port 8000)
npm run backend

# Terminal 3 — Electron desktop app
npm run electron
```

### Option C — Backend only

```bash
cd backend
python main.py
```

The API will be available at `http://localhost:8000`. Visit `http://localhost:8000/docs` for the interactive Swagger UI.

---

## Port Reference

| Service | Port | URL |
|---------|------|-----|
| Webpack Dev Server (React) | 3000 | <http://localhost:3000> |
| FastAPI Backend | 8000 | <http://localhost:8000> |
| API Docs (Swagger) | 8000 | <http://localhost:8000/docs> |

The Webpack dev server proxies `/api/*` requests to the backend on port 8000 automatically.

---

## npm Scripts Reference

| Command | What it does |
|---------|--------------|
| `npm start` | Runs frontend + Electron concurrently |
| `npm run dev` | Webpack dev server only |
| `npm run build` | Production build to `dist/` |
| `npm run electron` | Launch the Electron app |
| `npm run backend` | Start the FastAPI backend |

---

## Python Requirements

From `backend/requirements.txt`:

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework for the backend API |
| `uvicorn` | ASGI server that runs FastAPI |
| `httpx` | Async HTTP client for external APIs |
| `anthropic` | Anthropic Claude SDK (AI Advisor) |
| `numpy` | Numerical computation |
| `pydantic` | Data validation and serialization |
| `python-dotenv` | Loads `.env` file into environment |

## Node Dependencies

Key packages from `package.json`:

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `recharts` | Data visualization / charts |
| `leaflet` / `react-leaflet` | Interactive maps |
| `electron` | Desktop application shell |
| `webpack` | Module bundler |
| `concurrently` | Run multiple commands in parallel |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm start` fails | Make sure Node 18+ is installed and run `npm install` first |
| Backend won't start | Check Python 3.10+ is on your PATH; install deps with `pip install -r backend/requirements.txt` |
| AI Advisor says "offline" | Set `ANTHROPIC_API_KEY` in your `.env` file and restart the backend |
| Satellite data shows "demo_mode" | Set `GEE_PROJECT_ID` in your `.env` and authenticate with `ee.Authenticate()` |
| Port already in use | Kill the process on that port: `lsof -ti:3000 | xargs kill` or `lsof -ti:8000 | xargs kill` |
