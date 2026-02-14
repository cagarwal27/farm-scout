/** Matches POST /api/analyze response — Person A's backend contract */
export interface AnalyzeResponse {
  field: {
    location: string;
    crop: string;
    area_acres: number;
    date_start: string;
    date_end: string;
  };
  summary: {
    clusters_found: number;
    total_affected_acres: number;
    avg_ndvi_drop: number;
    max_ndvi_drop: number;
  };
  hotspots: GeoJSON.FeatureCollection;
  // Each feature.properties:
  //   cluster_id: string ("A", "B", ...)
  //   area_acres: number
  //   ndvi_drop: number (negative)
  //   severity: "high" | "medium" | "low"
  //   centroid: [lon, lat]
}

/** Matches GET /api/weather response — Person A's backend contract */
export interface WeatherResponse {
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

/** Matches POST /api/missions response — Person A's backend contract */
export interface MissionsResponse {
  missions: Array<{
    zone_id: string;
    priority: number;
    area_acres: number;
    ndvi_drop: number;
    centroid: [number, number];
    checklist: string[];
  }>;
  summary: {
    total_zones: number;
    estimated_hours: number;
    crew_required: number;
  };
}

/** The 5 sequential panel states in the demo flow */
export type PanelState =
  | "field-info"
  | "analysis"
  | "weather"
  | "missions"
  | "ticket";

/** Severity levels used across the app */
export type Severity = "high" | "medium" | "low";
