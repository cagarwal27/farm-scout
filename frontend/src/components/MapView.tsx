import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import maplibregl from "maplibre-gl";
import type { FieldConfig } from "../config/field";

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// California overview for field selection
const CA_CENTER: [number, number] = [-119.5, 37.5];
const CA_ZOOM = 6;

// California bounds with padding for max map extent
const CA_BOUNDS: [[number, number], [number, number]] = [
  [-126.0, 31.5], // Southwest (lon, lat)
  [-113.0, 43.0], // Northeast (lon, lat)
];

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_FEATURE: GeoJSON.Feature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {},
};

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
  parcels?: GeoJSON.FeatureCollection;
  selectedParcel?: GeoJSON.Feature | null;
  onViewportChange?: (
    zoom: number,
    bounds: { xmin: number; ymin: number; xmax: number; ymax: number }
  ) => void;
  onParcelClick?: (feature: GeoJSON.Feature) => void;
}

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
  { fieldConfig, drawMode, onAoiDrawn, parcels, selectedParcel, onViewportChange, onParcelClick },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const startPoint = useRef<[number, number] | null>(null);
  const prevFieldRef = useRef<FieldConfig | null>(null);
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;

  // Callback refs so map event handlers always see the latest props
  const onParcelClickRef = useRef(onParcelClick);
  onParcelClickRef.current = onParcelClick;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const hoveredIdRef = useRef<string | null>(null);

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
      maxBounds: CA_BOUNDS,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-left");

    map.on("load", () => {
      // Field boundary source
      map.addSource("field-boundary", {
        type: "geojson",
        data: EMPTY_FEATURE,
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
        data: EMPTY_FEATURE,
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

      // --- Farm parcels layers ---
      map.addSource("farm-parcels", {
        type: "geojson",
        data: EMPTY_FC,
      });

      map.addLayer({
        id: "farm-parcels-fill",
        type: "fill",
        source: "farm-parcels",
        paint: {
          "fill-color": "#22d3ee",
          "fill-opacity": 0.08,
        },
      });

      map.addLayer({
        id: "farm-parcels-line",
        type: "line",
        source: "farm-parcels",
        paint: {
          "line-color": "#22d3ee",
          "line-width": 1,
          "line-opacity": 0.4,
        },
      });

      // Selected parcel highlight
      map.addSource("farm-parcel-highlight", {
        type: "geojson",
        data: EMPTY_FC,
      });

      map.addLayer({
        id: "farm-parcel-highlight-fill",
        type: "fill",
        source: "farm-parcel-highlight",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.25,
        },
      });

      map.addLayer({
        id: "farm-parcel-highlight-line",
        type: "line",
        source: "farm-parcel-highlight",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 2.5,
        },
      });

      // Fire initial viewport change after load
      const b = map.getBounds();
      onViewportChangeRef.current?.(map.getZoom(), {
        xmin: b.getWest(),
        ymin: b.getSouth(),
        xmax: b.getEast(),
        ymax: b.getNorth(),
      });
    });

    // --- Parcel click handler ---
    map.on("click", "farm-parcels-fill", (e) => {
      if (drawModeRef.current) return;
      const feature = e.features?.[0];
      if (feature) {
        onParcelClickRef.current?.(feature as GeoJSON.Feature);
      }
    });

    // --- Parcel hover handlers ---
    map.on("mousemove", "farm-parcels-fill", (e) => {
      if (drawModeRef.current) return;
      map.getCanvas().style.cursor = "pointer";
      const feature = e.features?.[0];
      const uid = feature?.properties?.UniqueID ?? null;
      if (uid !== hoveredIdRef.current) {
        hoveredIdRef.current = uid;
        map.setPaintProperty("farm-parcels-fill", "fill-opacity", [
          "case",
          ["==", ["get", "UniqueID"], uid ?? ""],
          0.25,
          0.08,
        ]);
      }
    });

    map.on("mouseleave", "farm-parcels-fill", () => {
      map.getCanvas().style.cursor = "";
      hoveredIdRef.current = null;
      map.setPaintProperty("farm-parcels-fill", "fill-opacity", 0.08);
    });

    // --- Viewport change (moveend) ---
    map.on("moveend", () => {
      const b = map.getBounds();
      onViewportChangeRef.current?.(map.getZoom(), {
        xmin: b.getWest(),
        ymin: b.getSouth(),
        xmax: b.getEast(),
        ymax: b.getNorth(),
      });
    });

    // Draw mode mouse handlers
    map.on("mousedown", (e: maplibregl.MapMouseEvent) => {
      if (!drawModeRef.current) return;
      e.preventDefault();
      startPoint.current = [e.lngLat.lng, e.lngLat.lat];
      map.getCanvas().style.cursor = "crosshair";
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

  // Sync parcels prop → farm-parcels source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("farm-parcels") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(parcels ?? EMPTY_FC);
    }
  }, [parcels]);

  // Sync selectedParcel prop → farm-parcel-highlight source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("farm-parcel-highlight") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      if (selectedParcel) {
        src.setData({
          type: "FeatureCollection",
          features: [selectedParcel],
        });
      } else {
        src.setData(EMPTY_FC);
      }
    }
  }, [selectedParcel]);

  // Hide parcel layers when drawMode is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = drawMode ? "none" : "visible";
    for (const layerId of [
      "farm-parcels-fill",
      "farm-parcels-line",
      "farm-parcel-highlight-fill",
      "farm-parcel-highlight-line",
    ]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", vis);
      }
    }
  }, [drawMode]);

  // Fly to field when fieldConfig changes (after user selects a field)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (
      prevFieldRef.current &&
      prevFieldRef.current.center[0] === fieldConfig.center[0] &&
      prevFieldRef.current.center[1] === fieldConfig.center[1]
    ) {
      return;
    }
    prevFieldRef.current = fieldConfig;

    const src = map.getSource("field-boundary") as maplibregl.GeoJSONSource;
    if (src) {
      src.setData({
        type: "Feature",
        geometry: { type: fieldConfig.aoi.type, coordinates: fieldConfig.aoi.coordinates },
        properties: {},
      });
    }

    const drawSrc = map.getSource("draw-preview") as maplibregl.GeoJSONSource;
    if (drawSrc) {
      drawSrc.setData(EMPTY_FEATURE);
    }

    map.flyTo({
      center: fieldConfig.center,
      zoom: fieldConfig.zoom,
      duration: 2000,
      essential: true,
    });
  }, [fieldConfig]);

  return <div ref={containerRef} className="w-full h-full" />;
});
