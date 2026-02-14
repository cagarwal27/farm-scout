# FarmSense: Satellite Crop Intelligence Platform

## The Problem

A farmer has 930+ acres of mixed orchards in Yolo County, CA. Somewhere across those fields, trees are silently dying — heat stress, irrigation failures, pest damage. By the time it's visible from the ground, yield is already lost. Today, the farmer either scouts blindly (expensive, slow) or ignores it until crop insurance kicks in.

**The cost of inaction:** A single undetected 34-acre stress zone can mean $14,000+ in lost yield per season.

## What FarmSense Does

FarmSense turns free satellite data into actionable field scouting missions. In under 2 minutes, a user goes from a satellite view of their field to a prioritized, routed, AI-diagnosed set of scout missions a crew can execute that afternoon.

**The pipeline:** Real satellite imagery → NDVI change detection → Weather-correlated diagnosis → AI-generated findings → Optimized scout route → Mobile field ticket.

---

## Technical Architecture

```
┌──────────────────────────────┐          3 API Contracts          ┌──────────────────────────────┐
│        backend/              │ ─────────────────────────────────→│        frontend/             │
│                              │                                   │                              │
│  Sentinel-2 L2A satellite    │  POST /api/analyze → hotspots     │  MapLibre GL satellite map   │
│  imagery (10m resolution)    │  GET  /api/weather → alerts       │  Cinematic map animations    │
│                              │  POST /api/missions → AI zones    │  Framer Motion panel flow    │
│  NDVI change detection       │                                   │  Data-driven zone highlight  │
│  (NumPy + rasterio)          │          ← fetch() calls ───────  │  Route overlay + markers     │
│                              │                                   │                              │
│  Python · FastAPI            │                                   │  React 19 · TypeScript       │
│  Person A                    │                                   │  Person B                    │
└──────────────────────────────┘                                   └──────────────────────────────┘
```

### Data Pipeline: End-to-End

Every number shown in the demo traces back to real data:

#### Stage 1: Satellite Analysis (Pre-computed)
1. **Source:** Sentinel-2 L2A imagery via Microsoft Planetary Computer STAC API
2. **Process:** Download Band 4 (Red) and Band 8 (NIR) at 10m resolution for two dates
3. **NDVI Calculation:** `NDVI = (NIR - Red) / (NIR + Red)` — computed per-pixel for both dates
4. **Change Detection:** `delta = NDVI_after - NDVI_before` — negative values indicate vegetation stress
5. **Clustering:** DBSCAN groups contiguous stressed pixels into zones, computes centroid + area
6. **Severity Classification:** Based on NDVI drop magnitude (>10% = high, >8% = medium, else low)
7. **Output:** GeoJSON FeatureCollection with polygon boundaries, cluster IDs, area, NDVI drop per zone

#### Stage 2: Live API Flow (Real-time)
1. **`/api/analyze`** — Returns cached satellite analysis. Matches requested AOI coordinates to pre-computed results (0.05° tolerance). Each zone has real polygon boundaries, area in acres, and measured NDVI decline.
2. **`/api/weather`** — Calls Open-Meteo Historical Weather API live. Returns 10-day temperature, precipitation, wind, humidity. Generates alerts (heat spikes, drought, high wind) and correlates weather patterns with observed crop stress.
3. **`/api/missions`** — Takes hotspots + weather context. Prioritizes zones by `severity_weight × area`. Calculates yield-at-risk economics (`$1,400/acre × NDVI_drop × 3x multiplier`). Generates AI-powered findings via GPT-4o-mini (with template fallback).

### AI-Powered Zone Findings

When `OPENAI_API_KEY` is set, the missions endpoint calls GPT-4o-mini to generate contextual agronomic diagnoses:

- **Input:** Zone data (severity, acreage, NDVI drop %) + full weather context (temperatures, precipitation, alerts, correlations)
- **Output:** Per-zone finding (root cause diagnosis) + recommended action (specific intervention steps)
- **Fallback:** If no API key or if the call fails, template-based findings are used that still inject real zone metrics (area, decline %, severity)

The AI receives actual satellite-measured data points and actual weather readings — it's not making things up, it's interpreting real measurements.

### Yield-at-Risk Economics

Each zone shows a dollar estimate of yield at risk:
- **Base:** $1,400/acre/year (almond/orchard industry average revenue)
- **Loss multiplier:** `min(|NDVI_drop| × 3, 1.0)` — a 10% vegetation decline maps to ~30% yield risk
- **Per zone:** `area_acres × $1,400 × loss_multiplier`
- **Total:** Summed across all detected zones, shown in the missions summary

This gives the demo a business impact dimension: it's not just "red zones on a map," it's "$47,000 at risk if you don't act."

---

## The Demo Flow (2-Minute Video)

| Step | User Action | What Happens | Data Source |
|------|-------------|--------------|-------------|
| 1 | Sees dark satellite map | Centered on real Dunnigan, CA orchards (38.89°N, 121.97°W). Dark ops aesthetic. | EOX Sentinel-2 cloudless tiles |
| 2 | "Analyze Field Health" | Map darkens, camera sweeps to 45° pitch, red/amber stress polygons fade in with pulsing centroid dots. Panel shows 8 zones, 122 acres affected. | Sentinel-2 NDVI change detection |
| 3 | "Explain Anomalies" | 10-day temperature chart with heat spike highlighting. Alerts: 3 days >100°F, no rainfall. Correlation: heat stress (primary), irrigation deficit (secondary). | Open-Meteo Historical API (live) |
| 4 | "Generate Missions" | 5 prioritized scout zones with severity badges, area, and yield-at-risk dollars. Total yield at risk displayed. | Backend priority scoring + yield economics |
| 5 | "Optimize Route" | Cyan route line with direction arrows connects zones in priority order. Numbered green markers. Distance + drive time. | OSRM public routing API |
| 6 | "Create Field Ticket" | Zone briefing card: severity badge, 3 metric cards (area, decline %, $ at risk), animated decline bar, AI diagnosis, recommended action. Map zooms into active zone with highlighting. | GPT-4o-mini AI findings + map data-driven expressions |

### Map Animation Details

The "analyze" reveal is a cinematic sequence timed to milliseconds:
- **0ms:** Data loaded into invisible GeoJSON sources
- **500ms:** Satellite brightness dims to 30% (dark mode reveal)
- **800ms:** Camera sweeps: zoom 15.5, pitch 45°, bearing -20°, 3s duration
- **1300ms:** Hotspot polygons fade in (1.5s transition), color-coded by severity
- **2000ms:** Pulsing dot centroids appear (custom canvas animation at 60fps)
- **2500ms:** Side panel transitions from loading spinner to analysis results

### Zone Highlighting (Field Ticket)

When inspecting individual zones, the map uses data-driven paint expressions:
- **Active zone:** 70% opacity fill, bright outline (3px width)
- **Other zones:** 10% opacity fill, dim outline — creates a spotlight effect
- **Camera:** Flies to zone centroid at zoom 17, pitch 50° for immersive inspection
- **All complete:** Camera zooms back to overview, all zones restored to equal visibility

---

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | React 19 + TypeScript + Vite | Fast dev, fast builds, type safety |
| Map | MapLibre GL + EOX Sentinel-2 tiles | Free, GPU-accelerated, dark-mode satellite imagery |
| Animations | Framer Motion | Smooth panel transitions, staggered reveals |
| Styling | Tailwind CSS | Rapid dark UI, consistent design tokens |
| Backend | Python + FastAPI | Best ecosystem for geospatial/raster work |
| Satellite | Planetary Computer STAC → Sentinel-2 L2A | Free, no auth required, 10m resolution, global coverage |
| Weather | Open-Meteo Historical API | Free, no auth, reliable, covers any location |
| AI Findings | GPT-4o-mini (OpenAI) | Contextual agronomic diagnosis from real data points |
| NDVI | NumPy + rasterio + scikit-image | Industry-standard raster processing |
| Routing | OSRM public API | Free, returns real road-following GeoJSON |

## Resilience

The system degrades gracefully at every level:

- **OpenAI unavailable** → Template-based findings inject real zone data (area, decline %)
- **Backend down** → Frontend serves identical output from mock JSON
- **Satellite API down** → Backend serves pre-cached analysis results
- **Weather API down** → Backend serves cached weather data
- **OSRM down** → Frontend draws straight-line route, estimates distance from coordinates
- **Map tiles slow** → Fallback to ESRI or CARTO dark basemap

No single failure kills the demo.

## What's Real vs. What's Simulated

| Component | Status | Detail |
|-----------|--------|--------|
| Satellite imagery | **Real** | Sentinel-2 L2A, 10m resolution, actual Dunnigan CA orchards |
| NDVI change detection | **Real** | Computed from actual Band 4/Band 8 pixel values |
| Stress zone polygons | **Real** | DBSCAN clustering of actual stressed pixels |
| Weather data | **Real** | Live Open-Meteo API call for the analysis period |
| Weather alerts | **Real** | Computed from actual temperature/precipitation thresholds |
| AI zone findings | **Real** | GPT-4o-mini analyzing actual satellite + weather data |
| Yield-at-risk | **Modeled** | Real area + real NDVI drop × industry revenue assumptions |
| Driving route | **Real** | OSRM road-following route between actual zone centroids |
| Field ticket flow | **Simulated** | UI demonstration of what a field crew would use |

## Testing

- **Backend:** 7 tests — health check, analyze (success + validation), weather (success + validation), missions, full pipeline integration
- **Frontend:** 8 tests — API contract validation for all 3 endpoints, field config verification, severity threshold checks
- **All 15 tests pass.**
