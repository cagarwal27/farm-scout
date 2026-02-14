# Person B: Frontend + UI

You own everything the audience sees. Your job is to make the demo **feel like a real ops tool** -- the dark satellite map, the transformation animation, the mission cards, the route overlay. You build the entire experience with mock data from hour 1, so you are never blocked by Person A's backend work.

**Your directory:** `frontend/`
**Person A's directory:** `backend/`
**You should never need to edit files in `backend/`.** Person A should never need to edit files in `frontend/`.

---

## The Contract (Read This First)

You and Person A must agree on these exact data shapes before splitting up. Spend the first hour on this together. You will build mocks that match these shapes. When Person A's API is ready, you swap mock URLs for real URLs. Nothing else changes.

### Endpoint 1: `POST /api/analyze` -> AnalyzeResponse

```typescript
interface AnalyzeResponse {
  field: {
    location: string;        // "Yolo County, CA"
    crop: string;            // "Almond"
    area_acres: number;      // 412.5
    date_start: string;      // "2024-07-01"
    date_end: string;        // "2024-07-14"
  };
  summary: {
    clusters_found: number;  // 6
    total_affected_acres: number;  // 12.8
    avg_ndvi_drop: number;   // -0.17
    max_ndvi_drop: number;   // -0.24
  };
  hotspots: GeoJSON.FeatureCollection;
  // Each feature has properties:
  //   cluster_id: string ("A", "B", ...)
  //   area_acres: number
  //   ndvi_drop: number (negative)
  //   severity: "high" | "medium" | "low"
  //   centroid: [lon, lat]
}
```

### Endpoint 2: `GET /api/weather` -> WeatherResponse

```typescript
interface WeatherResponse {
  location: { lat: number; lon: number };
  period: { start: string; end: string };
  daily: Array<{
    date: string;
    temp_max_f: number;
    temp_min_f: number;
    precipitation_in: number;
    wind_gust_mph: number;
    humidity_pct: number;
  }>;
  alerts: Array<{
    type: "heat_spike" | "no_rainfall" | "high_wind";
    label: string;
    start: string;
    end: string;
    severity: "high" | "medium" | "low";
  }>;
  correlation: {
    primary: string;
    secondary: string;
    confidence: "high" | "moderate" | "low";
  };
}
```

### Endpoint 3: `POST /api/missions` -> MissionsResponse

```typescript
interface MissionsResponse {
  missions: Array<{
    zone_id: string;         // "A", "B", "C"
    priority: number;        // 1, 2, 3...
    area_acres: number;
    ndvi_drop: number;
    centroid: [number, number];  // [lon, lat]
    checklist: string[];
  }>;
  summary: {
    total_zones: number;
    estimated_hours: number;
    crew_required: number;
  };
}
```

### Routing: You own this directly

You call OSRM from the frontend. No backend endpoint needed.
```
https://router.project-osrm.org/route/v1/driving/{lon},{lat};{lon},{lat}?overview=full&geometries=geojson
```
Returns a GeoJSON LineString in `response.routes[0].geometry`.

---

## Your Mock Data

Create these files in `frontend/src/mocks/` during hour 1-2. They must match the contracts above exactly. Use realistic Yolo County coordinates.

**Why mocks matter:** You can build, test, and polish the entire demo without Person A's backend. If Person A's pipeline breaks at hour 30, your mocks save the demo. Nobody in the audience will know the difference.

### `mockAnalyze.json`

Use a real polygon shape for Yolo County almonds. The coordinates below are a roughly rectangular block near Woodland, CA. The hotspot positions should be scattered within this boundary (not all in one corner).

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
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-121.8745, 38.7210],
            [-121.8720, 38.7210],
            [-121.8720, 38.7190],
            [-121.8745, 38.7190],
            [-121.8745, 38.7210]
          ]]
        },
        "properties": {
          "cluster_id": "A",
          "area_acres": 3.2,
          "ndvi_drop": -0.24,
          "severity": "high",
          "centroid": [-121.8732, 38.7200]
        }
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-121.8690, 38.7175],
            [-121.8670, 38.7175],
            [-121.8670, 38.7160],
            [-121.8690, 38.7160],
            [-121.8690, 38.7175]
          ]]
        },
        "properties": {
          "cluster_id": "B",
          "area_acres": 2.1,
          "ndvi_drop": -0.19,
          "severity": "high",
          "centroid": [-121.8680, 38.7168]
        }
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-121.8760, 38.7155],
            [-121.8745, 38.7155],
            [-121.8745, 38.7142],
            [-121.8760, 38.7142],
            [-121.8760, 38.7155]
          ]]
        },
        "properties": {
          "cluster_id": "C",
          "area_acres": 2.4,
          "ndvi_drop": -0.16,
          "severity": "medium",
          "centroid": [-121.8752, 38.7148]
        }
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-121.8710, 38.7230],
            [-121.8698, 38.7230],
            [-121.8698, 38.7220],
            [-121.8710, 38.7220],
            [-121.8710, 38.7230]
          ]]
        },
        "properties": {
          "cluster_id": "D",
          "area_acres": 1.8,
          "ndvi_drop": -0.14,
          "severity": "medium",
          "centroid": [-121.8704, 38.7225]
        }
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-121.8665, 38.7205],
            [-121.8650, 38.7205],
            [-121.8650, 38.7195],
            [-121.8665, 38.7195],
            [-121.8665, 38.7205]
          ]]
        },
        "properties": {
          "cluster_id": "E",
          "area_acres": 1.9,
          "ndvi_drop": -0.13,
          "severity": "medium",
          "centroid": [-121.8658, 38.7200]
        }
      },
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [-121.8730, 38.7140],
            [-121.8720, 38.7140],
            [-121.8720, 38.7133],
            [-121.8730, 38.7133],
            [-121.8730, 38.7140]
          ]]
        },
        "properties": {
          "cluster_id": "F",
          "area_acres": 1.4,
          "ndvi_drop": -0.11,
          "severity": "low",
          "centroid": [-121.8725, 38.7137]
        }
      }
    ]
  }
}
```

### `mockWeather.json`

```json
{
  "location": { "lat": 38.72, "lon": -121.87 },
  "period": { "start": "2024-07-01", "end": "2024-07-14" },
  "daily": [
    { "date": "2024-07-01", "temp_max_f": 95.2, "temp_min_f": 62.1, "precipitation_in": 0.0, "wind_gust_mph": 14.3, "humidity_pct": 35 },
    { "date": "2024-07-02", "temp_max_f": 97.8, "temp_min_f": 64.5, "precipitation_in": 0.0, "wind_gust_mph": 11.2, "humidity_pct": 32 },
    { "date": "2024-07-03", "temp_max_f": 102.3, "temp_min_f": 68.1, "precipitation_in": 0.0, "wind_gust_mph": 8.7, "humidity_pct": 28 },
    { "date": "2024-07-04", "temp_max_f": 105.1, "temp_min_f": 71.2, "precipitation_in": 0.0, "wind_gust_mph": 6.4, "humidity_pct": 24 },
    { "date": "2024-07-05", "temp_max_f": 103.8, "temp_min_f": 70.4, "precipitation_in": 0.0, "wind_gust_mph": 9.1, "humidity_pct": 26 },
    { "date": "2024-07-06", "temp_max_f": 99.4, "temp_min_f": 66.8, "precipitation_in": 0.0, "wind_gust_mph": 12.5, "humidity_pct": 30 },
    { "date": "2024-07-07", "temp_max_f": 96.1, "temp_min_f": 63.9, "precipitation_in": 0.0, "wind_gust_mph": 15.8, "humidity_pct": 33 },
    { "date": "2024-07-08", "temp_max_f": 94.7, "temp_min_f": 62.3, "precipitation_in": 0.0, "wind_gust_mph": 18.2, "humidity_pct": 36 },
    { "date": "2024-07-09", "temp_max_f": 93.2, "temp_min_f": 61.5, "precipitation_in": 0.0, "wind_gust_mph": 22.6, "humidity_pct": 38 },
    { "date": "2024-07-10", "temp_max_f": 91.8, "temp_min_f": 60.2, "precipitation_in": 0.0, "wind_gust_mph": 31.4, "humidity_pct": 40 },
    { "date": "2024-07-11", "temp_max_f": 95.5, "temp_min_f": 63.1, "precipitation_in": 0.0, "wind_gust_mph": 14.7, "humidity_pct": 34 },
    { "date": "2024-07-12", "temp_max_f": 97.3, "temp_min_f": 64.8, "precipitation_in": 0.0, "wind_gust_mph": 11.3, "humidity_pct": 31 },
    { "date": "2024-07-13", "temp_max_f": 96.0, "temp_min_f": 63.4, "precipitation_in": 0.0, "wind_gust_mph": 10.8, "humidity_pct": 33 },
    { "date": "2024-07-14", "temp_max_f": 94.9, "temp_min_f": 62.7, "precipitation_in": 0.0, "wind_gust_mph": 12.1, "humidity_pct": 35 }
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
      "type": "high_wind",
      "label": "Wind gusts > 30 mph",
      "start": "2024-07-10",
      "end": "2024-07-10",
      "severity": "medium"
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

### `mockMissions.json`

```json
{
  "missions": [
    {
      "zone_id": "A",
      "priority": 1,
      "area_acres": 3.2,
      "ndvi_drop": -0.24,
      "centroid": [-121.8732, 38.7200],
      "checklist": [
        "Inspect canopy for scorch or browning",
        "Check soil moisture at root zone",
        "Inspect irrigation emitters for blockage",
        "Capture 4 canopy photos (N/S/E/W)"
      ]
    },
    {
      "zone_id": "B",
      "priority": 2,
      "area_acres": 2.1,
      "ndvi_drop": -0.19,
      "centroid": [-121.8680, 38.7168],
      "checklist": [
        "Inspect canopy for scorch or browning",
        "Check soil moisture at root zone",
        "Look for pest presence (mites, borers)",
        "Capture 4 canopy photos (N/S/E/W)"
      ]
    },
    {
      "zone_id": "C",
      "priority": 3,
      "area_acres": 2.4,
      "ndvi_drop": -0.16,
      "centroid": [-121.8752, 38.7148],
      "checklist": [
        "Check for leaf curling or wilting",
        "Inspect drip lines for leaks",
        "Note any discoloration patterns",
        "Capture 4 canopy photos (N/S/E/W)"
      ]
    },
    {
      "zone_id": "D",
      "priority": 4,
      "area_acres": 1.8,
      "ndvi_drop": -0.14,
      "centroid": [-121.8704, 38.7225],
      "checklist": [
        "Check for leaf curling or wilting",
        "Look for pest presence (mites, borers)",
        "Capture 4 canopy photos (N/S/E/W)"
      ]
    },
    {
      "zone_id": "E",
      "priority": 5,
      "area_acres": 1.9,
      "ndvi_drop": -0.13,
      "centroid": [-121.8658, 38.7200],
      "checklist": [
        "General canopy health assessment",
        "Check soil moisture at root zone",
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

---

## Your Tasks (In Order)

### Hour 0-1: Shared Setup

- [ ] Sit with Person A. Walk through the three data contracts above. Adjust field names if needed. **Once agreed, don't change them without telling Person A.**
- [ ] Create the repo together. Set up `backend/` and `frontend/` directories.

### Hour 1-3: Scaffold + Dark Satellite Map

This is your first visual milestone. Get the map looking right before building anything else.

- [ ] Scaffold the React project:
  ```
  npm create vite@latest frontend -- --template react-ts
  cd frontend
  npm install maplibre-gl @vis.gl/react-maplibre
  npm install -D tailwindcss @tailwindcss/vite
  ```
- [ ] Set up Tailwind with the Vite plugin
- [ ] Create the base layout: full-screen map (left 70%) + side panel (right 30%), dark background
- [ ] Get MapLibre rendering with EOX Sentinel-2 Cloudless tiles:
  ```
  https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg
  ```
- [ ] Apply the dark "ops" treatment:
  ```javascript
  paint: {
    'raster-brightness-max': 0.5,
    'raster-saturation': -0.3,
    'raster-contrast': 0.2
  }
  ```
- [ ] Center on the mock field: `[-121.872, 38.718]`, zoom 14
- [ ] Create the mock JSON files in `src/mocks/`
- [ ] **Checkpoint:** You should see a dark satellite map of Yolo County farmland with a side panel. Take a screenshot.

### Hour 3-6: The Transformation Animation (MOST IMPORTANT)

This is the demo's money shot. Spend real time making this feel smooth and cinematic.

- [ ] Add the field boundary as a GeoJSON polygon source (use a rectangle around your mock hotspot area)
- [ ] Add the "Analyze Field Health" button to the side panel
- [ ] Build `useMapTransition` hook that orchestrates the reveal sequence:

**The sequence (exact timing):**

| Delay | Action | MapLibre API |
|---|---|---|
| 0ms | Button shows loading spinner | React state |
| 500ms | Satellite imagery darkens | `setPaintProperty('satellite', 'raster-brightness-max', 0.3)` |
| 800ms | Camera sweeps in | `map.flyTo({ center, zoom: 15, pitch: 45, bearing: -20, duration: 3000 })` |
| 1300ms | Red hotspot polygons fade in | `setPaintProperty('hotspot-fill', 'fill-opacity', 0.6)` with `fill-opacity-transition: { duration: 1500 }` |
| 2000ms | Pulsing dots appear at centroids | `setData()` on pulsing dot source |
| 2500ms | Side panel updates with results | React state transition |
| 3000ms | Loading spinner resolves | React state |

- [ ] Add the hotspot fill layer (initially opacity 0):
  ```javascript
  {
    id: 'hotspot-fill',
    type: 'fill',
    source: 'hotspots',
    paint: {
      'fill-color': '#ff2222',
      'fill-opacity': 0,
      'fill-opacity-transition': { duration: 1500, delay: 0 }
    }
  }
  ```
- [ ] Add the hotspot outline layer:
  ```javascript
  {
    id: 'hotspot-outline',
    type: 'line',
    source: 'hotspots',
    paint: {
      'line-color': '#ff4444',
      'line-width': 2,
      'line-opacity': 0,
      'line-opacity-transition': { duration: 1500, delay: 0 }
    }
  }
  ```
- [ ] Implement pulsing dots using MapLibre's canvas `StyleImageInterface`:
  - Red pulsing circle at each cluster centroid
  - Animation loop using `map.triggerRepaint()` and `performance.now()`
  - Size ~200px canvas, render a pulsing ring + solid center dot
- [ ] **Checkpoint:** Click button → field darkens → camera sweeps → red zones appear → dots pulse. This must look smooth.

**Tuning tips:**
- If the camera sweep feels too fast, increase `flyTo` duration to 4000ms
- If hotspots appear before the camera arrives, increase their delay to 2000ms
- The darkening + camera sweep should start nearly simultaneously -- the darkening sets the mood, the camera draws the eye
- Test on the actual laptop you'll present on. Animations that are smooth on a MacBook Pro may stutter on a conference laptop.

### Hour 6-10: Side Panel States

The side panel goes through 5 states sequentially. Each state is triggered by a user action.

- [ ] **State 1: Field Info** (shown on load)
  - Location: Yolo County, CA
  - Crop: Almond
  - Period: Jul 1 - Jul 14, 2024
  - Simple, clean typography. Monospace for data values.
  - Optional: small weather summary line

- [ ] **State 2: Analysis Results** (shown after "Analyze Field Health")
  - Animated count-up for numbers (clusters found, acres affected)
  - Severity color coding: high = red, medium = amber, low = yellow
  - Average NDVI drop as a percentage: "-17%"
  - Small text: "6 anomaly clusters detected across 12.8 acres"

- [ ] **State 3: Weather Context** (shown after "Explain Anomalies" click)
  - Mini temperature chart for 14 days (simple bar chart or sparkline)
  - Highlight the 100+ degree days in red
  - Alert badges: "3-day heat spike > 100F" (red), "No rainfall 14 days" (amber)
  - Correlation line: "Likely: Heat stress (primary), Irrigation irregularity (secondary)"
  - Confidence badge: "Moderate confidence"
  - Keep it factual. No "AI detected" language. Just "Correlated stress factors."

- [ ] **State 4: Scout Missions** (shown after "Generate Missions" click)
  - Card for each mission zone, sorted by priority
  - Each card shows: zone label (A), priority badge, area, NDVI drop %
  - Expandable checklist items with checkboxes (visual only)
  - Summary bar at bottom: "5 zones | ~2.3 hours | 2 crew"
  - "Optimize Route" button

- [ ] **State 5: Field Ticket** (shown after "Create Field Ticket" click)
  - Mobile-style card (narrow, centered)
  - Zone header + GPS coordinates
  - Checklist with interactive checkboxes
  - "Upload Photo" button → click → shows placeholder image → zone status changes to "Complete"
  - Green checkmark animation on completion

Use Tailwind for all styling. Keep everything dark: `bg-gray-900`, `text-gray-100`, accent colors only for data and status indicators.

### Hour 10-14: Route Overlay

- [ ] Write `useOSRM` hook:
  ```typescript
  async function fetchRoute(waypoints: [number, number][]): Promise<{
    geometry: GeoJSON.LineString;
    distance_km: number;
    duration_min: number;
  }>
  ```
- [ ] Call OSRM Route Service:
  ```
  https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson
  ```
  - Coordinates are `lon,lat` pairs separated by `;` (NOT lat,lon -- this is the #1 gotcha)
  - Pass mission centroids in priority order
  - Parse `response.routes[0].geometry` (already GeoJSON), `.distance` (meters), `.duration` (seconds)

- [ ] When user clicks "Optimize Route":
  - Fetch route from OSRM using mission centroids
  - Add route as a GeoJSON line layer on the map:
    ```javascript
    paint: {
      'line-color': '#00ffaa',
      'line-width': 3,
      'line-dasharray': [2, 1],
      'line-opacity': 0
    }
    ```
  - Animate the route drawing progressively (or just fade it in with `line-opacity-transition`)
  - Add a glow effect: wider line underneath with `line-blur: 5` and `line-opacity: 0.2`
  - Show summary: "Optimal route: 8.2 km | 22 min"

- [ ] Add numbered markers at each zone along the route (priority order)

- [ ] **Fallback:** If OSRM is down during demo, draw straight lines between centroids and hardcode distance/time. Nobody will notice in a 3-minute demo.

### Hour 14-18: Integration with Person A's Backend

- [ ] Create a data service layer with a toggle:
  ```typescript
  const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  export async function analyzeField(aoi: GeoJSON.Polygon, dates: { start: string; end: string }) {
    if (USE_MOCK) {
      const { default: data } = await import('../mocks/mockAnalyze.json');
      return data as AnalyzeResponse;
    }
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aoi, date_start: dates.start, date_end: dates.end }),
    });
    return res.json() as Promise<AnalyzeResponse>;
  }
  ```
- [ ] Same pattern for `fetchWeather()` and `fetchMissions()`
- [ ] Test with Person A's live API. If shapes don't match, coordinate fixes.
- [ ] **Keep mock mode working.** Even after integration, you should be able to switch back to mocks instantly by setting `VITE_USE_MOCK=true`.

### Hour 18-24: Polish + Edge Cases

- [ ] Loading states: skeleton screens or spinners while waiting for API responses
- [ ] Error states: if API fails, show "Using cached data" and fall back to mocks gracefully
- [ ] Responsive check: make sure the layout works on the demo laptop's resolution (probably 1920x1080 or 2560x1440 on a projector)
- [ ] Typography audit: consistent font sizes, weights, spacing
- [ ] Color audit: consistent red for stress, green for healthy/routes, amber for warnings
- [ ] Animation polish: run the full sequence 10 times, fix any jank or timing issues
- [ ] Map interactions: clicking a hotspot polygon should highlight it and scroll the mission list to that zone
- [ ] Optional: add a subtle grid/scanline overlay on the map for extra "ops center" aesthetic

### Hour 24-30: Demo Hardening

- [ ] Write a `demo.ts` config file with all pre-set values:
  - Default center coordinates
  - Default field boundary
  - Default date range
  - This way the demo starts in the perfect state every time, no manual setup needed
- [ ] Test the full demo flow 10 times back to back
- [ ] Time the flow: should be completable in under 3 minutes
- [ ] Test with wifi off (mock mode must work perfectly offline)
- [ ] Test on the actual demo laptop if possible
- [ ] Optional: add keyboard shortcuts for demo flow (press 1 = analyze, 2 = weather, 3 = missions, 4 = route, 5 = ticket) so you can advance without precise mouse clicks on stage

### Hour 30+: Practice

- [ ] Run the demo with Person A watching. They handle the talking, you handle the clicking. Or vice versa.
- [ ] Time it. Cut anything that takes more than 10 seconds to explain.
- [ ] Prepare for the "what if" moments: what if the API is slow? (mocks kick in), what if the route doesn't load? (skip to ticket), what if someone asks "is this real data?" (Person A answers).

---

## What You Deliver

A React app at `http://localhost:5173` that:

1. Shows a dark satellite map centered on a Yolo County almond field
2. On "Analyze" click: darkens, sweeps camera, reveals red stress clusters with pulsing dots
3. On "Explain" click: shows weather context with heat spike timeline
4. On "Generate Missions" click: shows prioritized scout zone cards with checklists
5. On "Optimize Route" click: draws a real road route between zones on the map
6. On "Create Ticket" click: shows a mobile-style field checklist with photo upload simulation

Works fully with mock data. Works with Person A's backend when available. Toggle is one env variable.

---

## If Things Go Wrong

| Problem | Fallback |
|---|---|
| MapLibre animations are janky | Reduce pitch to 0 (2D view), simplify to just opacity fade, remove pulsing dots |
| EOX satellite tiles are slow/down | Use ESRI World Imagery: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` or CARTO dark: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` |
| OSRM is down | Draw straight lines between centroids. Hardcode "8.2 km, 22 min" |
| Person A's backend isn't ready | Use mocks for the demo. They look identical. |
| Integration shapes don't match | Keep using mocks. Fix shape mismatches if time allows, otherwise ship with mocks. |

---

## Key Libraries

```
maplibre-gl              # Map renderer (WebGL, GPU-accelerated)
@vis.gl/react-maplibre   # React wrapper for MapLibre
tailwindcss              # Styling
```

Optional but recommended:
```
framer-motion            # For side panel transitions (if you want smoother React animations)
recharts                 # For the weather temperature chart (lightweight)
```

Don't install anything else unless you absolutely need it. Every dependency is a potential build issue at 3 AM.

---

## Visual Reference

**Color palette:**
- Background: `#0f172a` (slate-900) or `#111827` (gray-900)
- Text: `#f1f5f9` (slate-100)
- Stress high: `#ef4444` (red-500)
- Stress medium: `#f59e0b` (amber-500)
- Stress low: `#eab308` (yellow-500)
- Route/healthy: `#10b981` (emerald-500) or `#00ffaa`
- Accent: `#3b82f6` (blue-500) for interactive elements
- Panel borders: `#1e293b` (slate-800)

**Typography:**
- Headers: Inter or system sans-serif, semibold
- Data values: JetBrains Mono or system monospace
- Body: Inter, regular, `text-sm`

**Map layers (bottom to top):**
1. Satellite raster (darkened)
2. Field boundary outline (subtle white/gray dashed)
3. Hotspot fill (red, semi-transparent)
4. Hotspot outline (red, solid)
5. Route line glow (green, blurred)
6. Route line (green, dashed)
7. Zone markers (numbered circles)
8. Pulsing dots (canvas-rendered)
