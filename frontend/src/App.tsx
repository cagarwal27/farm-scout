import { useRef, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapView, type MapHandle } from "./components/MapView";
import { SidePanel } from "./components/SidePanel";
import { useAppState } from "./hooks/useAppState";
import { useMapTransition } from "./hooks/useMapTransition";
import { useRoute } from "./hooks/useRoute";
import { saveField, loadFieldLatest } from "./services/api";
import type { FieldConfig } from "./config/field";

export default function App() {
  const mapHandle = useRef<MapHandle>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Draw mode state
  const [drawnAoi, setDrawnAoi] = useState<{ type: "Polygon"; coordinates: number[][][] } | null>(null);
  const [drawnCenter, setDrawnCenter] = useState<[number, number] | null>(null);
  const [drawActive, setDrawActive] = useState(false);

  const getMapRef = useCallback(() => {
    if (!mapRef.current && mapHandle.current) {
      mapRef.current = mapHandle.current.getMap();
    }
    return mapRef;
  }, []);

  const {
    state,
    advanceIntro,
    fetchAnalysis,
    revealAnalysis,
    setFieldConfig,
    confirmFieldSelection,
    runWeather,
    runMissions,
    setRouteData,
    selectZone,
    showTicket,
    nextTicketZone,
    skipToComplete,
  } = useAppState();

  const { runTransition, showRoute, flyToZone, flyToOverview } =
    useMapTransition(mapRef, state.fieldConfig, selectZone);
  const { buildRoute } = useRoute();

  // Draw mode is active when user clicks "Draw Area" in field-select panel
  const drawMode = state.panel === "field-select" && drawActive;

  const handleAoiDrawn = useCallback(
    (aoi: { type: "Polygon"; coordinates: number[][][] }, center: [number, number]) => {
      setDrawnAoi(aoi);
      setDrawnCenter(center);
      setDrawActive(false);
    },
    []
  );

  const handleActivateDraw = useCallback(() => {
    setDrawActive(true);
  }, []);

  const handleFieldConfirm = useCallback(
    async (config: FieldConfig, monitor: boolean) => {
      setFieldConfig(config);
      confirmFieldSelection();
      setDrawnAoi(null);
      setDrawnCenter(null);
      setDrawActive(false);

      // Save for monitoring if requested
      if (monitor) {
        try {
          await saveField(config);
        } catch {
          // Non-critical — don't block the flow
        }
      }
    },
    [setFieldConfig, confirmFieldSelection]
  );

  const handleLoadSaved = useCallback(
    async (fieldId: string) => {
      try {
        const data = await loadFieldLatest(fieldId);
        // Build a FieldConfig from the analysis data
        const features = data.hotspots.features;
        let center: [number, number] = [-121.71, 38.81];
        if (features.length > 0) {
          const centroids = features.map(
            (f) => (f.properties as { centroid: [number, number] }).centroid
          );
          center = [
            centroids.reduce((s, c) => s + c[0], 0) / centroids.length,
            centroids.reduce((s, c) => s + c[1], 0) / centroids.length,
          ];
        }

        const config: FieldConfig = {
          name: data.field.location,
          crop: data.field.crop,
          area_acres: data.field.area_acres,
          date_start: data.field.date_start,
          date_end: data.field.date_end,
          center,
          zoom: 15,
          aoi: { type: "Polygon", coordinates: [] }, // Not needed for display
        };
        setFieldConfig(config);
        confirmFieldSelection();
      } catch {
        // Could show error, but for now just fail silently
      }
    },
    [setFieldConfig, confirmFieldSelection]
  );

  const handleAnalyze = useCallback(async () => {
    getMapRef();

    // 0ms — spinner starts (fetchAnalysis sets loading: true)
    const data = await fetchAnalysis();
    if (!data) return;

    // Data is ready — start the map animation
    runTransition(data);

    // 2500ms — panel switches to analysis results (synced with map animation)
    setTimeout(() => {
      revealAnalysis();
    }, 2500);
  }, [fetchAnalysis, revealAnalysis, runTransition, getMapRef]);

  const handleRoute = useCallback(() => {
    if (!state.missionsData) return;
    getMapRef();

    const waypoints = state.missionsData.missions
      .sort((a, b) => a.priority - b.priority)
      .map((m) => m.centroid);

    const routeData = buildRoute(waypoints);
    setRouteData(routeData);
    showRoute(routeData, state.missionsData.missions);
  }, [state.missionsData, buildRoute, setRouteData, showRoute, getMapRef]);

  /** Enter ticket mode — zoom into the first zone */
  const handleTicket = useCallback(() => {
    if (!state.missionsData) return;
    showTicket();
    const firstZone = state.missionsData.missions[0];
    if (firstZone) flyToZone(firstZone.centroid);
  }, [state.missionsData, showTicket, flyToZone]);

  /** Skip to all-complete — zoom back out to overview */
  const handleSkipToComplete = useCallback(() => {
    skipToComplete();
    flyToOverview();
  }, [skipToComplete, flyToOverview]);

  // Map follows the scout: fly to each zone, zoom out when all done
  useEffect(() => {
    if (state.panel !== "ticket" || !state.missionsData) return;
    const missions = state.missionsData.missions;
    if (state.ticketZoneIndex >= missions.length) {
      flyToOverview();
    } else if (state.ticketZoneIndex > 0) {
      flyToZone(missions[state.ticketZoneIndex].centroid);
    }
  }, [state.panel, state.ticketZoneIndex, state.missionsData, flyToZone, flyToOverview]);

  // Keyboard shortcuts: Space/Enter for intro, 1-5 for demo flow
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state.loading) return;

      // Space/Enter advances intro and field-select
      if (e.key === " " || e.key === "Enter") {
        if (state.panel === "intro-problem" || state.panel === "intro-solution") {
          e.preventDefault();
          advanceIntro();
          return;
        }
      }

      switch (e.key) {
        case "1":
          if (state.panel === "field-info") handleAnalyze();
          break;
        case "2":
          if (state.panel === "analysis") runWeather();
          break;
        case "3":
          if (state.panel === "weather") runMissions();
          break;
        case "4":
          if (state.panel === "missions" && !state.routeData) handleRoute();
          break;
        case "5":
          if (state.panel === "missions" && state.routeData) handleTicket();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.panel, state.loading, state.routeData, advanceIntro, handleAnalyze, runWeather, runMissions, handleRoute, handleTicket]);

  const isIntro =
    state.panel === "intro-problem" || state.panel === "intro-solution";

  const sidePanelProps = {
    state,
    loading: state.loading,
    onAdvanceIntro: advanceIntro,
    onAnalyze: handleAnalyze,
    onWeather: runWeather,
    onMissions: runMissions,
    onRoute: handleRoute,
    onTicket: handleTicket,
    onNextZone: nextTicketZone,
    onSkipToComplete: handleSkipToComplete,
    // Field selection props
    drawnAoi,
    drawnCenter,
    onActivateDraw: handleActivateDraw,
    onFieldConfirm: handleFieldConfirm,
    onLoadSaved: handleLoadSaved,
  };

  return (
    <div className="relative h-screen w-screen bg-black">
      {/* Full-bleed satellite map */}
      <MapView
        ref={mapHandle}
        fieldConfig={state.fieldConfig}
        drawMode={drawMode}
        onAoiDrawn={handleAoiDrawn}
      />

      {/* Intro: centered glass card — Sidebar: pinned right */}
      <AnimatePresence>
        {isIntro ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
          >
            <div className="w-[480px] pointer-events-auto">
              <SidePanel {...sidePanelProps} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sidebar"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            className="absolute top-5 right-5 bottom-5 w-[380px] z-10"
          >
            <SidePanel {...sidePanelProps} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Draw mode hint overlay */}
      {drawMode && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-blue-500/20 border border-blue-500/40 rounded-lg backdrop-blur-sm">
          <p className="text-[13px] text-blue-300 font-medium">
            Click and drag on the map to draw your field boundary
          </p>
        </div>
      )}
    </div>
  );
}
