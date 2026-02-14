import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import maplibregl from "maplibre-gl";

const MAP_CENTER: [number, number] = [-121.872, 38.718];
const MAP_ZOOM = 14;
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
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    // Field boundary — visible on load, grounds the viewer
    map.on("load", () => {
      map.addSource("field-boundary", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[
              [-121.878, 38.724],
              [-121.864, 38.724],
              [-121.864, 38.712],
              [-121.878, 38.712],
              [-121.878, 38.724],
            ]],
          },
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
