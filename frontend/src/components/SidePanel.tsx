import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppState } from "../hooks/useAppState";
import type { PanelState, Severity, RouteData } from "../types/api";
import type { FieldConfig } from "../config/field";
import { FieldSelector } from "./FieldSelector";

interface SidePanelProps {
  state: AppState;
  loading: boolean;
  onAdvanceIntro: () => void;
  onAnalyze: () => void;
  onWeather: () => void;
  onMissions: () => void;
  onRoute: () => void;
  onTicket: () => void;
  onNextZone: () => void;
  onSkipToComplete: () => void;
  // Field selection props
  drawnAoi: { type: "Polygon"; coordinates: number[][][] } | null;
  drawnCenter: [number, number] | null;
  onActivateDraw: () => void;
  onFieldConfirm: (config: FieldConfig, monitor: boolean) => void;
  onLoadSaved: (fieldId: string) => void;
  // Parcel browser props
  selectedParcel?: GeoJSON.Feature | null;
  zoomSufficient?: boolean;
  parcelLoading?: boolean;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-yellow-400",
};

const SEVERITY_GLOW: Record<Severity, string> = {
  high: "drop-shadow-[0_0_6px_rgba(248,113,113,0.5)]",
  medium: "drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]",
  low: "drop-shadow-[0_0_6px_rgba(250,204,21,0.3)]",
};

const SEVERITY_BG: Record<Severity, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const PANEL_STEPS: PanelState[] = ["field-select", "field-info", "analysis", "weather", "missions", "ticket"];

const panelAnim = {
  initial: { opacity: 0, y: 16, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -12, filter: "blur(4px)" },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
};

export function SidePanel({
  state,
  loading,
  onAdvanceIntro,
  onAnalyze,
  onWeather,
  onMissions,
  onRoute,
  onTicket,
  onNextZone,
  onSkipToComplete,
  drawnAoi,
  drawnCenter,
  onActivateDraw,
  onFieldConfirm,
  onLoadSaved,
  selectedParcel,
  zoomSufficient,
  parcelLoading,
}: SidePanelProps) {
  const stepIndex = PANEL_STEPS.indexOf(state.panel);
  const isIntro = state.panel === "intro-problem" || state.panel === "intro-solution";
  const isFieldSelect = state.panel === "field-select";

  return (
    <div className={`${isIntro ? "" : "h-full"} flex flex-col rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl backdrop-blur-2xl bg-black/30`}>
      {/* Gradient accent line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-blue-500/40 via-emerald-500/40 to-blue-500/40" />

      <div className={`flex flex-col flex-1 p-5 ${isIntro ? "" : "overflow-hidden"}`}>
        {/* Header — hidden during intro */}
        {!isIntro && (
          <div className="mb-4">
            <h1 className="text-base font-semibold tracking-tight text-white/90">
              FarmSense
            </h1>
            <p className="text-[11px] text-white/30 mt-0.5 tracking-wide">
              Satellite Crop Intelligence
            </p>
          </div>
        )}

        {/* Step progress bar — hidden during intro */}
        {!isIntro && (
          <div className="flex items-center gap-1.5 mb-5">
            {PANEL_STEPS.map((step, i) => (
              <div
                key={step}
                className={`h-[3px] flex-1 rounded-full transition-all duration-500 ${
                  i < stepIndex
                    ? "bg-emerald-500/60"
                    : i === stepIndex
                      ? "bg-blue-500/80"
                      : "bg-white/[0.06]"
                }`}
              />
            ))}
          </div>
        )}

        {/* Panel content — animated transitions */}
        <div className={`flex-1 ${isIntro ? "" : "overflow-hidden"}`}>
          <AnimatePresence mode="wait">
            <motion.div key={state.panel} {...panelAnim} className="h-full">
              {state.panel === "intro-problem" && <IntroProblem />}
              {state.panel === "intro-solution" && <IntroSolution />}
              {state.panel === "field-select" && (
                <FieldSelector
                  drawnAoi={drawnAoi}
                  drawnCenter={drawnCenter}
                  onActivateDraw={onActivateDraw}
                  onConfirm={onFieldConfirm}
                  onLoadSaved={onLoadSaved}
                  selectedParcel={selectedParcel}
                  zoomSufficient={zoomSufficient}
                  parcelLoading={parcelLoading}
                />
              )}
              {state.panel === "field-info" && (
                <FieldInfo fieldConfig={state.fieldConfig} />
              )}
              {state.panel === "analysis" && state.analyzeData && (
                <AnalysisResults data={state.analyzeData} />
              )}
              {state.panel === "weather" && state.weatherData && (
                <WeatherContext data={state.weatherData} />
              )}
              {state.panel === "missions" && state.missionsData && (
                <MissionsPanel
                  data={state.missionsData}
                  routeData={state.routeData}
                  selectedZone={state.selectedZone}
                />
              )}
              {state.panel === "ticket" && state.missionsData && (
                <FieldTicket
                  missions={state.missionsData.missions}
                  zoneIndex={state.ticketZoneIndex}
                  onNextZone={onNextZone}
                  onSkipToComplete={onSkipToComplete}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Action buttons */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          {isIntro && (
            <ActionButton
              label={state.panel === "intro-problem" ? "Continue" : "Start Demo"}
              loading={false}
              onClick={onAdvanceIntro}
            />
          )}
          {state.panel === "field-info" && (
            <>
              <ActionButton
                label="Analyze Field Health"
                loadingLabel="Analyzing satellite data..."
                loading={loading}
                onClick={onAnalyze}
              />
              {state.error && (
                <div className="mt-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                  {state.error}
                </div>
              )}
            </>
          )}
          {state.panel === "analysis" && (
            <ActionButton label="Explain Anomalies" loading={loading} onClick={onWeather} />
          )}
          {state.panel === "weather" && (
            <ActionButton label="Generate Missions" loading={loading} onClick={onMissions} />
          )}
          {state.panel === "missions" && !state.routeData && (
            <ActionButton label="Optimize Route" loading={loading} onClick={onRoute} variant="green" />
          )}
          {state.panel === "missions" && state.routeData && (
            <ActionButton label="Create Field Ticket" loading={loading} onClick={onTicket} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Intro ---------- */

function IntroProblem() {
  return (
    <div className="flex flex-col justify-center items-center text-center py-4">
      <p className="text-[10px] text-red-400/70 uppercase tracking-[0.2em] mb-4">
        The Problem
      </p>
      <h2 className="text-[24px] font-bold leading-tight text-white/90 mb-4 whitespace-nowrap">
        400 acres. Trees dying in silence.
      </h2>
      <p className="text-[14px] text-white/40 leading-relaxed mb-3">
        Heat stress, irrigation failure, and pest damage are destroying crops
        across hundreds of acres, invisible from the ground until it's too
        late.
      </p>
      <p className="text-[13px] text-white/25 leading-relaxed">
        By the time a farmer sees the damage, yield is already lost.
      </p>
    </div>
  );
}

function IntroSolution() {
  return (
    <div className="flex flex-col justify-center py-4">
      <p className="text-[10px] text-blue-400/70 uppercase tracking-[0.2em] mb-4">
        The Solution
      </p>
      <h2 className="text-[28px] font-bold leading-tight text-white/90 mb-5">
        See it from space.
        <br />
        <span className="text-blue-400 drop-shadow-[0_0_12px_rgba(59,130,246,0.3)]">
          Fix it from the ground.
        </span>
      </h2>
      <div className="space-y-3">
        {[
          ["Detect", "Satellite NDVI change detection finds stress zones invisible to the eye"],
          ["Diagnose", "Weather correlation identifies heat, drought, or irrigation as the cause"],
          ["Deploy", "Auto-generated scout missions with optimized routes and field checklists"],
        ].map(([title, desc]) => (
          <div key={title} className="flex gap-3">
            <div className="w-1 rounded-full bg-blue-500/40 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">{title}</p>
              <p className="text-[11px] text-white/30 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function FieldInfo({ fieldConfig }: { fieldConfig: FieldConfig }) {
  return (
    <div className="space-y-5">
      <InfoRow label="Location" value={fieldConfig.name} />
      <InfoRow label="Crop" value={fieldConfig.crop} />
      <InfoRow
        label="Analysis Period"
        value={formatDateRange(fieldConfig.date_start, fieldConfig.date_end)}
        mono
      />
      <InfoRow label="Field Area" value={`${fieldConfig.area_acres} acres`} mono />
    </div>
  );
}

function AnalysisResults({
  data,
}: {
  data: NonNullable<AppState["analyzeData"]>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-white/40">
        {data.summary.clusters_found} stress zones found —{" "}
        {data.summary.total_affected_acres} acres affected
      </p>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Stress Zones" value={data.summary.clusters_found} />
        <StatCard label="Affected" value={`${data.summary.total_affected_acres} ac`} />
        <StatCard
          label="Avg Decline"
          value={`${Math.abs(Math.round(data.summary.avg_ndvi_drop * 100))}%`}
          negative
        />
        <StatCard
          label="Worst Decline"
          value={`${Math.abs(Math.round(data.summary.max_ndvi_drop * 100))}%`}
          negative
        />
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2.5">
          Stress Zones
        </p>
        <div className="space-y-1.5">
          {data.hotspots.features.map((f) => {
            const p = f.properties as {
              cluster_id: string;
              area_acres: number;
              ndvi_drop: number;
              severity: Severity;
            };
            return (
              <div
                key={p.cluster_id}
                className="flex items-center justify-between text-[13px] py-1.5 px-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-xs font-mono font-bold ${SEVERITY_COLOR[p.severity]} ${SEVERITY_GLOW[p.severity]}`}
                  >
                    {p.cluster_id}
                  </span>
                  <span className="text-white/60">{p.area_acres} ac</span>
                </div>
                <span className={`text-xs font-mono font-medium ${SEVERITY_COLOR[p.severity]}`}>
                  {Math.abs(Math.round(p.ndvi_drop * 100))}% decline
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeatherContext({
  data,
}: {
  data: NonNullable<AppState["weatherData"]>;
}) {
  const temps = data.daily.map((d) => d.temp_max_f);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);
  const range = maxTemp - minTemp || 1;

  return (
    <div className="space-y-4">
      {/* Mini temperature bars */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
          Temperature ({data.daily.length} days)
        </p>
        <div className="flex items-center justify-between text-[9px] font-mono text-white/20 mb-1.5">
          <span>{Math.round(minTemp)}°F</span>
          <span>{Math.round(maxTemp)}°F</span>
        </div>
        <div className="flex gap-[3px] h-16 px-1">
          {data.daily.map((d) => {
            const t = (d.temp_max_f - minTemp) / range;
            const pct = 25 + t * 75;
            const colorClass =
              t >= 0.7
                ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                : t >= 0.35
                  ? "bg-amber-500/70"
                  : "bg-blue-500/50";
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end gap-0.5"
              >
                <div
                  className={`w-full rounded-sm ${colorClass}`}
                  style={{ height: `${pct}%` }}
                />
                <span className="text-[7px] text-white/25">{d.date.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
          Alerts
        </p>
        <div className="space-y-1.5">
          {data.alerts.map((a, i) => (
            <div
              key={i}
              className={`text-[11px] px-3 py-2 rounded-lg border ${SEVERITY_BG[a.severity]}`}
            >
              {a.label}
            </div>
          ))}
        </div>
      </div>

      {/* Correlation */}
      <div className="pt-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
          Likely Causes
        </p>
        <p className="text-[13px]">
          <span className="text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.4)]">
            {data.correlation.primary}
          </span>
          <span className="text-white/30 ml-1.5">(primary)</span>
        </p>
        <p className="text-[13px] text-white/50 mt-0.5">
          {data.correlation.secondary}
          <span className="text-white/30 ml-1.5">(secondary)</span>
        </p>
        <span
          className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-md border ${
            data.correlation.confidence === "high"
              ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/10"
              : "border-amber-500/20 text-amber-400 bg-amber-500/10"
          }`}
        >
          {data.correlation.confidence} confidence
        </span>
      </div>
    </div>
  );
}

function MissionsPanel({
  data,
  routeData,
  selectedZone,
}: {
  data: NonNullable<AppState["missionsData"]>;
  routeData: RouteData | null;
  selectedZone: string | null;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
        Scout Missions
      </p>

      {/* Compact mission rows — no checklists, no scroll needed */}
      {data.missions.map((m) => {
        const severity: Severity =
          m.ndvi_drop <= -0.10 ? "high" : m.ndvi_drop <= -0.08 ? "medium" : "low";
        const isSelected = selectedZone === m.zone_id;
        return (
          <div
            key={m.zone_id}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-300 ${
              isSelected
                ? "bg-white/[0.08] ring-1 ring-blue-500/40"
                : "bg-white/[0.03] border border-white/[0.04]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`text-sm font-mono font-bold ${SEVERITY_COLOR[severity]} ${SEVERITY_GLOW[severity]}`}
              >
                {m.zone_id}
              </span>
              <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-md font-medium">
                P{m.priority}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-white/40">
              <span>{m.area_acres} ac</span>
              <span className={SEVERITY_COLOR[severity]}>
                {Math.abs(Math.round(m.ndvi_drop * 100))}% decline
              </span>
            </div>
          </div>
        );
      })}

      {/* Summary bar */}
      <div className="pt-2.5 mt-1 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-white/30 font-mono">
        <span>{data.summary.total_zones} zones</span>
        <span>~{data.summary.estimated_hours} hrs</span>
        <span>{data.summary.crew_required} crew</span>
      </div>

      {/* Route summary */}
      {routeData && (
        <div className="pt-2.5 border-t border-white/[0.06]">
          <div className="bg-emerald-500/[0.07] border border-emerald-500/20 rounded-lg p-3">
            <p className="text-[10px] text-emerald-400/70 uppercase tracking-widest mb-1.5">
              Optimal Route
            </p>
            <div className="flex items-center justify-between text-sm font-mono">
              <span className="text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]">
                {routeData.distance_km} km
              </span>
              <span className="text-white/15">|</span>
              <span className="text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]">
                {routeData.duration_min} min
              </span>
            </div>
            <p className="text-[9px] text-white/20 mt-1">Field path estimate</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** AI findings per zone — ties the whole story together */
const ZONE_FINDINGS: Record<string, string> = {
  A: "Severe leaf scorch from sustained heat exposure. Recommend immediate irrigation adjustment.",
  B: "Canopy stress with early mite activity detected. Recommend targeted pest treatment.",
  C: "Moderate wilting from irrigation deficit. Drip line repair needed in rows 34-38.",
  D: "Minor leaf curling observed. Monitor over next 7 days, no immediate action required.",
  E: "Mild canopy thinning consistent with heat stress. Within acceptable recovery range.",
  F: "Isolated branch dieback in upper canopy. Likely sunburn damage from recent heat spike.",
  G: "Slight yellowing at leaf margins. Early sign of water stress — check emitter flow rates.",
};

type InspectionPhase = "idle" | "checking" | "finding" | "complete";

function FieldTicket({
  missions,
  zoneIndex,
  onNextZone,
  onSkipToComplete,
}: {
  missions: NonNullable<AppState["missionsData"]>["missions"];
  zoneIndex: number;
  onNextZone: () => void;
  onSkipToComplete: () => void;
}) {
  const [phase, setPhase] = useState<InspectionPhase>("idle");
  const [checkedCount, setCheckedCount] = useState(0);

  const isAllDone = zoneIndex >= missions.length;
  const m = isAllDone ? null : missions[zoneIndex];

  // Reset when zone changes
  useEffect(() => {
    setPhase("idle");
    setCheckedCount(0);
  }, [zoneIndex]);

  // Auto-animation: check items one by one
  useEffect(() => {
    if (phase !== "checking" || !m) return;
    if (checkedCount < m.checklist.length) {
      const timer = setTimeout(() => setCheckedCount((c) => c + 1), 300);
      return () => clearTimeout(timer);
    }
    // All items checked → finding
    const timer = setTimeout(() => setPhase("finding"), 500);
    return () => clearTimeout(timer);
  }, [phase, checkedCount, m]);

  // Finding → complete
  useEffect(() => {
    if (phase !== "finding") return;
    const timer = setTimeout(() => setPhase("complete"), 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  // All zones completed
  if (isAllDone) {
    return (
      <div className="space-y-5 text-center py-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/60 mx-auto shadow-[0_0_24px_rgba(16,185,129,0.2)]">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">
            All {missions.length} Zones Complete
          </p>
          <p className="text-[11px] text-white/30 mt-1.5">Field scouting mission finished</p>
        </div>
        <div className="grid grid-cols-5 gap-2 max-w-[240px] mx-auto">
          {missions.map((mi) => (
            <div key={mi.zone_id} className="text-center">
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[9px] text-white/25 mt-1">{mi.zone_id}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!m) return null;

  const severity: Severity =
    m.ndvi_drop <= -0.10 ? "high" : m.ndvi_drop <= -0.08 ? "medium" : "low";
  const isLastZone = zoneIndex === missions.length - 1;
  const finding = ZONE_FINDINGS[m.zone_id] || "Assessment complete.";

  return (
    <div className="space-y-3">
      {/* Zone progress bar */}
      <div className="flex items-center gap-1.5">
        {missions.map((mi, i) => (
          <div
            key={mi.zone_id}
            className={`h-[3px] flex-1 rounded-full transition-all duration-500 ${
              i < zoneIndex
                ? "bg-emerald-500/60"
                : i === zoneIndex
                  ? "bg-blue-500/80"
                  : "bg-white/[0.06]"
            }`}
          />
        ))}
      </div>
      <p className="text-[10px] text-white/30 uppercase tracking-widest">
        Zone {m.zone_id} — {zoneIndex + 1} of {missions.length}
      </p>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
        {/* Zone header */}
        <div className="flex items-center justify-between">
          <div>
            <span
              className={`text-lg font-bold ${SEVERITY_COLOR[severity]} ${SEVERITY_GLOW[severity]}`}
            >
              Zone {m.zone_id}
            </span>
            <p className="text-[11px] text-white/30 font-mono">
              {m.area_acres} ac · {Math.abs(Math.round(m.ndvi_drop * 100))}% health decline
            </p>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-md border ${SEVERITY_BG[severity]}`}
          >
            P{m.priority}
          </span>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Checklist — auto-animated */}
        <div className="space-y-1.5">
          {m.checklist.map((item, i) => {
            const isChecked = i < checkedCount;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 text-[12px] py-1 transition-all duration-300 ${
                  isChecked
                    ? "text-white/30"
                    : phase === "idle"
                      ? "text-white/40"
                      : "text-white/60"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                    isChecked
                      ? "bg-emerald-500/20 border-emerald-500/40"
                      : "border-white/10"
                  }`}
                >
                  {isChecked && (
                    <svg
                      className="w-2.5 h-2.5 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span className={isChecked ? "line-through" : ""}>{item}</span>
              </div>
            );
          })}
        </div>

        {/* AI Finding — fades in after checklist completes */}
        {(phase === "finding" || phase === "complete") && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-blue-500/[0.07] border border-blue-500/20 rounded-lg p-3"
          >
            <p className="text-[10px] text-blue-400/70 uppercase tracking-widest mb-1">
              AI Analysis
            </p>
            <p className="text-[12px] text-blue-300/90 leading-relaxed">
              {finding}
            </p>
          </motion.div>
        )}

        {/* Run Inspection button — idle state */}
        {phase === "idle" && (
          <button
            onClick={() => {
              setPhase("checking");
              setCheckedCount(0);
            }}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-[13px] font-medium rounded-lg transition-all shadow-[0_0_16px_rgba(59,130,246,0.2)]"
          >
            Run Inspection
          </button>
        )}

        {/* In-progress spinner */}
        {phase === "checking" && (
          <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-white/40">
            <svg
              className="animate-spin h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Inspecting...
          </div>
        )}

        {/* Next Zone button — appears when complete */}
        {phase === "complete" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <button
              onClick={onNextZone}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-[13px] font-medium rounded-lg transition-all shadow-[0_0_16px_rgba(16,185,129,0.2)]"
            >
              {isLastZone
                ? "Complete All Zones"
                : `Next → Zone ${missions[zoneIndex + 1].zone_id}`}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ---------- Shared UI ---------- */

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-white/30 uppercase tracking-widest">{label}</p>
      <p className={`text-[15px] font-medium mt-1 text-white/80 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  negative,
}: {
  label: string;
  value: string | number;
  negative?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2.5 bg-white/[0.03] border border-white/[0.05] ${
        negative ? "border-l-2 border-l-red-500/40" : ""
      }`}
    >
      <p className="text-[10px] text-white/30">{label}</p>
      <p
        className={`text-base font-mono font-bold mt-0.5 ${
          negative
            ? "text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.4)]"
            : "text-white/80"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  loading,
  onClick,
  variant = "blue",
  loadingLabel = "Processing...",
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  variant?: "blue" | "green";
  loadingLabel?: string;
}) {
  const colors =
    variant === "green"
      ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-emerald-600/40 disabled:to-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
      : "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-blue-600/40 disabled:to-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)]";

  return (
    <button
      className={`w-full py-2.5 ${colors} disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-xl transition-all flex items-center justify-center gap-2`}
      onClick={onClick}
      disabled={loading}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {loading ? loadingLabel : label}
    </button>
  );
}
