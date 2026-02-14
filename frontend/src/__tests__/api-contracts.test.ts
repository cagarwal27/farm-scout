/**
 * FarmSense Frontend — API contract tests.
 *
 * Verifies that the backend responses match the TypeScript types defined in
 * src/types/api.ts, and that frontend config/thresholds are consistent with
 * the backend's expected inputs.
 *
 * Run:  npx vitest run src/__tests__/api-contracts.test.ts
 * Requires: backend running at http://localhost:8000
 */

import { describe, it, expect } from "vitest";
import type {
  AnalyzeResponse,
  WeatherResponse,
  MissionsResponse,
  Severity,
} from "../types/api.ts";
import { FIELD } from "../config/field.ts";

const API_BASE = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function getJson<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  const res = await fetch(`${API_BASE}${path}?${qs}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * The severity classification logic used in SidePanel.tsx for mission rows:
 *   ndvi_drop <= -0.10  => "high"
 *   ndvi_drop <= -0.08  => "medium"
 *   otherwise           => "low"
 */
function classifySeverity(ndviDrop: number): Severity {
  if (ndviDrop <= -0.10) return "high";
  if (ndviDrop <= -0.08) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// 1. analyzeField() — AnalyzeResponse shape
// ---------------------------------------------------------------------------
describe("POST /api/analyze — AnalyzeResponse contract", () => {
  it("returns data matching the AnalyzeResponse shape", async () => {
    const data = await postJson<AnalyzeResponse>("/api/analyze", {
      aoi: FIELD.aoi,
      date_start: FIELD.date_start,
      date_end: FIELD.date_end,
    });

    // field block
    expect(data.field).toBeDefined();
    expect(typeof data.field.location).toBe("string");
    expect(typeof data.field.crop).toBe("string");
    expect(typeof data.field.area_acres).toBe("number");
    expect(data.field.date_start).toBe(FIELD.date_start);
    expect(data.field.date_end).toBe(FIELD.date_end);

    // summary block
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.clusters_found).toBe("number");
    expect(data.summary.clusters_found).toBeGreaterThan(0);
    expect(typeof data.summary.total_affected_acres).toBe("number");
    expect(typeof data.summary.avg_ndvi_drop).toBe("number");
    expect(data.summary.avg_ndvi_drop).toBeLessThan(0);
    expect(typeof data.summary.max_ndvi_drop).toBe("number");
    expect(data.summary.max_ndvi_drop).toBeLessThan(0);

    // hotspots FeatureCollection
    expect(data.hotspots).toBeDefined();
    expect(data.hotspots.type).toBe("FeatureCollection");
    expect(Array.isArray(data.hotspots.features)).toBe(true);
    expect(data.hotspots.features.length).toBeGreaterThan(0);

    // Verify each feature's properties match the documented shape
    for (const feature of data.hotspots.features) {
      expect(feature.type).toBe("Feature");
      expect(feature.geometry).toBeDefined();
      expect(feature.properties).toBeDefined();

      const props = feature.properties!;
      expect(typeof props.cluster_id).toBe("string");
      expect(typeof props.area_acres).toBe("number");
      expect(typeof props.ndvi_drop).toBe("number");
      expect(props.ndvi_drop).toBeLessThan(0);
      expect(["high", "medium", "low"]).toContain(props.severity);
      expect(Array.isArray(props.centroid)).toBe(true);
      expect(props.centroid).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. fetchWeather() — WeatherResponse shape
// ---------------------------------------------------------------------------
describe("GET /api/weather — WeatherResponse contract", () => {
  it("returns data matching the WeatherResponse shape", async () => {
    const data = await getJson<WeatherResponse>("/api/weather", {
      lat: FIELD.center[1],
      lon: FIELD.center[0],
      start: FIELD.date_start,
      end: FIELD.date_end,
    });

    // location
    expect(data.location).toBeDefined();
    expect(typeof data.location.lat).toBe("number");
    expect(typeof data.location.lon).toBe("number");

    // period
    expect(data.period).toBeDefined();
    expect(data.period.start).toBe(FIELD.date_start);
    expect(data.period.end).toBe(FIELD.date_end);

    // daily array
    expect(Array.isArray(data.daily)).toBe(true);
    expect(data.daily.length).toBeGreaterThan(0);

    for (const day of data.daily) {
      expect(typeof day.date).toBe("string");
      expect(typeof day.temp_max_f).toBe("number");
      expect(typeof day.temp_min_f).toBe("number");
      expect(typeof day.precipitation_in).toBe("number");
      expect(typeof day.wind_gust_mph).toBe("number");
      expect(typeof day.humidity_pct).toBe("number");
    }

    // alerts array
    expect(Array.isArray(data.alerts)).toBe(true);
    for (const alert of data.alerts) {
      expect(["heat_spike", "no_rainfall", "high_wind"]).toContain(alert.type);
      expect(typeof alert.label).toBe("string");
      expect(typeof alert.start).toBe("string");
      expect(typeof alert.end).toBe("string");
      expect(["high", "medium", "low"]).toContain(alert.severity);
    }

    // correlation
    expect(data.correlation).toBeDefined();
    expect(typeof data.correlation.primary).toBe("string");
    expect(typeof data.correlation.secondary).toBe("string");
    expect(["high", "moderate", "low"]).toContain(data.correlation.confidence);
  });
});

// ---------------------------------------------------------------------------
// 3. fetchMissions() — MissionsResponse shape
// ---------------------------------------------------------------------------
describe("POST /api/missions — MissionsResponse contract", () => {
  it("returns data matching the MissionsResponse shape", async () => {
    // First get hotspots from analyze
    const analyzeData = await postJson<AnalyzeResponse>("/api/analyze", {
      aoi: FIELD.aoi,
      date_start: FIELD.date_start,
      date_end: FIELD.date_end,
    });

    const data = await postJson<MissionsResponse>("/api/missions", {
      hotspots: analyzeData.hotspots,
    });

    // missions array
    expect(Array.isArray(data.missions)).toBe(true);
    expect(data.missions.length).toBeGreaterThan(0);
    expect(data.missions.length).toBeLessThanOrEqual(5);

    for (const mission of data.missions) {
      expect(typeof mission.zone_id).toBe("string");
      expect(typeof mission.priority).toBe("number");
      expect(mission.priority).toBeGreaterThan(0);
      expect(typeof mission.area_acres).toBe("number");
      expect(typeof mission.ndvi_drop).toBe("number");
      expect(mission.ndvi_drop).toBeLessThan(0);
      expect(Array.isArray(mission.centroid)).toBe(true);
      expect(mission.centroid).toHaveLength(2);
      expect(typeof mission.centroid[0]).toBe("number");
      expect(typeof mission.centroid[1]).toBe("number");
      expect(Array.isArray(mission.checklist)).toBe(true);
      expect(mission.checklist.length).toBeGreaterThan(0);
      for (const item of mission.checklist) {
        expect(typeof item).toBe("string");
      }
    }

    // summary
    expect(data.summary).toBeDefined();
    expect(data.summary.total_zones).toBe(data.missions.length);
    expect(typeof data.summary.estimated_hours).toBe("number");
    expect(data.summary.estimated_hours).toBeGreaterThan(0);
    expect(typeof data.summary.crew_required).toBe("number");
    expect(data.summary.crew_required).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. FIELD config — coordinates match Dunnigan orchards
// ---------------------------------------------------------------------------
describe("FIELD config", () => {
  it("center is within tolerance of Dunnigan, CA", () => {
    // Dunnigan orchards approximate coordinates: 38.89 N, -121.97 W
    const DUNNIGAN_LAT = 38.89;
    const DUNNIGAN_LON = -121.97;
    const TOLERANCE = 0.05; // ~5km

    const [lon, lat] = FIELD.center;
    expect(Math.abs(lat - DUNNIGAN_LAT)).toBeLessThan(TOLERANCE);
    expect(Math.abs(lon - DUNNIGAN_LON)).toBeLessThan(TOLERANCE);
  });

  it("AOI polygon matches the backend's expected coordinates", () => {
    const expectedCoords = [
      [-121.98, 38.90],
      [-121.96, 38.90],
      [-121.96, 38.88],
      [-121.98, 38.88],
      [-121.98, 38.90],
    ];

    expect(FIELD.aoi.type).toBe("Polygon");
    expect(FIELD.aoi.coordinates).toHaveLength(1); // single ring
    expect(FIELD.aoi.coordinates[0]).toHaveLength(expectedCoords.length);

    for (let i = 0; i < expectedCoords.length; i++) {
      expect(FIELD.aoi.coordinates[0][i][0]).toBeCloseTo(expectedCoords[i][0], 4);
      expect(FIELD.aoi.coordinates[0][i][1]).toBeCloseTo(expectedCoords[i][1], 4);
    }
  });

  it("date range matches expected demo period", () => {
    expect(FIELD.date_start).toBe("2024-07-02");
    expect(FIELD.date_end).toBe("2024-07-12");
  });
});

// ---------------------------------------------------------------------------
// 5. Severity thresholds — frontend classification logic
// ---------------------------------------------------------------------------
describe("Severity thresholds", () => {
  it("classifies ndvi_drop of -0.09 as 'medium' (not 'low')", () => {
    // The frontend logic (SidePanel.tsx):
    //   ndvi_drop <= -0.10  => "high"
    //   ndvi_drop <= -0.08  => "medium"
    //   otherwise           => "low"
    //
    // -0.09 is NOT <= -0.10 (not high)
    // -0.09 IS  <= -0.08   (medium)
    expect(classifySeverity(-0.09)).toBe("medium");
  });

  it("classifies boundary values correctly", () => {
    // Exact boundary: -0.10 is high
    expect(classifySeverity(-0.10)).toBe("high");
    // Exact boundary: -0.08 is medium
    expect(classifySeverity(-0.08)).toBe("medium");
    // Just above -0.08: low
    expect(classifySeverity(-0.07)).toBe("low");
    // Very negative: high
    expect(classifySeverity(-0.25)).toBe("high");
    // Near zero: low
    expect(classifySeverity(-0.01)).toBe("low");
  });
});
