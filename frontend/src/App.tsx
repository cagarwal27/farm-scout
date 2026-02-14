import { useRef, useCallback } from "react";
import { MapView, type MapHandle } from "./components/MapView";
import { SidePanel } from "./components/SidePanel";
import { useAppState } from "./hooks/useAppState";
import { useMapTransition } from "./hooks/useMapTransition";

export default function App() {
  const mapHandle = useRef<MapHandle>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Sync mapRef to point at the live map instance
  const getMapRef = useCallback(() => {
    if (!mapRef.current && mapHandle.current) {
      mapRef.current = mapHandle.current.getMap();
    }
    return mapRef;
  }, []);

  const { state, runAnalysis, runWeather, runMissions, showTicket } =
    useAppState();
  const { runTransition } = useMapTransition(mapRef);

  const handleAnalyze = useCallback(async () => {
    // Ensure mapRef is populated
    getMapRef();
    const data = await runAnalysis();
    if (data) {
      runTransition(data);
    }
  }, [runAnalysis, runTransition, getMapRef]);

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
          onTicket={showTicket}
        />
      </div>
    </div>
  );
}
