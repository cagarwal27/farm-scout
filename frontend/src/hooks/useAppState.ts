import { useState, useCallback } from "react";
import type {
  PanelState,
  AnalyzeResponse,
  WeatherResponse,
  MissionsResponse,
  RouteData,
} from "../types/api";
import { analyzeField, fetchWeather, fetchMissions } from "../services/api";

export interface AppState {
  panel: PanelState;
  loading: boolean;
  analyzeData: AnalyzeResponse | null;
  weatherData: WeatherResponse | null;
  missionsData: MissionsResponse | null;
  routeData: RouteData | null;
  selectedZone: string | null;
  ticketZoneIndex: number;
}

export function useAppState() {
  const [state, setState] = useState<AppState>({
    panel: "intro-problem",
    loading: false,
    analyzeData: null,
    weatherData: null,
    missionsData: null,
    routeData: null,
    selectedZone: null,
    ticketZoneIndex: 0,
  });

  const selectZone = useCallback((zoneId: string | null) => {
    setState((s) => ({ ...s, selectedZone: zoneId }));
  }, []);

  /** Advance through intro screens */
  const advanceIntro = useCallback(() => {
    setState((s) => {
      if (s.panel === "intro-problem") return { ...s, panel: "intro-solution" };
      if (s.panel === "intro-solution") return { ...s, panel: "field-info" };
      return s;
    });
  }, []);

  /** Fetch analysis data — stores it but does NOT switch panel (spinner stays) */
  const fetchAnalysis = useCallback(async (): Promise<AnalyzeResponse> => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await analyzeField();
      setState((s) => ({ ...s, analyzeData: data }));
      return data;
    } catch {
      const { default: fallback } = await import("../mocks/mockAnalyze.json");
      const data = fallback as AnalyzeResponse;
      setState((s) => ({ ...s, analyzeData: data }));
      return data;
    }
  }, []);

  /** Reveal analysis results — switches panel and clears spinner */
  const revealAnalysis = useCallback(() => {
    setState((s) => ({ ...s, panel: "analysis", loading: false }));
  }, []);

  const runWeather = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetchWeather();
      setState((s) => ({ ...s, weatherData: data, panel: "weather", loading: false }));
    } catch {
      const { default: fallback } = await import("../mocks/mockWeather.json");
      setState((s) => ({
        ...s,
        weatherData: fallback as WeatherResponse,
        panel: "weather",
        loading: false,
      }));
    }
  }, []);

  const runMissions = useCallback(async () => {
    if (!state.analyzeData) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetchMissions(state.analyzeData.hotspots, state.weatherData);
      setState((s) => ({ ...s, missionsData: data, panel: "missions", loading: false }));
    } catch {
      const { default: fallback } = await import("../mocks/mockMissions.json");
      setState((s) => ({
        ...s,
        missionsData: fallback as MissionsResponse,
        panel: "missions",
        loading: false,
      }));
    }
  }, [state.analyzeData, state.weatherData]);

  const setRouteData = useCallback((routeData: RouteData) => {
    setState((s) => ({ ...s, routeData, loading: false }));
  }, []);

  const showTicket = useCallback(() => {
    setState((s) => ({ ...s, panel: "ticket", ticketZoneIndex: 0 }));
  }, []);

  const nextTicketZone = useCallback(() => {
    setState((s) => ({ ...s, ticketZoneIndex: s.ticketZoneIndex + 1 }));
  }, []);

  /** Skip directly to "All Complete" — for demo video */
  const skipToComplete = useCallback(() => {
    setState((s) => {
      const total = s.missionsData?.missions.length ?? 0;
      return { ...s, ticketZoneIndex: total };
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      panel: "intro-problem",
      loading: false,
      analyzeData: null,
      weatherData: null,
      missionsData: null,
      routeData: null,
      selectedZone: null,
      ticketZoneIndex: 0,
    });
  }, []);

  return {
    state,
    fetchAnalysis,
    selectZone,
    advanceIntro,
    revealAnalysis,
    runWeather,
    runMissions,
    setRouteData,
    showTicket,
    nextTicketZone,
    skipToComplete,
    reset,
  };
}
