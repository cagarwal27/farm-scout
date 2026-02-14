/**
 * Field configuration type and default.
 * FieldConfig is now dynamic — users select their own AOI via the map.
 * DEFAULT_FIELD is kept as the initial/fallback value.
 */

export interface FieldConfig {
  name: string;
  crop: string;
  area_acres: number;
  date_start: string;
  date_end: string;
  center: [number, number]; // [lon, lat]
  zoom: number;
  aoi: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

/** Default field — Yolo County Knights Landing almonds (demo AOI) */
export const DEFAULT_FIELD: FieldConfig = {
  name: "Yolo County, CA",
  crop: "Almond",
  area_acres: 932.6,
  date_start: "2024-07-02",
  date_end: "2024-07-12",
  center: [-121.71, 38.81],
  zoom: 15,
  aoi: {
    type: "Polygon",
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
};
