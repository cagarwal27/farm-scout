import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { FieldConfig } from "../config/field";

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// California overview for field selection
const CA_CENTER: [number, number] = [-119.5, 37.5];
const CA_ZOOM = 6;

export interface MapHandle {
  getMap: () => maplibregl.Map | null;
}

interface MapViewProps {
  fieldConfig: FieldConfig;
  drawMode: boolean;
  onAoiDrawn: (
    aoi: { type: "Polygon"; coordinates: number[][][] },
    center: [number, number]
  ) => void;
}

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
  { fieldConfig, drawMode, onAoiDrawn },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const startPoint = useRef<[number, number] | null>(null);
  const prevFieldRef = useRef<FieldConfig | null>(null);
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
  }));

  // Initialize map
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
      center: CA_CENTER,
      zoom: CA_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-left");

    map.on("load", () => {
      // Field boundary source
      map.addSource("field-boundary", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} },
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

      // Draw preview source
      map.addSource("draw-preview", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} },
      });

      map.addLayer({
        id: "draw-preview-fill",
        type: "fill",
        source: "draw-preview",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.15,
        },
      });

      map.addLayer({
        id: "draw-preview-line",
        type: "line",
        source: "draw-preview",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 2,
          "line-dasharray": [4, 2],
        },
      });
    });

    // Draw mode mouse handlers
    map.on("mousedown", (e: maplibregl.MapMouseEvent) => {
      if (!drawModeRef.current) return;
      e.preventDefault();
      startPoint.current = [e.lngLat.lng, e.lngLat.lat];
      map.getCanvas().style.cursor = "crosshair";
      // Disable map drag during drawing
      map.dragPan.disable();
    });

    map.on("mousemove", (e: maplibregl.MapMouseEvent) => {
      if (!startPoint.current) return;
      const start = startPoint.current;
      const end: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const rect = [
        [start[0], start[1]],
        [end[0], start[1]],
        [end[0], end[1]],
        [start[0], end[1]],
        [start[0], start[1]],
      ];

      const src = map.getSource("draw-preview") as maplibregl.GeoJSONSource;
      if (src) {
        src.setData({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [rect] },
          properties: {},
        });
      }
    });

    map.on("mouseup", (e: maplibregl.MapMouseEvent) => {
      if (!startPoint.current) return;
      const start = startPoint.current;
      const end: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      startPoint.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";

      // Minimum drag distance check (prevent accidental clicks)
      const dlng = Math.abs(end[0] - start[0]);
      const dlat = Math.abs(end[1] - start[1]);
      if (dlng < 0.001 || dlat < 0.001) return;

      const rect: number[][] = [
        [Math.min(start[0], end[0]), Math.max(start[1], end[1])],
        [Math.max(start[0], end[0]), Math.max(start[1], end[1])],
        [Math.max(start[0], end[0]), Math.min(start[1], end[1])],
        [Math.min(start[0], end[0]), Math.min(start[1], end[1])],
        [Math.min(start[0], end[0]), Math.max(start[1], end[1])],
      ];

      const center: [number, number] = [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2,
      ];

      onAoiDrawn({ type: "Polygon", coordinates: [rect] }, center);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update cursor for draw mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = drawMode ? "crosshair" : "";
  }, [drawMode]);

  // Fly to field when fieldConfig changes (after user selects a field)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Skip if field hasn't actually changed
    if (
      prevFieldRef.current &&
      prevFieldRef.current.center[0] === fieldConfig.center[0] &&
      prevFieldRef.current.center[1] === fieldConfig.center[1]
    ) {
      return;
    }
    prevFieldRef.current = fieldConfig;

    // Update field boundary
    const src = map.getSource("field-boundary") as maplibregl.GeoJSONSource;
    if (src) {
      src.setData({
        type: "Feature",
        geometry: { type: fieldConfig.aoi.type, coordinates: fieldConfig.aoi.coordinates },
        properties: {},
      });
    }

    // Clear draw preview
    const drawSrc = map.getSource("draw-preview") as maplibregl.GeoJSONSource;
    if (drawSrc) {
      drawSrc.setData({ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} });
    }

    // Fly to the selected field
    map.flyTo({
      center: fieldConfig.center,
      zoom: fieldConfig.zoom,
      duration: 2000,
      essential: true,
    });
  }, [fieldConfig]);

  return <div ref={containerRef} className="w-full h-full" />;
});
