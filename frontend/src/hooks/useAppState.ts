import { useState, useCallback } from "react";
import type {
  PanelState,
  AnalyzeResponse,
  WeatherResponse,
  MissionsResponse,
} from "../types/api";
import { analyzeField, fetchWeather, fetchMissions } from "../services/api";

export interface AppState {
  panel: PanelState;
  loading: boolean;
  analyzeData: AnalyzeResponse | null;
  weatherData: WeatherResponse | null;
  missionsData: MissionsResponse | null;
}

export function useAppState() {
  const [state, setState] = useState<AppState>({
    panel: "field-info",
    loading: false,
    analyzeData: null,
    weatherData: null,
    missionsData: null,
  });

  const runAnalysis = useCallback(async (): Promise<AnalyzeResponse> => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await analyzeField();
      setState((s) => ({ ...s, analyzeData: data, panel: "analysis", loading: false }));
      return data;
    } catch {
      setState((s) => ({ ...s, loading: false }));
      // Fallback to mock on error
      const { default: fallback } = await import("../mocks/mockAnalyze.json");
      const data = fallback as AnalyzeResponse;
      setState((s) => ({ ...s, analyzeData: data, panel: "analysis", loading: false }));
      return data;
    }
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

  const showTicket = useCallback(() => {
    setState((s) => ({ ...s, panel: "ticket" }));
  }, []);

  const reset = useCallback(() => {
    setState({
      panel: "field-info",
      loading: false,
      analyzeData: null,
      weatherData: null,
      missionsData: null,
    });
  }, []);

  return { state, runAnalysis, runWeather, runMissions, showTicket, reset };
}
