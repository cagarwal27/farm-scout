import type { AnalyzeResponse, WeatherResponse, MissionsResponse } from "../types/api";

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function analyzeField(): Promise<AnalyzeResponse> {
  if (USE_MOCK) {
    const { default: data } = await import("../mocks/mockAnalyze.json");
    return data as AnalyzeResponse;
  }
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aoi: {
        type: "Polygon",
        coordinates: [[
          [-121.88, 38.73],
          [-121.86, 38.73],
          [-121.86, 38.71],
          [-121.88, 38.71],
          [-121.88, 38.73],
        ]],
      },
      date_start: "2024-07-01",
      date_end: "2024-07-14",
    }),
  });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  return res.json() as Promise<AnalyzeResponse>;
}

export async function fetchWeather(): Promise<WeatherResponse> {
  if (USE_MOCK) {
    const { default: data } = await import("../mocks/mockWeather.json");
    return data as WeatherResponse;
  }
  const params = new URLSearchParams({
    lat: "38.72",
    lon: "-121.87",
    start: "2024-07-01",
    end: "2024-07-14",
  });
  const res = await fetch(`${API_BASE}/api/weather?${params}`);
  if (!res.ok) throw new Error(`weather failed: ${res.status}`);
  return res.json() as Promise<WeatherResponse>;
}

export async function fetchMissions(
  hotspots: GeoJSON.FeatureCollection
): Promise<MissionsResponse> {
  if (USE_MOCK) {
    const { default: data } = await import("../mocks/mockMissions.json");
    return data as MissionsResponse;
  }
  const res = await fetch(`${API_BASE}/api/missions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotspots }),
  });
  if (!res.ok) throw new Error(`missions failed: ${res.status}`);
  return res.json() as Promise<MissionsResponse>;
}
