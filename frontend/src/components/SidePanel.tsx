import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppState } from "../hooks/useAppState";
import type { PanelState, Severity, RouteData } from "../types/api";
import { FIELD } from "../config/field";

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

const PANEL_STEPS: PanelState[] = ["field-info", "analysis", "weather", "missions", "ticket"];

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
}: SidePanelProps) {
  const stepIndex = PANEL_STEPS.indexOf(state.panel);
  const isIntro = state.panel === "intro-problem" || state.panel === "intro-solution";

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
        <div className={`flex-1 min-h-0 ${isIntro ? "" : "overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"}`}>
          <AnimatePresence mode="wait">
            <motion.div key={state.panel} {...panelAnim}>
              {state.panel === "intro-problem" && <IntroProblem />}
              {state.panel === "intro-solution" && <IntroSolution />}
              {state.panel === "field-info" && <FieldInfo />}
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
            <ActionButton label="Analyze Field Health" loading={loading} onClick={onAnalyze} />
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
      <h2 className="text-[22px] font-bold leading-tight text-white/90 mb-4 whitespace-nowrap">
        You can't scout what you can't see.
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

function FieldInfo() {
  return (
    <div className="space-y-5">
      <InfoRow label="Location" value={FIELD.name} />
      <InfoRow label="Crop" value={FIELD.crop} />
      <InfoRow
        label="Analysis Period"
        value={formatDateRange(FIELD.date_start, FIELD.date_end)}
        mono
      />
      <InfoRow label="Field Area" value={`${FIELD.area_acres} acres`} mono />
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

      {/* Real data source badge */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-500/[0.06] border border-blue-500/15">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        <p className="text-[9px] text-blue-400/70 font-mono tracking-wide">
          Sentinel-2 L2A · 10m resolution · {data.field.date_start} vs {data.field.date_end}
        </p>
      </div>

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
        const severity: Severity = m.severity;
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
              <span className="text-red-400/80">${m.yield_at_risk.toLocaleString()}</span>
            </div>
          </div>
        );
      })}

      {/* Summary bar */}
      <div className="pt-2.5 mt-1 border-t border-white/[0.06]">
        <div className="flex items-center justify-between text-[11px] text-white/30 font-mono">
          <span>{data.summary.total_zones} zones</span>
          <span>~{data.summary.estimated_hours} hrs</span>
          <span>{data.summary.crew_required} crew</span>
        </div>
        <div className="mt-2 flex items-center justify-between px-2.5 py-2 rounded-lg bg-red-500/[0.06] border border-red-500/15">
          <span className="text-[9px] text-red-400/60 uppercase tracking-widest">Yield at Risk</span>
          <span className="text-sm font-mono font-bold text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.4)]">
            ${data.summary.total_yield_at_risk.toLocaleString()}
          </span>
        </div>
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

type BriefingPhase = "scanning" | "ready";

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
  const [phase, setPhase] = useState<BriefingPhase>("scanning");

  const isAllDone = zoneIndex >= missions.length;
  const m = isAllDone ? null : missions[zoneIndex];

  // Auto-transition: scanning → ready after brief delay
  useEffect(() => {
    setPhase("scanning");
    const timer = setTimeout(() => setPhase("ready"), 800);
    return () => clearTimeout(timer);
  }, [zoneIndex]);

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

  const severity: Severity = m.severity;
  const isLastZone = zoneIndex === missions.length - 1;
  const dropPct = Math.abs(Math.round(m.ndvi_drop * 100));

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

      {/* Scanning state */}
      {phase === "scanning" && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500/40 border-t-blue-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-blue-400/60 animate-pulse" />
            </div>
          </div>
          <p className="text-[11px] text-white/40 tracking-wide">
            Analyzing Zone {m.zone_id}...
          </p>
        </div>
      )}

      {/* Zone briefing card */}
      {phase === "ready" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-3"
        >
          {/* Zone header */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-xl font-bold ${SEVERITY_COLOR[severity]} ${SEVERITY_GLOW[severity]}`}
                >
                  Zone {m.zone_id}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${SEVERITY_BG[severity]}`}
                >
                  {severity.toUpperCase()}
                </span>
              </div>
              <span className="text-[10px] text-white/25 font-mono">
                P{m.priority}
              </span>
            </div>

            {/* Key metrics */}
            <div className="flex gap-2">
              <div className="flex-1 bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.05]">
                <p className="text-[9px] text-white/30 uppercase">Area</p>
                <p className="text-sm font-mono font-bold text-white/80 mt-0.5">
                  {m.area_acres} ac
                </p>
              </div>
              <div className="flex-1 bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.05] border-l-2 border-l-red-500/40">
                <p className="text-[9px] text-white/30 uppercase">Decline</p>
                <p className="text-sm font-mono font-bold text-red-400 mt-0.5 drop-shadow-[0_0_6px_rgba(248,113,113,0.4)]">
                  {dropPct}%
                </p>
              </div>
              <div className="flex-1 bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.05] border-l-2 border-l-amber-500/40">
                <p className="text-[9px] text-white/30 uppercase">At Risk</p>
                <p className="text-sm font-mono font-bold text-amber-400 mt-0.5 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]">
                  ${m.yield_at_risk.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Decline bar */}
            <div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(dropPct * 5, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className={`h-full rounded-full ${
                    severity === "high"
                      ? "bg-gradient-to-r from-red-500 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                      : severity === "medium"
                        ? "bg-gradient-to-r from-amber-500 to-amber-400"
                        : "bg-gradient-to-r from-yellow-500 to-yellow-400"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* AI Diagnosis */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-blue-500/[0.06] border border-blue-500/20 rounded-xl p-4"
          >
            <p className="text-[9px] text-blue-400/60 uppercase tracking-[0.15em] mb-1.5">
              AI Diagnosis
            </p>
            <p className="text-[12px] text-blue-200/90 leading-relaxed">
              {m.finding}
            </p>
          </motion.div>

          {/* Recommended Action */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl p-4"
          >
            <p className="text-[9px] text-emerald-400/60 uppercase tracking-[0.15em] mb-1.5">
              Recommended Action
            </p>
            <p className="text-[12px] text-emerald-200/90 leading-relaxed">
              {m.action}
            </p>
          </motion.div>

          {/* Zone Complete → Next */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.7 }}
          >
            <button
              onClick={onNextZone}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-[13px] font-medium rounded-xl transition-all shadow-[0_0_16px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {isLastZone
                ? "Complete All Zones"
                : `Zone Complete → ${missions[zoneIndex + 1].zone_id}`}
            </button>
          </motion.div>
        </motion.div>
      )}
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
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  variant?: "blue" | "green";
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
      {loading ? "Processing..." : label}
    </button>
  );
}
