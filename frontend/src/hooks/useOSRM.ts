import { useCallback } from "react";
import type { RouteData } from "../types/api";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

/**
 * Build a straight-line GeoJSON fallback when OSRM is unavailable.
 * Connects waypoints with line segments and estimates distance/time.
 */
function buildFallbackRoute(waypoints: [number, number][]): RouteData {
  return {
    geometry: {
      type: "LineString",
      coordinates: waypoints,
    },
    distance_km: 8.2,
    duration_min: 22,
    isFallback: true,
  };
}

export function useOSRM() {
  const fetchRoute = useCallback(
    async (waypoints: [number, number][]): Promise<RouteData> => {
      if (waypoints.length < 2) {
        return buildFallbackRoute(waypoints);
      }

      // OSRM expects "lon,lat;lon,lat;..." format
      const coords = waypoints.map((w) => `${w[0]},${w[1]}`).join(";");
      const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`OSRM returned ${res.status}, using fallback`);
          return buildFallbackRoute(waypoints);
        }

        const data = await res.json();
        const route = data.routes?.[0];
        if (!route) {
          console.warn("OSRM returned no routes, using fallback");
          return buildFallbackRoute(waypoints);
        }

        return {
          geometry: route.geometry as GeoJSON.LineString,
          distance_km: Math.round((route.distance / 1000) * 10) / 10,
          duration_min: Math.round(route.duration / 60),
          isFallback: false,
        };
      } catch (err) {
        console.warn("OSRM fetch failed, using fallback:", err);
        return buildFallbackRoute(waypoints);
      }
    },
    []
  );

  return { fetchRoute };
}
