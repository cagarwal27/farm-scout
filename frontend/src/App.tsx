import { useRef, useCallback, useEffect } from "react";
import { MapView, type MapHandle } from "./components/MapView";
import { SidePanel } from "./components/SidePanel";
import { useAppState } from "./hooks/useAppState";
import { useMapTransition } from "./hooks/useMapTransition";
import { useRoute } from "./hooks/useRoute";

export default function App() {
  const mapHandle = useRef<MapHandle>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const getMapRef = useCallback(() => {
    if (!mapRef.current && mapHandle.current) {
      mapRef.current = mapHandle.current.getMap();
    }
    return mapRef;
  }, []);

  const {
    state,
    fetchAnalysis,
    revealAnalysis,
    runWeather,
    runMissions,
    setRouteData,
    selectZone,
    showTicket,
    nextTicketZone,
  } = useAppState();

  const { runTransition, showRoute } = useMapTransition(mapRef, selectZone);
  const { buildRoute } = useRoute();

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

  // Keyboard shortcuts: 1-5 advance the demo flow
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state.loading) return;
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
          if (state.panel === "missions" && state.routeData) showTicket();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.panel, state.loading, state.routeData, handleAnalyze, runWeather, runMissions, handleRoute, showTicket]);

  return (
    <div className="relative h-screen w-screen bg-black">
      {/* Full-bleed satellite map */}
      <MapView ref={mapHandle} />

      {/* Floating glass panel */}
      <div className="absolute top-5 right-5 bottom-5 w-[380px] z-10">
        <SidePanel
          state={state}
          loading={state.loading}
          onAnalyze={handleAnalyze}
          onWeather={runWeather}
          onMissions={runMissions}
          onRoute={handleRoute}
          onTicket={showTicket}
          onNextZone={nextTicketZone}
        />
      </div>
    </div>
  );
}
