import type { AnalyzeResponse, WeatherResponse, MissionsResponse } from "../types/api";
import { FIELD } from "../config/field";

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
      aoi: FIELD.aoi,
      date_start: FIELD.date_start,
      date_end: FIELD.date_end,
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
    lat: String(FIELD.center[1]),
    lon: String(FIELD.center[0]),
    start: FIELD.date_start,
    end: FIELD.date_end,
  });
  const res = await fetch(`${API_BASE}/api/weather?${params}`);
  if (!res.ok) throw new Error(`weather failed: ${res.status}`);
  return res.json() as Promise<WeatherResponse>;
}

export async function fetchMissions(
  hotspots: GeoJSON.FeatureCollection,
  weatherData?: WeatherResponse | null
): Promise<MissionsResponse> {
  if (USE_MOCK) {
    const { default: data } = await import("../mocks/mockMissions.json");
    return data as MissionsResponse;
  }
  const body: Record<string, unknown> = { hotspots };
  if (weatherData) {
    body.weather_context = weatherData;
  }
  const res = await fetch(`${API_BASE}/api/missions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`missions failed: ${res.status}`);
  return res.json() as Promise<MissionsResponse>;
}
