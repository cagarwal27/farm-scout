import { useCallback, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { AnalyzeResponse, RouteData } from "../types/api";

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

export function useMapTransition(
  mapRef: React.RefObject<maplibregl.Map | null>,
  onZoneClick?: (zoneId: string) => void
) {
  const sourcesAdded = useRef(false);
  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;

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

    // Click handler for hotspot zones
    map.on("click", "hotspot-fill", (e) => {
      const feature = e.features?.[0];
      if (feature?.properties?.cluster_id) {
        onZoneClickRef.current?.(feature.properties.cluster_id);
      }
    });

    // Pointer cursor on hover
    map.on("mouseenter", "hotspot-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "hotspot-fill", () => {
      map.getCanvas().style.cursor = "";
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

  /** Draw route line + numbered zone markers on the map */
  const showRoute = useCallback(
    (routeData: RouteData, missions: { zone_id: string; priority: number; centroid: [number, number] }[]) => {
      const map = mapRef.current;
      if (!map) return;

      // Create direction-arrow image (chevron rotated along the line by MapLibre)
      if (!map.hasImage("route-arrow")) {
        const s = 24;
        const canvas = document.createElement("canvas");
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, s, s);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(s * 0.3, s * 0.2);
        ctx.lineTo(s * 0.7, s * 0.5);
        ctx.lineTo(s * 0.3, s * 0.8);
        ctx.stroke();
        map.addImage("route-arrow", {
          width: s,
          height: s,
          data: new Uint8Array(ctx.getImageData(0, 0, s, s).data.buffer),
        });
      }

      // Add route source if not present
      if (!map.getSource("route")) {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", geometry: routeData.geometry, properties: {} },
        });

        // 1. Dark shadow underneath for depth
        map.addLayer({
          id: "route-shadow",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#000000",
            "line-width": 14,
            "line-blur": 8,
            "line-opacity": 0,
            "line-opacity-transition": { duration: 1000, delay: 0 },
          },
        });

        // 2. Outer neon glow
        map.addLayer({
          id: "route-glow",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#00ffaa",
            "line-width": 8,
            "line-blur": 6,
            "line-opacity": 0,
            "line-opacity-transition": { duration: 1000, delay: 0 },
          },
        });

        // 3. Solid bright core line
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#6ee7b7",
            "line-width": 2.5,
            "line-opacity": 0,
            "line-opacity-transition": { duration: 800, delay: 0 },
          },
        });

        // 4. Direction arrows along the path
        map.addLayer({
          id: "route-arrows",
          type: "symbol",
          source: "route",
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 100,
            "icon-image": "route-arrow",
            "icon-size": 0.7,
            "icon-allow-overlap": true,
          },
          paint: {
            "icon-opacity": 0,
            "icon-opacity-transition": { duration: 600, delay: 0 },
          },
        });
      } else {
        (map.getSource("route") as maplibregl.GeoJSONSource).setData({
          type: "Feature",
          geometry: routeData.geometry,
          properties: {},
        });
      }

      // Add zone marker source if not present
      const markerFeatures: GeoJSON.Feature[] = missions.map((m) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: m.centroid },
        properties: { label: String(m.priority), zone_id: m.zone_id },
      }));

      if (!map.getSource("zone-markers")) {
        map.addSource("zone-markers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: markerFeatures },
        });

        // Soft glow halo behind markers
        map.addLayer({
          id: "zone-marker-glow",
          type: "circle",
          source: "zone-markers",
          paint: {
            "circle-radius": 22,
            "circle-color": "#00ffaa",
            "circle-blur": 1,
            "circle-opacity": 0,
            "circle-opacity-transition": { duration: 600, delay: 0 },
          },
        });

        // Green circle background
        map.addLayer({
          id: "zone-marker-bg",
          type: "circle",
          source: "zone-markers",
          paint: {
            "circle-radius": 12,
            "circle-color": "#059669",
            "circle-stroke-color": "#00ffaa",
            "circle-stroke-width": 2,
            "circle-opacity": 0,
            "circle-opacity-transition": { duration: 600, delay: 0 },
            "circle-stroke-opacity": 0,
            "circle-stroke-opacity-transition": { duration: 600, delay: 0 },
          },
        });

        // White number labels
        map.addLayer({
          id: "zone-marker-label",
          type: "symbol",
          source: "zone-markers",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-opacity": 0,
            "text-opacity-transition": { duration: 600, delay: 0 },
          },
        });
      } else {
        (map.getSource("zone-markers") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: markerFeatures,
        });
      }

      // Camera pulls back to reveal full route
      map.flyTo({
        center: FIELD_CENTER,
        zoom: 14.5,
        pitch: 30,
        bearing: -10,
        duration: 1500,
      });

      // Staggered fade-in: shadow → glow → core
      setTimeout(() => {
        map.setPaintProperty("route-shadow", "line-opacity", 0.5);
        map.setPaintProperty("route-glow", "line-opacity", 0.35);
        map.setPaintProperty("route-line", "line-opacity", 1);
      }, 300);

      // Direction arrows fade in after core
      setTimeout(() => {
        map.setPaintProperty("route-arrows", "icon-opacity", 0.85);
      }, 600);

      // Numbered markers with glow halos
      setTimeout(() => {
        map.setPaintProperty("zone-marker-glow", "circle-opacity", 0.15);
        map.setPaintProperty("zone-marker-bg", "circle-opacity", 1);
        map.setPaintProperty("zone-marker-bg", "circle-stroke-opacity", 1);
        map.setPaintProperty("zone-marker-label", "text-opacity", 1);
      }, 800);
    },
    [mapRef]
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

    // Clean up route layers
    if (map.getSource("route")) {
      map.setPaintProperty("route-shadow", "line-opacity", 0);
      map.setPaintProperty("route-glow", "line-opacity", 0);
      map.setPaintProperty("route-line", "line-opacity", 0);
      map.setPaintProperty("route-arrows", "icon-opacity", 0);
    }
    if (map.getSource("zone-markers")) {
      map.setPaintProperty("zone-marker-glow", "circle-opacity", 0);
      map.setPaintProperty("zone-marker-bg", "circle-opacity", 0);
      map.setPaintProperty("zone-marker-bg", "circle-stroke-opacity", 0);
      map.setPaintProperty("zone-marker-label", "text-opacity", 0);
    }
  }, [mapRef]);

  /** Zoom into a specific zone centroid — used during field ticket */
  const flyToZone = useCallback(
    (centroid: [number, number]) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: centroid,
        zoom: 17,
        pitch: 50,
        bearing: -15,
        duration: 1500,
      });
    },
    [mapRef]
  );

  /** Zoom back out to see all zones — used when all zones complete */
  const flyToOverview = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: FIELD_CENTER,
      zoom: 14.5,
      pitch: 30,
      bearing: -10,
      duration: 1500,
    });
  }, [mapRef]);

  return { runTransition, showRoute, resetMap, flyToZone, flyToOverview };
}
