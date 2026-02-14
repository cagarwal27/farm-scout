import { useState, useCallback } from "react";
import type {
  PanelState,
  AnalyzeResponse,
  WeatherResponse,
  MissionsResponse,
  RouteData,
} from "../types/api";
import { analyzeField, fetchWeather, fetchMissions } from "../services/api";
import { DEFAULT_FIELD, type FieldConfig } from "../config/field";

export interface AppState {
  panel: PanelState;
  loading: boolean;
  error: string | null;
  fieldConfig: FieldConfig;
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
    error: null,
    fieldConfig: DEFAULT_FIELD,
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
      if (s.panel === "intro-solution") return { ...s, panel: "field-select" };
      return s;
    });
  }, []);

  /** Set the field configuration (from user drawing or saved field) */
  const setFieldConfig = useCallback((config: FieldConfig) => {
    setState((s) => ({ ...s, fieldConfig: config }));
  }, []);

  /** Confirm field selection and advance to field-info */
  const confirmFieldSelection = useCallback(() => {
    setState((s) => ({ ...s, panel: "field-info", error: null }));
  }, []);

  /** Fetch analysis data — stores it but does NOT switch panel (spinner stays) */
  const fetchAnalysis = useCallback(async (): Promise<AnalyzeResponse | null> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await analyzeField(state.fieldConfig);
      setState((s) => ({ ...s, analyzeData: data }));
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Analysis failed";
      setState((s) => ({ ...s, loading: false, error: message }));
      return null;
    }
  }, [state.fieldConfig]);

  /** Reveal analysis results — switches panel and clears spinner */
  const revealAnalysis = useCallback(() => {
    setState((s) => ({ ...s, panel: "analysis", loading: false }));
  }, []);

  const runWeather = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetchWeather(state.fieldConfig);
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
  }, [state.fieldConfig]);

  const runMissions = useCallback(async () => {
    if (!state.analyzeData) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetchMissions(state.analyzeData.hotspots);
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
  }, [state.analyzeData]);

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
      error: null,
      fieldConfig: DEFAULT_FIELD,
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
    setFieldConfig,
    confirmFieldSelection,
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
