"""
FarmSense Backend — FastAPI server.
Serves 3 endpoints matching the sacred frontend contracts + health check,
plus field monitoring endpoints for auto-refresh.

Run: uvicorn main:app --reload --port 8000 --timeout-keep-alive 120

Environment variables:
  DEMO_MODE=true   — always serve best-looking cached results (default: false)
"""

import json
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from weather import fetch_weather
from missions import generate_missions
from pipeline import run_satellite_pipeline
from monitor import FieldMonitor

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CACHE_DIR = Path(__file__).parent / "cache"
DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() == "true"

# ---------------------------------------------------------------------------
# Field monitor instance
# ---------------------------------------------------------------------------
monitor = FieldMonitor(check_interval_hours=6)

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    CACHE_DIR.mkdir(exist_ok=True)
    analyze_cache = CACHE_DIR / "analyze_demo.json"
    weather_cache = CACHE_DIR / "weather_fallback.json"
    print(f"[startup] DEMO_MODE={DEMO_MODE}")
    print(f"[startup] Analyze cache: {'OK' if analyze_cache.exists() else 'MISSING'}")
    print(f"[startup] Weather cache: {'OK' if weather_cache.exists() else 'MISSING'}")
    print(f"[startup] Monitored fields: {len(monitor.saved_fields)}")
    if not DEMO_MODE:
        monitor.start()
        print("[startup] Field monitor started")
    yield
    monitor.stop()

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="FarmSense API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler — never return raw 500s
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )

# ---------------------------------------------------------------------------
# Request models with validation
# ---------------------------------------------------------------------------
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

class AOIGeometry(BaseModel):
    type: str = "Polygon"
    coordinates: list

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v):
        if not v or not isinstance(v, list):
            raise ValueError("coordinates must be a non-empty list")
        if not v[0] or len(v[0]) < 4:
            raise ValueError("Polygon ring must have at least 4 coordinate pairs")
        return v

class AnalyzeRequest(BaseModel):
    aoi: AOIGeometry
    date_start: str
    date_end: str
    location_name: str = ""
    crop_type: str = ""

    @field_validator("date_start", "date_end")
    @classmethod
    def validate_date(cls, v):
        if not DATE_RE.match(v):
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v

class MissionsRequest(BaseModel):
    hotspots: dict

    @field_validator("hotspots")
    @classmethod
    def validate_hotspots(cls, v):
        if "type" not in v or v["type"] != "FeatureCollection":
            raise ValueError("hotspots must be a GeoJSON FeatureCollection")
        if "features" not in v:
            raise ValueError("hotspots must contain a 'features' array")
        return v

class SaveFieldRequest(BaseModel):
    aoi: AOIGeometry
    location_name: str = ""
    crop_type: str = ""

# ---------------------------------------------------------------------------
# Demo AOI detection
# ---------------------------------------------------------------------------
DEMO_AOIS = [
    {"name": "almonds_knights_landing", "center": (-121.71, 38.81), "file": "analyze_demo.json"},
    {"name": "walnuts_woodland_south", "center": (-121.77, 38.65), "file": "analyze_woodland_south_walnuts.json"},
    {"name": "orchards_dunnigan", "center": (-121.97, 38.89), "file": "analyze_dunnigan_orchards.json"},
    {"name": "almonds_original", "center": (-121.87, 38.72), "file": "analyze_demo.json"},
]
DEMO_AOI_TOLERANCE = 0.05  # degrees — ~5km radius


def _find_cached_aoi(aoi: AOIGeometry) -> Path | None:
    """Find the best matching cached AOI result."""
    try:
        coords = aoi.coordinates[0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        center_lon = sum(lons) / len(lons)
        center_lat = sum(lats) / len(lats)
    except (IndexError, TypeError, ZeroDivisionError):
        return None

    for demo in DEMO_AOIS:
        dlon, dlat = demo["center"]
        if (
            abs(center_lon - dlon) < DEMO_AOI_TOLERANCE
            and abs(center_lat - dlat) < DEMO_AOI_TOLERANCE
        ):
            path = CACHE_DIR / demo["file"]
            if path.exists():
                return path

    return None

# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    """Health check for frontend connectivity test."""
    analyze_ok = (CACHE_DIR / "analyze_demo.json").exists()
    weather_ok = (CACHE_DIR / "weather_fallback.json").exists()
    return {
        "status": "ok",
        "demo_mode": DEMO_MODE,
        "live_pipeline": not DEMO_MODE,
        "monitored_fields": len(monitor.saved_fields),
        "cache": {
            "analyze": analyze_ok,
            "weather": weather_ok,
        },
    }


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    """
    Analyze field health — returns NDVI hotspots for the given AOI and date range.
    In demo mode: returns pre-cached results.
    In live mode: runs the satellite pipeline on-demand.
    """
    # Try to find a matching cached AOI
    cache_file = _find_cached_aoi(req.aoi)

    # In demo mode, always fall back to primary demo cache
    if cache_file is None and DEMO_MODE:
        cache_file = CACHE_DIR / "analyze_demo.json"

    if cache_file is not None and cache_file.exists():
        data = json.loads(cache_file.read_text())
        data["field"]["date_start"] = req.date_start
        data["field"]["date_end"] = req.date_end
        data["source"] = "cached"
        return data

    # Live mode: run the satellite pipeline
    if not DEMO_MODE:
        try:
            result = run_satellite_pipeline(
                aoi_polygon=req.aoi.model_dump(),
                date_start=req.date_start,
                date_end=req.date_end,
                location_name=req.location_name,
                crop_type=req.crop_type,
            )
            result["source"] = "live"
            return result
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Satellite pipeline error: {e}",
            )

    raise HTTPException(
        status_code=503,
        detail="Satellite analysis pipeline not available. Use demo AOI coordinates.",
    )


@app.get("/api/weather")
def weather(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
):
    """
    Fetch historical weather data. Calls real Open-Meteo API with cache fallback.
    """
    if not DATE_RE.match(start) or not DATE_RE.match(end):
        raise HTTPException(status_code=400, detail="Dates must be in YYYY-MM-DD format")
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid lat/lon coordinates")

    try:
        return fetch_weather(lat, lon, start, end)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Weather service unavailable: {e}")


@app.post("/api/missions")
def create_missions(req: MissionsRequest):
    """
    Generate prioritized scout missions from hotspot FeatureCollection.
    Real logic: sorts by severity * area, assigns checklists, computes crew needs.
    """
    try:
        return generate_missions(req.hotspots)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mission generation failed: {e}")


# ---------------------------------------------------------------------------
# Field monitoring endpoints
# ---------------------------------------------------------------------------

@app.post("/api/fields")
def save_field(req: SaveFieldRequest):
    """Save a field for background monitoring."""
    field_id = monitor.add_field(
        aoi_polygon=req.aoi.model_dump(),
        location_name=req.location_name,
        crop_type=req.crop_type,
    )
    return {"field_id": field_id, "status": "saved"}


@app.get("/api/fields")
def list_fields():
    """List all monitored fields."""
    return {"fields": monitor.list_fields()}


@app.get("/api/fields/{field_id}/latest")
def get_field_latest(field_id: str):
    """Get the most recent analysis for a monitored field."""
    result = monitor.get_latest(field_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No analysis available for field {field_id}. "
            "The monitor may not have run yet.",
        )
    result["source"] = "monitored"
    return result


@app.delete("/api/fields/{field_id}")
def delete_field(field_id: str):
    """Stop monitoring a field."""
    if not monitor.remove_field(field_id):
        raise HTTPException(status_code=404, detail=f"Field {field_id} not found")
    return {"status": "removed", "field_id": field_id}
