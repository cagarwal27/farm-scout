/**
 * Fetches farm parcel boundaries from the CA DWR Statewide Crop Mapping 2019 FeatureServer.
 * Public ArcGIS REST API — no auth required.
 */

const DWR_URL =
  "https://gis.water.ca.gov/arcgis/rest/services/Planning/i15_Crop_Mapping_2019/FeatureServer/0/query";

export interface DWRBbox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export async function fetchFarmParcels(
  bbox: DWRBbox,
  signal?: AbortSignal
): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({
    geometry: `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    f: "geojson",
    outFields: "COUNTY,MAIN_CROP,ACRES,UniqueID,Shape__Area",
    resultRecordCount: "2000",
  });

  const res = await fetch(`${DWR_URL}?${params}`, { signal });

  if (!res.ok) {
    throw new Error(`DWR API error: ${res.status}`);
  }

  const data = await res.json();
  return data as GeoJSON.FeatureCollection;
}
