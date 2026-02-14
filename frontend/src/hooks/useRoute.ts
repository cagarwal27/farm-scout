import { useCallback } from "react";
import type { RouteData } from "../types/api";

/** Haversine distance between two [lon, lat] points in km */
function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Build a direct field path between zone centroids.
 * No external API call — just straight lines through the field
 * with haversine distance and estimated walk/drive time.
 */
export function useRoute() {
  const buildRoute = useCallback(
    (waypoints: [number, number][]): RouteData => {
      if (waypoints.length < 2) {
        return {
          geometry: { type: "LineString", coordinates: waypoints },
          distance_km: 0,
          duration_min: 0,
        };
      }

      // Total distance along the path
      let totalKm = 0;
      for (let i = 1; i < waypoints.length; i++) {
        totalKm += haversineKm(waypoints[i - 1], waypoints[i]);
      }

      // Estimate time: ~15 km/h field driving speed
      const durationMin = Math.round((totalKm / 15) * 60);

      return {
        geometry: {
          type: "LineString",
          coordinates: waypoints,
        },
        distance_km: Math.round(totalKm * 10) / 10,
        duration_min: Math.max(durationMin, 1),
      };
    },
    []
  );

  return { buildRoute };
}
