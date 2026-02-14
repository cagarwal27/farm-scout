/**
 * Shared field configuration.
 * Change this once → FieldInfo, API calls, and MapView all update.
 * When the backend is live, the FieldInfo panel reads from the
 * analyzeResponse instead, but these values are used for:
 *   - The AOI sent to POST /api/analyze
 *   - The coords sent to GET /api/weather
 *   - The map's initial center + zoom
 *   - The field boundary outline
 *   - The pre-analysis FieldInfo display
 */
export const FIELD = {
  name: "Dunnigan, Yolo County, CA",
  crop: "Mixed Orchard",
  area_acres: 932.6,
  date_start: "2024-07-02",
  date_end: "2024-07-12",

  /** Map center [lon, lat] — Dunnigan orchards */
  center: [-121.97, 38.89] as [number, number],
  zoom: 13,

  /** AOI polygon sent to POST /api/analyze — matches backend precache AOI */
  aoi: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-121.98, 38.90],
        [-121.96, 38.90],
        [-121.96, 38.88],
        [-121.98, 38.88],
        [-121.98, 38.90],
      ],
    ],
  },
} as const;
