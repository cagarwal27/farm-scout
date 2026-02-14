import { useState, useRef, useCallback } from "react";
import { fetchFarmParcels } from "../services/dwrApi";

const MIN_ZOOM = 12;
const DEBOUNCE_MS = 500;

export function useFarmParcels() {
  const [parcels, setParcels] = useState<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [selectedParcel, setSelectedParcel] = useState<GeoJSON.Feature | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomSufficient, setZoomSufficient] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onViewportChange = useCallback(
    (zoom: number, bounds: { xmin: number; ymin: number; xmax: number; ymax: number }) => {
      // Clear pending debounce
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (zoom < MIN_ZOOM) {
        setZoomSufficient(false);
        setParcels({ type: "FeatureCollection", features: [] });
        // Abort any in-flight request
        abortRef.current?.abort();
        return;
      }

      setZoomSufficient(true);

      timerRef.current = setTimeout(async () => {
        // Abort previous in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
          const data = await fetchFarmParcels(bounds, controller.signal);
          setParcels(data);

          if (data.features.length >= 2000) {
            console.warn("DWR API: hit 2000-record limit. Zoom in further for all parcels.");
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError("Failed to load farm parcels");
          console.error("DWR fetch error:", err);
        } finally {
          setLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    []
  );

  const selectParcel = useCallback((feature: GeoJSON.Feature) => {
    setSelectedParcel(feature);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedParcel(null);
  }, []);

  return {
    parcels,
    selectedParcel,
    loading,
    error,
    zoomSufficient,
    onViewportChange,
    selectParcel,
    clearSelection,
  };
}
