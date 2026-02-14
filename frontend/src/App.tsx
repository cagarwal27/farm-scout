import { useRef, useCallback } from "react";
import { MapView, type MapHandle } from "./components/MapView";
import { SidePanel } from "./components/SidePanel";
import { useAppState } from "./hooks/useAppState";
import { useMapTransition } from "./hooks/useMapTransition";
import { useOSRM } from "./hooks/useOSRM";

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
    runAnalysis,
    runWeather,
    runMissions,
    setRouteData,
    setRouteLoading,
    showTicket,
  } = useAppState();

  const { runTransition, showRoute } = useMapTransition(mapRef);
  const { fetchRoute } = useOSRM();

  const handleAnalyze = useCallback(async () => {
    getMapRef();
    const data = await runAnalysis();
    if (data) {
      runTransition(data);
    }
  }, [runAnalysis, runTransition, getMapRef]);

  const handleRoute = useCallback(async () => {
    if (!state.missionsData) return;
    getMapRef();
    setRouteLoading();

    // Extract centroids in priority order — these come from Person A's /api/missions response
    const waypoints = state.missionsData.missions
      .sort((a, b) => a.priority - b.priority)
      .map((m) => m.centroid);

    const routeData = await fetchRoute(waypoints);
    setRouteData(routeData);

    // Draw route + numbered markers on map
    showRoute(routeData, state.missionsData.missions);
  }, [state.missionsData, fetchRoute, setRouteData, setRouteLoading, showRoute, getMapRef]);

  return (
    <div className="flex h-screen w-screen bg-gray-900">
      <div className="w-[70%] h-full relative">
        <MapView ref={mapHandle} />
      </div>
      <div className="w-[30%] h-full border-l border-slate-800 overflow-y-auto">
        <SidePanel
          state={state}
          loading={state.loading}
          onAnalyze={handleAnalyze}
          onWeather={runWeather}
          onMissions={runMissions}
          onRoute={handleRoute}
          onTicket={showTicket}
        />
      </div>
    </div>
  );
}
