import { useCallback, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { AnalyzeResponse } from "../types/api";

const FIELD_CENTER: [number, number] = [-121.872, 38.718];

/** Creates a pulsing dot image for cluster centroids */
function createPulsingDot(map: maplibregl.Map, size = 100) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  return {
    width: size,
    height: size,
    data: new Uint8Array(size * size * 4),
    context: canvas.getContext("2d")!,
    onAdd() {
      this.context = canvas.getContext("2d")!;
    },
    render() {
      const t = (performance.now() % 1500) / 1500;
      const ctx = this.context;
      const center = size / 2;

      ctx.clearRect(0, 0, size, size);

      // Outer pulsing ring
      const radius = (size / 2) * 0.4 + (size / 2) * 0.4 * t;
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${1 - t})`;
      ctx.fill();

      // Inner solid dot
      ctx.beginPath();
      ctx.arc(center, center, size * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      this.data = new Uint8Array(
        ctx.getImageData(0, 0, size, size).data.buffer
      );
      map.triggerRepaint();
      return true;
    },
  } as maplibregl.StyleImageInterface & { context: CanvasRenderingContext2D };
}

export function useMapTransition(mapRef: React.RefObject<maplibregl.Map | null>) {
  const sourcesAdded = useRef(false);

  /** Add the hotspot + pulsing dot sources/layers (hidden initially) */
  const prepareLayers = useCallback((map: maplibregl.Map) => {
    if (sourcesAdded.current) return;
    sourcesAdded.current = true;

    // Empty sources — data gets set during animation
    map.addSource("hotspots", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addSource("centroids", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    // Hotspot fill (starts invisible)
    map.addLayer({
      id: "hotspot-fill",
      type: "fill",
      source: "hotspots",
      paint: {
        "fill-color": [
          "match",
          ["get", "severity"],
          "high", "#ef4444",
          "medium", "#f59e0b",
          "low", "#eab308",
          "#ef4444",
        ],
        "fill-opacity": 0,
        "fill-opacity-transition": { duration: 1500, delay: 0 },
      },
    });

    // Hotspot outline (starts invisible)
    map.addLayer({
      id: "hotspot-outline",
      type: "line",
      source: "hotspots",
      paint: {
        "line-color": [
          "match",
          ["get", "severity"],
          "high", "#ff4444",
          "medium", "#fbbf24",
          "low", "#facc15",
          "#ff4444",
        ],
        "line-width": 2,
        "line-opacity": 0,
        "line-opacity-transition": { duration: 1500, delay: 0 },
      },
    });

    // Pulsing dot image
    map.addImage("pulsing-dot", createPulsingDot(map), { pixelRatio: 2 });

    // Centroid markers (starts invisible)
    map.addLayer({
      id: "centroid-dots",
      type: "symbol",
      source: "centroids",
      layout: {
        "icon-image": "pulsing-dot",
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": 0,
        "icon-opacity-transition": { duration: 800, delay: 0 },
      },
    });
  }, []);

  /** Run the full cinematic reveal sequence */
  const runTransition = useCallback(
    (data: AnalyzeResponse) => {
      const map = mapRef.current;
      if (!map) return;

      prepareLayers(map);

      // Build centroid points from hotspot features
      const centroidFeatures: GeoJSON.Feature[] = data.hotspots.features.map(
        (f) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: (f.properties as { centroid: [number, number] }).centroid,
          },
          properties: f.properties,
        })
      );

      // 0ms — set data on sources (still invisible)
      (map.getSource("hotspots") as maplibregl.GeoJSONSource).setData(
        data.hotspots
      );

      // 500ms — darken satellite
      setTimeout(() => {
        map.setPaintProperty("satellite", "raster-brightness-max", 0.3);
      }, 500);

      // 800ms — camera sweep
      setTimeout(() => {
        map.flyTo({
          center: FIELD_CENTER,
          zoom: 15,
          pitch: 45,
          bearing: -20,
          duration: 3000,
        });
      }, 800);

      // 1300ms — fade in hotspot polygons
      setTimeout(() => {
        map.setPaintProperty("hotspot-fill", "fill-opacity", 0.5);
        map.setPaintProperty("hotspot-outline", "line-opacity", 0.9);
      }, 1300);

      // 2000ms — show pulsing dots
      setTimeout(() => {
        (map.getSource("centroids") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: centroidFeatures,
        });
        map.setPaintProperty("centroid-dots", "icon-opacity", 1);
      }, 2000);
    },
    [mapRef, prepareLayers]
  );

  /** Reset map to initial state */
  const resetMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setPaintProperty("satellite", "raster-brightness-max", 0.5);
    map.flyTo({
      center: FIELD_CENTER,
      zoom: 14,
      pitch: 0,
      bearing: 0,
      duration: 1500,
    });

    if (sourcesAdded.current) {
      map.setPaintProperty("hotspot-fill", "fill-opacity", 0);
      map.setPaintProperty("hotspot-outline", "line-opacity", 0);
      map.setPaintProperty("centroid-dots", "icon-opacity", 0);
    }
  }, [mapRef]);

  return { runTransition, resetMap };
}
