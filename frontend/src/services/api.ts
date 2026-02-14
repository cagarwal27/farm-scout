import type { AnalyzeResponse, WeatherResponse, MissionsResponse } from "../types/api";
import type { FieldConfig } from "../config/field";

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function analyzeField(config: FieldConfig): Promise<AnalyzeResponse> {
  if (USE_MOCK) {
    const { default: data } = await import("../mocks/mockAnalyze.json");
    return data as AnalyzeResponse;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aoi: config.aoi,
        date_start: config.date_start,
        date_end: config.date_end,
        location_name: config.name,
        crop_type: config.crop,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `analyze failed: ${res.status}`);
    }
    return res.json() as Promise<AnalyzeResponse>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWeather(config: FieldConfig): Promise<WeatherResponse> {
  if (USE_MOCK) {
    const { default: data } = await import("../mocks/mockWeather.json");
    return data as WeatherResponse;
  }
  const params = new URLSearchParams({
    lat: String(config.center[1]),
    lon: String(config.center[0]),
    start: config.date_start,
    end: config.date_end,
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

// ---------------------------------------------------------------------------
// Field monitoring API
// ---------------------------------------------------------------------------

export interface SavedFieldInfo {
  field_id: string;
  location_name: string;
  crop_type: string;
  created_at: string;
  last_checked: string | null;
  last_scene_date: string | null;
  status: string;
  has_result: boolean;
}

export async function saveField(config: FieldConfig): Promise<{ field_id: string }> {
  const res = await fetch(`${API_BASE}/api/fields`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aoi: config.aoi,
      location_name: config.name,
      crop_type: config.crop,
    }),
  });
  if (!res.ok) throw new Error(`save field failed: ${res.status}`);
  return res.json();
}

export async function listFields(): Promise<SavedFieldInfo[]> {
  const res = await fetch(`${API_BASE}/api/fields`);
  if (!res.ok) throw new Error(`list fields failed: ${res.status}`);
  const data = await res.json();
  return data.fields;
}

export async function loadFieldLatest(fieldId: string): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/fields/${fieldId}/latest`);
  if (!res.ok) throw new Error(`load field failed: ${res.status}`);
  return res.json() as Promise<AnalyzeResponse>;
}

export async function deleteField(fieldId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/fields/${fieldId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete field failed: ${res.status}`);
}
