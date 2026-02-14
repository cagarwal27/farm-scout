"""
Weather module — calls the real Open-Meteo Historical API.
No API key needed. Returns data matching the frontend WeatherResponse contract.
"""

import requests
import json
import os
from pathlib import Path

CACHE_DIR = Path(__file__).parent / "cache"
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_weather(lat: float, lon: float, start: str, end: str) -> dict:
    """
    Fetch historical weather from Open-Meteo and transform to our contract format.
    Falls back to cached data if the API is unreachable.
    """
    cache_key = f"weather_{lat}_{lon}_{start}_{end}.json"
    cache_path = CACHE_DIR / cache_key

    try:
        data = _call_open_meteo(lat, lon, start, end)
        result = _transform_response(lat, lon, start, end, data)
        # Cache successful result
        CACHE_DIR.mkdir(exist_ok=True)
        cache_path.write_text(json.dumps(result, indent=2))
        return result
    except Exception as e:
        print(f"[weather] Open-Meteo API failed: {e}, trying cache...")
        # Try exact cache match
        if cache_path.exists():
            return json.loads(cache_path.read_text())
        # Try any cached weather file
        fallback = CACHE_DIR / "weather_fallback.json"
        if fallback.exists():
            return json.loads(fallback.read_text())
        raise RuntimeError(f"Weather API failed and no cache available: {e}")


def _call_open_meteo(lat: float, lon: float, start: str, end: str) -> dict:
    """Raw API call to Open-Meteo Historical endpoint."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": ",".join([
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "wind_gusts_10m_max",
            "relative_humidity_2m_mean",
        ]),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "America/Los_Angeles",
    }
    resp = requests.get(OPEN_METEO_URL, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _transform_response(lat: float, lon: float, start: str, end: str, raw: dict) -> dict:
    """Transform Open-Meteo response into our contract format."""
    daily_raw = raw.get("daily", {})
    dates = daily_raw.get("time", [])
    temp_maxs = daily_raw.get("temperature_2m_max", [])
    temp_mins = daily_raw.get("temperature_2m_min", [])
    precips = daily_raw.get("precipitation_sum", [])
    wind_gusts = daily_raw.get("wind_gusts_10m_max", [])
    humidities = daily_raw.get("relative_humidity_2m_mean", [])

    daily = []
    for i in range(len(dates)):
        daily.append({
            "date": dates[i],
            "temp_max_f": round(temp_maxs[i], 1) if temp_maxs[i] is not None else 0.0,
            "temp_min_f": round(temp_mins[i], 1) if temp_mins[i] is not None else 0.0,
            "precipitation_in": round(precips[i], 2) if precips[i] is not None else 0.0,
            "wind_gust_mph": round(wind_gusts[i], 1) if wind_gusts[i] is not None else 0.0,
            "humidity_pct": round(humidities[i]) if humidities[i] is not None else 0,
        })

    alerts = _detect_alerts(daily)
    correlation = _compute_correlation(alerts)

    return {
        "location": {"lat": lat, "lon": lon},
        "period": {"start": start, "end": end},
        "daily": daily,
        "alerts": alerts,
        "correlation": correlation,
    }


def _detect_alerts(daily: list[dict]) -> list[dict]:
    """Detect weather alerts from daily data."""
    alerts = []

    # Heat spike: 3+ consecutive days where temp_max > 100
    consecutive_hot = 0
    hot_start = None
    hot_end = None
    for day in daily:
        if day["temp_max_f"] > 100:
            if consecutive_hot == 0:
                hot_start = day["date"]
            consecutive_hot += 1
            hot_end = day["date"]
        else:
            if consecutive_hot >= 3:
                alerts.append({
                    "type": "heat_spike",
                    "label": f"{consecutive_hot}-day heat spike > 100\u00b0F",
                    "start": hot_start,
                    "end": hot_end,
                    "severity": "high",
                })
            consecutive_hot = 0
            hot_start = None
    # Check end of data
    if consecutive_hot >= 3:
        alerts.append({
            "type": "heat_spike",
            "label": f"{consecutive_hot}-day heat spike > 100\u00b0F",
            "start": hot_start,
            "end": hot_end,
            "severity": "high",
        })

    # High wind: any day with wind_gust > 30 mph
    wind_days = [d for d in daily if d["wind_gust_mph"] > 30]
    if wind_days:
        alerts.append({
            "type": "high_wind",
            "label": "Wind gusts > 30 mph",
            "start": wind_days[0]["date"],
            "end": wind_days[-1]["date"],
            "severity": "medium",
        })

    # No rainfall: 7+ consecutive days with 0 precipitation
    no_rain_count = 0
    rain_start = None
    for day in daily:
        if day["precipitation_in"] == 0.0:
            if no_rain_count == 0:
                rain_start = day["date"]
            no_rain_count += 1
        else:
            if no_rain_count >= 7:
                alerts.append({
                    "type": "no_rainfall",
                    "label": f"No rainfall for {no_rain_count} days",
                    "start": rain_start,
                    "end": daily[daily.index(day) - 1]["date"],
                    "severity": "medium",
                })
            no_rain_count = 0
    if no_rain_count >= 7:
        alerts.append({
            "type": "no_rainfall",
            "label": f"No rainfall for {no_rain_count} days",
            "start": rain_start,
            "end": daily[-1]["date"],
            "severity": "medium",
        })

    return alerts


def _compute_correlation(alerts: list[dict]) -> dict:
    """Simple rule-based correlation (not ML)."""
    alert_types = {a["type"] for a in alerts}

    if "heat_spike" in alert_types:
        primary = "Heat stress"
    elif "no_rainfall" in alert_types:
        primary = "Drought stress"
    else:
        primary = "Unknown stress factor"

    if "no_rainfall" in alert_types and primary != "Drought stress":
        secondary = "Irrigation irregularity"
    elif "high_wind" in alert_types:
        secondary = "Wind damage"
    else:
        secondary = "Possible irrigation irregularity"

    return {
        "primary": primary,
        "secondary": secondary,
        "confidence": "moderate",
    }
