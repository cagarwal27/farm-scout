# FarmSense: Unified Project Plan

## The Problem

A farmer has 400+ acres of almond trees in Yolo County, CA. Somewhere in that field, trees are silently dying -- heat stress, irrigation failures, pest damage. By the time it's visible from the ground, it's too late. Today, the farmer either scouts blindly (expensive, slow) or ignores it until yield drops.

## What We're Building

An "ops center" web tool that turns free satellite data into actionable field scouting missions. In under 3 minutes, a user can go from a satellite view of their field to a prioritized, routed checklist a crew can execute that afternoon.

**The pitch:** Satellite-detected crop stress → weather-correlated diagnosis → auto-generated scout missions → optimized driving route → mobile field ticket.

## The Demo Flow (Under 3 Minutes)

| Step | User Action | What Happens |
|------|-------------|--------------|
| 1 | Sees dark satellite map | Centered on a real Yolo County almond field. Looks like a military ops center. |
| 2 | Clicks "Analyze Field Health" | Map darkens, camera sweeps in at an angle, red stress clusters fade in with pulsing dots. Side panel shows cluster count, affected acres, NDVI drop. |
| 3 | Clicks "Explain Anomalies" | Weather data appears: 14-day temperature chart, heat spike alert (3 days >100F), no rainfall alert. Correlation: "Heat stress + irrigation irregularity." |
| 4 | Clicks "Generate Missions" | Prioritized scout zone cards appear. Each has a zone label, severity, area, and a field checklist (inspect canopy, check soil moisture, etc.). |
| 5 | Clicks "Optimize Route" | A real road route draws on the map connecting all zones in priority order. Shows distance and drive time. |
| 6 | Clicks "Create Field Ticket" | Mobile-style card with GPS coords, checklist, photo upload. Simulates what a field crew would use on their phone. |

## Architecture: Two Independent Halves

```
┌─────────────────────┐         3 JSON contracts          ┌─────────────────────┐
│   backend/          │ ──────────────────────────────────→│   frontend/         │
│                     │  POST /api/analyze → hotspots      │                     │
│  Real satellite     │  GET  /api/weather → alerts        │  Dark satellite map │
│  data pipeline      │  POST /api/missions → scout zones  │  Animations         │
│  (Python/FastAPI)   │                                    │  Side panel states  │
│                     │         ← fetch() calls ─────────  │  Route overlay      │
│  Person A owns this │                                    │  Person B owns this │
└─────────────────────┘                                    └─────────────────────┘
```

**Hard rule:** Person A never edits `frontend/`. Person B never edits `backend/`. The three API contracts are the only interface.

## Design Principles

### 1. Mocks-First, Always

Person B builds the entire frontend against mock JSON files from hour 1. The mock data matches the API contracts exactly. If the backend breaks, catches fire, or isn't ready -- the demo runs on mocks. The audience cannot tell the difference. Switching between mock and live is one env variable (`VITE_USE_MOCK=true`).

### 2. The Three Contracts Are Sacred

Both sides agreed on the exact JSON shapes for `/api/analyze`, `/api/weather`, and `/api/missions` before writing a single line of code. If either side needs to change a field name, they tell the other person first. No surprises at integration time.

### 3. Cache Everything

- Backend caches satellite data, weather responses, and pre-computed hotspots to disk (`backend/cache/`).
- Frontend can fall back to mocks if any API call fails.
- The demo must work with wifi off.

### 4. The Animation Is the Product

The "analyze" transition -- map darkens, camera sweeps, red zones appear with pulsing dots -- is the single most important moment in the demo. It's what makes this look like a real tool instead of a school project. Spend disproportionate time making it smooth.

### 5. Dark Ops Aesthetic

Everything is dark-themed. Satellite imagery is dimmed. Text is light on dark. Color is used only for data: red = stress, amber = warning, green = route/healthy, blue = interactive. Monospace font for data values. No gradients, no rounded cards, no playful colors. This is a command center.

### 6. Real Data Backs the Story

The backend uses real Sentinel-2 satellite imagery (10m resolution, free, no auth), real NDVI change detection, and real historical weather from Open-Meteo. When a judge asks "is this real?" the answer is yes. The hotspot locations, the temperature readings, the NDVI drops -- all computed from actual data.

### 7. Routing Is Frontend-Owned

Person B calls the OSRM public API directly from the browser to draw driving routes between scout zones. No backend endpoint needed. If OSRM is down, draw straight lines and hardcode the distance.

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | React + TypeScript + Vite | Fast dev, fast builds |
| Map | MapLibre GL + EOX Sentinel-2 tiles | Free, GPU-accelerated, dark-mode friendly |
| Styling | Tailwind CSS | Rapid dark UI without CSS files |
| Backend | Python + FastAPI | Best ecosystem for geospatial/raster work |
| Satellite | Planetary Computer STAC → Sentinel-2 L2A | Free, no auth, 10m resolution |
| Weather | Open-Meteo Historical API | Free, no auth, reliable |
| Routing | OSRM public API | Free, returns GeoJSON directly |
| NDVI | NumPy + rasterio + scikit-image | Standard raster processing |

Minimal dependencies. Every extra package is a build risk at 3 AM.

## Failure Modes

The system degrades gracefully at every level:

- Backend down → frontend uses mocks (identical output)
- Satellite API down → backend serves cached results
- Weather API down → backend serves cached weather
- OSRM down → frontend draws straight lines, hardcodes distance
- Map tiles slow → swap to ESRI or CARTO dark basemap

No single failure kills the demo.
