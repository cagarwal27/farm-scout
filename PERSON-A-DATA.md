# Person A: Data + Backend

You own everything that touches real data. Your job is to make the demo **real** -- real satellite imagery, real NDVI, real weather, real hotspot polygons. Person B is building the entire UI with mock data. When you're done, your real data replaces their mocks.

**Your directory:** `backend/`
**Person B's directory:** `frontend/`
**You should never need to edit files in `frontend/`.** Person B should never need to edit files in `backend/`.

---

## The Contract (Read This First)

You and Person B must agree on these exact data shapes before splitting up. Spend the first hour on this together. These TypeScript interfaces define what your API returns -- Person B will build mocks from them, you will build real endpoints that match them.

### Endpoint 1: `POST /api/analyze`

**Request:**
```json
{
  "aoi": { <GeoJSON Polygon> },
  "date_start": "2024-07-01",
  "date_end": "2024-07-14"
}
```

**Response:**
```json
{
  "field": {
    "location": "Yolo County, CA",
    "crop": "Almond",
    "area_acres": 412.5,
    "date_start": "2024-07-01",
    "date_end": "2024-07-14"
  },
  "summary": {
    "clusters_found": 6,
    "total_affected_acres": 12.8,
    "avg_ndvi_drop": -0.17,
    "max_ndvi_drop": -0.24
  },
  "hotspots": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Polygon", "coordinates": [...] },
        "properties": {
          "cluster_id": "A",
          "area_acres": 3.2,
          "ndvi_drop": -0.24,
          "severity": "high",
          "centroid": [-121.87, 38.72]
        }
      }
    ]
  }
}
```

### Endpoint 2: `GET /api/weather?lat=38.7&lon=-121.9&start=2024-07-01&end=2024-07-14`

**Response:**
```json
{
  "location": { "lat": 38.7, "lon": -121.9 },
  "period": { "start": "2024-07-01", "end": "2024-07-14" },
  "daily": [
    {
      "date": "2024-07-01",
      "temp_max_f": 102.3,
      "temp_min_f": 68.1,
      "precipitation_in": 0.0,
      "wind_gust_mph": 12.4,
      "humidity_pct": 31
    }
  ],
  "alerts": [
    {
      "type": "heat_spike",
      "label": "3-day heat spike > 100\u00b0F",
      "start": "2024-07-03",
      "end": "2024-07-05",
      "severity": "high"
    },
    {
      "type": "no_rainfall",
      "label": "No rainfall for 14 days",
      "start": "2024-07-01",
      "end": "2024-07-14",
      "severity": "medium"
    }
  ],
  "correlation": {
    "primary": "Heat stress",
    "secondary": "Irrigation irregularity",
    "confidence": "moderate"
  }
}
```

### Endpoint 3: `POST /api/missions`

**Request:**
```json
{
  "hotspots": { <the hotspots FeatureCollection from /api/analyze> }
}
```

**Response:**
```json
{
  "missions": [
    {
      "zone_id": "A",
      "priority": 1,
      "area_acres": 3.2,
      "ndvi_drop": -0.24,
      "centroid": [-121.87, 38.72],
      "checklist": [
        "Inspect canopy for scorch or browning",
        "Check soil moisture at root zone",
        "Inspect irrigation emitters for blockage",
        "Capture 4 canopy photos (N/S/E/W)"
      ]
    },
    {
      "zone_id": "C",
      "priority": 2,
      "area_acres": 2.1,
      "ndvi_drop": -0.18,
      "centroid": [-121.85, 38.71],
      "checklist": [
        "Check for leaf curling or wilting",
        "Look for pest presence (mites, borers)",
        "Capture 4 canopy photos (N/S/E/W)"
      ]
    }
  ],
  "summary": {
    "total_zones": 5,
    "estimated_hours": 2.3,
    "crew_required": 2
  }
}
```

### Routing: Person B handles directly

Person B calls OSRM directly from the frontend -- you don't need to build a routing endpoint. They'll use the `centroid` coordinates from your missions response.

---

## Your Tasks (In Order)

### Hour 0-1: Shared Setup

- [ ] Sit with Person B. Walk through the three data contracts above. Adjust field names if needed. **Once agreed, don't change them without telling Person B.**
- [ ] Create the repo together. Set up `backend/` and `frontend/` directories. Both push initial scaffolding.

### Hour 1-4: Environment + First Data Pull (HIGHEST RISK)

This is your most important phase. If satellite data doesn't work, everything downstream breaks. Do this before anything else.

- [ ] Set up Python environment:
  ```
  cd backend
  python -m venv venv
  source venv/bin/activate
  pip install pystac-client planetary-computer stackstac xarray rasterio numpy scikit-image shapely geopandas fastapi uvicorn requests
  ```
- [ ] Write `precache.py` -- the script that pulls real Sentinel-2 data
- [ ] Query Planetary Computer STAC API for Sentinel-2 L2A:
  - Collection: `sentinel-2-l2a`
  - Location: Yolo County almond block (pick a specific ~400 acre area)
  - Date range: Summer 2024 (pick two dates ~10-14 days apart)
  - Cloud cover: < 15%
  - Bands: B04 (Red), B08 (NIR), SCL (Scene Classification)
- [ ] Verify you get results. Print how many scenes found.
- [ ] Download one scene. Verify bands load correctly.
- [ ] **Tell Person B: "Data pipeline is working" or "Data pipeline is blocked, keep using mocks"**

**Key details:**
- No auth needed. Anonymous access works.
- `planetary_computer.sign_inplace` handles URL signing automatically.
- Use `stackstac.stack()` with `resolution=10, epsg=32610` (UTM Zone 10N for Northern California).
- California summer is mostly cloud-free. You should find plenty of clean scenes.

### Hour 4-8: NDVI + Change Detection

- [ ] Compute NDVI for both dates: `(B08 - B04) / (B08 + B04)`
- [ ] Apply cloud mask using SCL band: keep only pixels where SCL = 4 (vegetation) or 5 (bare soil)
- [ ] Compute delta: `ndvi_t2 - ndvi_t1`
- [ ] Threshold: flag pixels where `delta < -0.12`
- [ ] Sieve filter: remove clusters smaller than 50 pixels (~1.2 acres) using `rasterio.features.sieve()`
- [ ] Label connected components: `skimage.measure.label(connectivity=2)`
- [ ] Polygonize clusters: `rasterio.features.shapes()`
- [ ] Simplify polygons: `shapely.simplify(tolerance=20, preserve_topology=True)`
- [ ] For each cluster, compute: area in acres, mean NDVI drop, centroid coordinates, severity label
- [ ] Save as `cache/hotspots.geojson` matching the contract format above
- [ ] **Visually verify**: plot the hotspots over the NDVI map. Do they look like real stress zones or noise?

**Tuning tips:**
- If too many hotspots: tighten threshold to -0.15, increase sieve to 80 pixels
- If too few hotspots: loosen threshold to -0.10, decrease sieve to 30 pixels
- If hotspots look like cloud shadows: verify SCL mask is applied correctly
- Ideal for demo: 4-8 clusters, 5-20 acres total affected

### Hour 4-8 (parallel): Weather API

This is independent of satellite work. Do it when you need a break from raster processing.

- [ ] Write `weather.py` -- wrapper around Open-Meteo Historical API
- [ ] Endpoint: `https://archive-api.open-meteo.com/v1/archive`
- [ ] Parameters: `latitude, longitude, start_date, end_date, daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,relative_humidity_2m_mean`
- [ ] Add `temperature_unit=fahrenheit`, `wind_speed_unit=mph`, `precipitation_unit=inch`
- [ ] No API key needed. Plain HTTP GET.
- [ ] Parse response. Generate `alerts` array:
  - Heat spike: any 3+ consecutive days where `temp_max > 100`
  - No rainfall: `precipitation_sum == 0` for 7+ days
  - High wind: `wind_gust > 30 mph` on any day
- [ ] Generate `correlation` object (simple rules, not ML):
  - If heat spike exists: primary = "Heat stress"
  - If no rainfall: secondary = "Irrigation irregularity"
  - Default confidence: "moderate" (always -- don't overclaim)
- [ ] Cache the response as `cache/weather.json`

### Hour 8-12: FastAPI Server

- [ ] Write `main.py` with FastAPI:
  ```python
  from fastapi import FastAPI
  from fastapi.middleware.cors import CORSMiddleware

  app = FastAPI()
  app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
  ```
- [ ] `POST /api/analyze`:
  - Accept AOI GeoJSON + date range
  - For hackathon: if AOI is close to pre-cached field, return cached results
  - If not cached: run the pipeline live (slower, but proves it's real)
  - Always return the contract format
- [ ] `GET /api/weather`:
  - Accept lat, lon, start, end
  - Call Open-Meteo, process alerts, return contract format
  - Cache responses to avoid repeat API calls
- [ ] `POST /api/missions`:
  - Accept hotspots FeatureCollection
  - Sort by severity * area (descending) for priority ranking
  - Assign zone labels (A, B, C...)
  - Assign checklist templates based on correlation data:
    - Heat stress → canopy scorch, soil moisture, irrigation emitters
    - General → leaf condition, pest check, photo capture
  - Compute summary: total zones, estimated hours (0.4 hrs per zone + 0.1 per acre), crew required (1 if < 10 acres, 2 if > 10)
  - Return contract format
- [ ] Test all endpoints with curl. Verify response shapes match the contract exactly.
- [ ] **Tell Person B: "API is live at localhost:8000, you can switch from mocks"**

### Hour 12-16: Pre-cache 2-3 AOIs

- [ ] Pick 2-3 different field locations in Yolo County (vary crop type if possible)
- [ ] Run the full pipeline for each. Save results in `cache/`
- [ ] Name them clearly: `field_a_almonds.json`, `field_b_walnuts.json`, etc.
- [ ] Verify each looks good when plotted
- [ ] Add a "demo mode" flag to FastAPI that always serves the best-looking cached result

### Hour 16-24: Hardening

- [ ] Add error handling to all endpoints (return clean error JSON, never crash)
- [ ] Add a `/api/health` endpoint that returns `{"status": "ok"}` for Person B to ping
- [ ] If satellite pipeline is slow (>5s), add a loading endpoint: `POST /api/analyze` returns immediately with a job ID, then `GET /api/analyze/{job_id}` polls for results
- [ ] Or simpler: just make `/api/analyze` return cached results in <500ms for the demo, with a `"source": "cached"` flag
- [ ] Test: unplug wifi. Does the API still work with cached data? It must.

### Hour 24+: Integration Support

- [ ] Help Person B connect real API to frontend
- [ ] Debug any data shape mismatches
- [ ] Tune hotspot visuals (if polygons look weird on the map, simplify more or adjust threshold)
- [ ] Prepare to answer judge questions: "Is this real data?" → "Yes, Sentinel-2 L2A from July 2024, 10m resolution, processed with standard NDVI change detection"

---

## What You Deliver

By integration time, Person B should be able to:

1. `cd backend && uvicorn main:app --reload`
2. Hit `http://localhost:8000/api/analyze` and get hotspot GeoJSON
3. Hit `http://localhost:8000/api/weather` and get weather + alerts
4. Hit `http://localhost:8000/api/missions` and get prioritized scout zones

All matching the contract shapes exactly. With cached fallbacks that work offline.

---

## If Things Go Wrong

| Problem | Fallback |
|---|---|
| Can't pull Sentinel-2 data | Use static GeoJSON mocks (Person B already has them). Focus on weather API + mission logic instead. |
| NDVI looks noisy / too many false positives | Tighten threshold to -0.15, increase sieve to 100 pixels, pick a cleaner date pair. |
| Hotspots are in weird locations | Verify SCL cloud mask is applied. Try different field AOI. |
| Open-Meteo is down | Cache weather data early. Return cached data from disk. |
| FastAPI is too complex | Skip it. Just generate static JSON files and put them in `frontend/public/data/`. Person B loads them with `fetch('/data/hotspots.json')`. |

The last fallback is your nuclear option: forget the server entirely, just produce the JSON files that match the contract. The demo will look identical to the audience.

---

## Quick Reference

**Planetary Computer STAC:**
```
https://planetarycomputer.microsoft.com/api/stac/v1
```
Collection: `sentinel-2-l2a` | No auth | Bands: B04, B08, SCL | 10m resolution

**Open-Meteo Historical:**
```
https://archive-api.open-meteo.com/v1/archive
```
No auth | Params: temperature_2m_max, precipitation_sum, wind_gusts_10m_max, relative_humidity_2m_mean

**Yolo County center:** 38.7N, 121.9W | FIPS: 06113 | UTM Zone: 10N (EPSG:32610)

**NDVI threshold:** -0.12 (adjust if needed) | **Sieve:** 50 pixels minimum

**Almond NDVI (peak season):** 0.55-0.75 healthy, < 0.40 stressed
