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
  area_acres: 412.5,
  date_start: "2024-07-01",
  date_end: "2024-07-14",

  /** Map center [lon, lat] */
  center: [-121.872, 38.718] as [number, number],
  zoom: 14,

  /** AOI polygon sent to POST /api/analyze */
  aoi: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-121.878, 38.724],
        [-121.864, 38.724],
        [-121.864, 38.712],
        [-121.878, 38.712],
        [-121.878, 38.724],
      ],
    ],
  },
} as const;
