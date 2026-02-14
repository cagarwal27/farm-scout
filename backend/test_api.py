"""
FarmSense Backend — Integration tests for all 3 API endpoints.
Tests the running backend at localhost:8000 using Python's built-in unittest.

Run:  python -m unittest test_api -v
Requires: backend running at http://localhost:8000
"""

import json
import unittest
import urllib.request
import urllib.error
import urllib.parse

BASE_URL = "http://localhost:8000"

# --- Shared test data matching the frontend FIELD config ---

AOI_POLYGON = [
    [-121.72, 38.82],
    [-121.70, 38.82],
    [-121.70, 38.80],
    [-121.72, 38.80],
    [-121.72, 38.82],
]

DATE_START = "2024-07-02"
DATE_END = "2024-07-12"

WEATHER_LAT = 38.81
WEATHER_LON = -121.71


def _post_json(path: str, body: dict) -> tuple[int, dict]:
    """POST JSON to the backend, return (status_code, parsed_json)."""
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, json.loads(body) if body else {}


def _get_json(path: str, params: dict | None = None) -> tuple[int, dict]:
    """GET from the backend, return (status_code, parsed_json)."""
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, json.loads(body) if body else {}


# ---------------------------------------------------------------------------
# 1. Health endpoint
# ---------------------------------------------------------------------------
class TestHealthEndpoint(unittest.TestCase):
    """GET /api/health"""

    def test_health_returns_ok(self):
        status, data = _get_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ok")
        self.assertIn("demo_mode", data)
        self.assertIn("cache", data)


# ---------------------------------------------------------------------------
# 2. Analyze endpoint
# ---------------------------------------------------------------------------
class TestAnalyzeEndpoint(unittest.TestCase):
    """POST /api/analyze"""

    def test_analyze_success(self):
        body = {
            "aoi": {
                "type": "Polygon",
                "coordinates": [AOI_POLYGON],
            },
            "date_start": DATE_START,
            "date_end": DATE_END,
        }
        status, data = _post_json("/api/analyze", body)
        self.assertEqual(status, 200)

        # --- field block ---
        field = data["field"]
        self.assertIn("location", field)
        self.assertIn("crop", field)
        self.assertIsInstance(field["area_acres"], (int, float))
        self.assertEqual(field["date_start"], DATE_START)
        self.assertEqual(field["date_end"], DATE_END)

        # --- summary block ---
        summary = data["summary"]
        self.assertIsInstance(summary["clusters_found"], int)
        self.assertGreater(summary["clusters_found"], 0)
        self.assertIsInstance(summary["total_affected_acres"], (int, float))
        self.assertIsInstance(summary["avg_ndvi_drop"], (int, float))
        self.assertLess(summary["avg_ndvi_drop"], 0, "avg_ndvi_drop should be negative")
        self.assertIsInstance(summary["max_ndvi_drop"], (int, float))
        self.assertLess(summary["max_ndvi_drop"], 0, "max_ndvi_drop should be negative")

        # --- hotspots GeoJSON ---
        hotspots = data["hotspots"]
        self.assertEqual(hotspots["type"], "FeatureCollection")
        self.assertIsInstance(hotspots["features"], list)
        self.assertGreater(len(hotspots["features"]), 0)

        # Verify each feature has the required properties
        for feature in hotspots["features"]:
            self.assertEqual(feature["type"], "Feature")
            self.assertIn("geometry", feature)
            self.assertIn("properties", feature)

            props = feature["properties"]
            self.assertIn("cluster_id", props)
            self.assertIsInstance(props["cluster_id"], str)
            self.assertIsInstance(props["area_acres"], (int, float))
            self.assertIsInstance(props["ndvi_drop"], (int, float))
            self.assertLess(props["ndvi_drop"], 0)
            self.assertIn(props["severity"], ["high", "medium", "low"])
            self.assertIsInstance(props["centroid"], list)
            self.assertEqual(len(props["centroid"]), 2)

    def test_analyze_bad_date_format_returns_422(self):
        body = {
            "aoi": {
                "type": "Polygon",
                "coordinates": [AOI_POLYGON],
            },
            "date_start": "07-02-2024",  # wrong format
            "date_end": DATE_END,
        }
        status, _ = _post_json("/api/analyze", body)
        self.assertEqual(status, 422)


# ---------------------------------------------------------------------------
# 3. Weather endpoint
# ---------------------------------------------------------------------------
class TestWeatherEndpoint(unittest.TestCase):
    """GET /api/weather"""

    def test_weather_success(self):
        params = {
            "lat": WEATHER_LAT,
            "lon": WEATHER_LON,
            "start": DATE_START,
            "end": DATE_END,
        }
        status, data = _get_json("/api/weather", params)
        self.assertEqual(status, 200)

        # --- location ---
        self.assertAlmostEqual(data["location"]["lat"], WEATHER_LAT, places=2)
        self.assertAlmostEqual(data["location"]["lon"], WEATHER_LON, places=2)

        # --- period ---
        self.assertEqual(data["period"]["start"], DATE_START)
        self.assertEqual(data["period"]["end"], DATE_END)

        # --- daily array ---
        daily = data["daily"]
        self.assertIsInstance(daily, list)
        self.assertGreater(len(daily), 0)

        for day in daily:
            self.assertIn("date", day)
            self.assertIsInstance(day["temp_max_f"], (int, float))
            self.assertIsInstance(day["temp_min_f"], (int, float))
            self.assertIsInstance(day["precipitation_in"], (int, float))
            self.assertIsInstance(day["wind_gust_mph"], (int, float))
            self.assertIsInstance(day["humidity_pct"], (int, float))

        # --- alerts array ---
        alerts = data["alerts"]
        self.assertIsInstance(alerts, list)
        for alert in alerts:
            self.assertIn(alert["type"], ["heat_spike", "no_rainfall", "high_wind"])
            self.assertIn("label", alert)
            self.assertIn("start", alert)
            self.assertIn("end", alert)
            self.assertIn(alert["severity"], ["high", "medium", "low"])

        # --- correlation ---
        correlation = data["correlation"]
        self.assertIn("primary", correlation)
        self.assertIsInstance(correlation["primary"], str)
        self.assertIn("secondary", correlation)
        self.assertIsInstance(correlation["secondary"], str)
        self.assertIn("confidence", correlation)
        self.assertIn(correlation["confidence"], ["high", "moderate", "low"])

    def test_weather_invalid_coords_returns_400(self):
        params = {
            "lat": 999,   # invalid latitude
            "lon": -121.71,
            "start": DATE_START,
            "end": DATE_END,
        }
        status, _ = _get_json("/api/weather", params)
        self.assertEqual(status, 400)


# ---------------------------------------------------------------------------
# 4. Missions endpoint
# ---------------------------------------------------------------------------
class TestMissionsEndpoint(unittest.TestCase):
    """POST /api/missions"""

    def _get_hotspots(self) -> dict:
        """Helper: call analyze to get a real hotspots FeatureCollection."""
        body = {
            "aoi": {
                "type": "Polygon",
                "coordinates": [AOI_POLYGON],
            },
            "date_start": DATE_START,
            "date_end": DATE_END,
        }
        status, data = _post_json("/api/analyze", body)
        self.assertEqual(status, 200, "analyze must succeed to test missions")
        return data["hotspots"]

    def test_missions_success(self):
        hotspots = self._get_hotspots()

        status, data = _post_json("/api/missions", {"hotspots": hotspots})
        self.assertEqual(status, 200)

        # --- missions array (capped at 5) ---
        missions = data["missions"]
        self.assertIsInstance(missions, list)
        self.assertGreater(len(missions), 0)
        self.assertLessEqual(len(missions), 5)

        for mission in missions:
            self.assertIn("zone_id", mission)
            self.assertIsInstance(mission["zone_id"], str)

            self.assertIn("priority", mission)
            self.assertIsInstance(mission["priority"], int)
            self.assertGreater(mission["priority"], 0)

            self.assertIn("area_acres", mission)
            self.assertIsInstance(mission["area_acres"], (int, float))

            self.assertIn("ndvi_drop", mission)
            self.assertIsInstance(mission["ndvi_drop"], (int, float))
            self.assertLess(mission["ndvi_drop"], 0)

            self.assertIn("centroid", mission)
            self.assertIsInstance(mission["centroid"], list)
            self.assertEqual(len(mission["centroid"]), 2)

            self.assertIn("checklist", mission)
            self.assertIsInstance(mission["checklist"], list)
            self.assertGreater(len(mission["checklist"]), 0)
            for item in mission["checklist"]:
                self.assertIsInstance(item, str)

        # --- summary ---
        summary = data["summary"]
        self.assertIn("total_zones", summary)
        self.assertEqual(summary["total_zones"], len(missions))

        self.assertIn("estimated_hours", summary)
        self.assertIsInstance(summary["estimated_hours"], (int, float))
        self.assertGreater(summary["estimated_hours"], 0)

        self.assertIn("crew_required", summary)
        self.assertIsInstance(summary["crew_required"], int)
        self.assertGreater(summary["crew_required"], 0)


# ---------------------------------------------------------------------------
# 5. Full pipeline: analyze -> weather -> missions
# ---------------------------------------------------------------------------
class TestFullPipeline(unittest.TestCase):
    """End-to-end: analyze -> weather -> missions, verifying data flows."""

    def test_pipeline(self):
        # ---- Stage 1: Analyze ----
        analyze_body = {
            "aoi": {
                "type": "Polygon",
                "coordinates": [AOI_POLYGON],
            },
            "date_start": DATE_START,
            "date_end": DATE_END,
        }
        status, analyze_data = _post_json("/api/analyze", analyze_body)
        self.assertEqual(status, 200, "Stage 1 (analyze) failed")
        self.assertIn("hotspots", analyze_data)
        self.assertIn("field", analyze_data)
        self.assertIn("summary", analyze_data)

        hotspots = analyze_data["hotspots"]
        self.assertEqual(hotspots["type"], "FeatureCollection")
        num_clusters = analyze_data["summary"]["clusters_found"]
        self.assertEqual(
            len(hotspots["features"]),
            num_clusters,
            "clusters_found should match number of hotspot features",
        )

        # ---- Stage 2: Weather ----
        weather_params = {
            "lat": WEATHER_LAT,
            "lon": WEATHER_LON,
            "start": DATE_START,
            "end": DATE_END,
        }
        status, weather_data = _get_json("/api/weather", weather_params)
        self.assertEqual(status, 200, "Stage 2 (weather) failed")
        self.assertIn("daily", weather_data)
        self.assertIn("alerts", weather_data)
        self.assertIn("correlation", weather_data)

        # Weather dates should cover our requested period
        daily_dates = [d["date"] for d in weather_data["daily"]]
        self.assertIn(DATE_START, daily_dates, "daily should include start date")
        self.assertIn(DATE_END, daily_dates, "daily should include end date")

        # ---- Stage 3: Missions (fed by analyze hotspots) ----
        status, missions_data = _post_json("/api/missions", {"hotspots": hotspots})
        self.assertEqual(status, 200, "Stage 3 (missions) failed")

        missions = missions_data["missions"]
        self.assertGreater(len(missions), 0)
        self.assertLessEqual(len(missions), 5)

        # Missions should reference zone_ids that exist in the hotspots
        hotspot_ids = {
            f["properties"]["cluster_id"] for f in hotspots["features"]
        }
        mission_ids = {m["zone_id"] for m in missions}
        self.assertTrue(
            mission_ids.issubset(hotspot_ids),
            f"Mission zone_ids {mission_ids} should be a subset of hotspot cluster_ids {hotspot_ids}",
        )

        # Priorities should be sequential starting from 1
        priorities = [m["priority"] for m in missions]
        self.assertEqual(priorities, list(range(1, len(missions) + 1)))

        # Summary total_zones should match missions length
        self.assertEqual(missions_data["summary"]["total_zones"], len(missions))


if __name__ == "__main__":
    unittest.main()
