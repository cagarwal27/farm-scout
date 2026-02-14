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
  name: "Yolo County, CA",
  crop: "Almond",
  area_acres: 932.6,
  date_start: "2024-07-02",
  date_end: "2024-07-12",

  /** Map center [lon, lat] — Knights Landing almond orchards */
  center: [-121.71, 38.81] as [number, number],
  zoom: 15,

  /** AOI polygon sent to POST /api/analyze — matches backend precache AOI */
  aoi: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-121.72, 38.82],
        [-121.70, 38.82],
        [-121.70, 38.80],
        [-121.72, 38.80],
        [-121.72, 38.82],
      ],
    ],
  },
} as const;
