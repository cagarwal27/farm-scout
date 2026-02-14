import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import maplibregl from "maplibre-gl";
import { FIELD } from "../config/field";

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export interface MapHandle {
  getMap: () => maplibregl.Map | null;
}

export const MapView = forwardRef<MapHandle>(function MapView(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [ESRI_TILES],
            tileSize: 256,
            maxzoom: 19,
            attribution: "&copy; Esri, Maxar, Earthstar Geographics",
          },
        },
        layers: [
          {
            id: "satellite",
            type: "raster",
            source: "satellite",
            paint: {
              "raster-brightness-max": 0.5,
              "raster-saturation": -0.3,
              "raster-contrast": 0.2,
            },
          },
        ],
      },
      center: FIELD.center,
      zoom: FIELD.zoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-left");

    // Field boundary — visible on load, grounds the viewer
    map.on("load", () => {
      map.addSource("field-boundary", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: FIELD.aoi.type, coordinates: FIELD.aoi.coordinates as unknown as number[][][] },
          properties: {},
        },
      });

      map.addLayer({
        id: "field-boundary-line",
        type: "line",
        source: "field-boundary",
        paint: {
          "line-color": "#94a3b8",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
          "line-opacity": 0.6,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
});
