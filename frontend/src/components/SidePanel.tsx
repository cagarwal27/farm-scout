import type { AppState } from "../hooks/useAppState";
import type { Severity } from "../types/api";

interface SidePanelProps {
  state: AppState;
  loading: boolean;
  onAnalyze: () => void;
  onWeather: () => void;
  onMissions: () => void;
  onTicket: () => void;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-yellow-400",
};

const SEVERITY_BG: Record<Severity, string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export function SidePanel({
  state,
  loading,
  onAnalyze,
  onWeather,
  onMissions,
  onTicket,
}: SidePanelProps) {
  return (
    <div className="h-full bg-gray-900 text-slate-100 p-6 flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">FarmSense</h1>
        <p className="text-xs text-slate-400 mt-1">
          Satellite Crop Intelligence
        </p>
      </div>
      <div className="border-t border-slate-800 mb-6" />

      {/* Panel content based on state */}
      <div className="flex-1 overflow-y-auto">
        {state.panel === "field-info" && <FieldInfo />}
        {state.panel === "analysis" && state.analyzeData && (
          <AnalysisResults data={state.analyzeData} />
        )}
        {state.panel === "weather" && state.weatherData && (
          <WeatherContext data={state.weatherData} />
        )}
        {state.panel === "missions" && state.missionsData && (
          <MissionsPanel data={state.missionsData} />
        )}
        {state.panel === "ticket" && state.missionsData && (
          <FieldTicket missions={state.missionsData.missions} />
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-4 space-y-2">
        {state.panel === "field-info" && (
          <ActionButton
            label="Analyze Field Health"
            loading={loading}
            onClick={onAnalyze}
          />
        )}
        {state.panel === "analysis" && (
          <ActionButton
            label="Explain Anomalies"
            loading={loading}
            onClick={onWeather}
          />
        )}
        {state.panel === "weather" && (
          <ActionButton
            label="Generate Missions"
            loading={loading}
            onClick={onMissions}
          />
        )}
        {state.panel === "missions" && (
          <ActionButton
            label="Create Field Ticket"
            loading={loading}
            onClick={onTicket}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function FieldInfo() {
  return (
    <div className="space-y-4">
      <InfoRow label="Location" value="Yolo County, CA" />
      <InfoRow label="Crop" value="Almond" />
      <InfoRow label="Analysis Period" value="Jul 1 – Jul 14, 2024" mono />
      <InfoRow label="Field Area" value="412.5 acres" mono />
    </div>
  );
}

function AnalysisResults({
  data,
}: {
  data: NonNullable<AppState["analyzeData"]>;
}) {
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        {data.summary.clusters_found} anomaly clusters detected across{" "}
        {data.summary.total_affected_acres} acres
      </p>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Clusters" value={data.summary.clusters_found} />
        <StatCard
          label="Affected"
          value={`${data.summary.total_affected_acres} ac`}
        />
        <StatCard
          label="Avg NDVI Drop"
          value={`${Math.round(data.summary.avg_ndvi_drop * 100)}%`}
          negative
        />
        <StatCard
          label="Max NDVI Drop"
          value={`${Math.round(data.summary.max_ndvi_drop * 100)}%`}
          negative
        />
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">
          Hotspot Zones
        </p>
        <div className="space-y-2">
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
                className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-slate-800/50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-mono font-bold ${SEVERITY_COLORS[p.severity]}`}
                  >
                    {p.cluster_id}
                  </span>
                  <span className="text-slate-300">{p.area_acres} ac</span>
                </div>
                <span className={`text-xs font-mono ${SEVERITY_COLORS[p.severity]}`}>
                  {Math.round(p.ndvi_drop * 100)}%
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
  const maxTemp = Math.max(...data.daily.map((d) => d.temp_max_f));

  return (
    <div className="space-y-5">
      {/* Mini temperature bars */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">
          Temperature (14 days)
        </p>
        <div className="flex items-end gap-1 h-20">
          {data.daily.map((d) => {
            const pct = (d.temp_max_f / maxTemp) * 100;
            const isHot = d.temp_max_f >= 100;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div
                  className={`w-full rounded-t ${isHot ? "bg-red-500" : "bg-blue-500/60"}`}
                  style={{ height: `${pct}%` }}
                />
                <span className="text-[8px] text-slate-500">
                  {d.date.slice(8)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">
          Alerts
        </p>
        <div className="space-y-2">
          {data.alerts.map((a, i) => (
            <div
              key={i}
              className={`text-xs px-3 py-2 rounded border ${SEVERITY_BG[a.severity]}`}
            >
              {a.label}
            </div>
          ))}
        </div>
      </div>

      {/* Correlation */}
      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          Correlated Stress Factors
        </p>
        <p className="text-sm">
          <span className="text-red-400">{data.correlation.primary}</span>
          {" (primary)"}
        </p>
        <p className="text-sm text-slate-400">
          {data.correlation.secondary} (secondary)
        </p>
        <span
          className={`inline-block mt-2 text-xs px-2 py-0.5 rounded border ${
            data.correlation.confidence === "high"
              ? "border-green-500/30 text-green-400"
              : "border-amber-500/30 text-amber-400"
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
}: {
  data: NonNullable<AppState["missionsData"]>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
        Scout Missions
      </p>
      {data.missions.map((m) => {
        const severity: Severity =
          m.ndvi_drop <= -0.2 ? "high" : m.ndvi_drop <= -0.15 ? "medium" : "low";
        return (
          <div
            key={m.zone_id}
            className="bg-slate-800/50 rounded p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-mono font-bold ${SEVERITY_COLORS[severity]}`}
                >
                  Zone {m.zone_id}
                </span>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                  P{m.priority}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {m.area_acres} ac | {Math.round(m.ndvi_drop * 100)}%
              </span>
            </div>
            <div className="space-y-1">
              {m.checklist.map((item, i) => (
                <label key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-emerald-500"
                  />
                  {item}
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {/* Summary bar */}
      <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
        <span>{data.summary.total_zones} zones</span>
        <span>~{data.summary.estimated_hours} hrs</span>
        <span>{data.summary.crew_required} crew</span>
      </div>
    </div>
  );
}

function FieldTicket({
  missions,
}: {
  missions: NonNullable<AppState["missionsData"]>["missions"];
}) {
  const m = missions[0];
  if (!m) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider">
        Field Ticket — Zone {m.zone_id}
      </p>
      <div className="bg-slate-800 rounded-lg p-4 space-y-4 max-w-xs mx-auto">
        <div className="text-center">
          <span className="text-2xl font-bold text-red-400">
            Zone {m.zone_id}
          </span>
          <p className="text-xs text-slate-400 font-mono mt-1">
            {m.centroid[1].toFixed(4)}N, {Math.abs(m.centroid[0]).toFixed(4)}W
          </p>
        </div>

        <div className="border-t border-slate-700" />

        <div className="space-y-2">
          {m.checklist.map((item, i) => (
            <label
              key={i}
              className="flex items-start gap-2 text-sm text-slate-200"
            >
              <input
                type="checkbox"
                className="mt-0.5 accent-emerald-500"
              />
              {item}
            </label>
          ))}
        </div>

        <button className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors">
          Upload Photo
        </button>
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
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-medium mt-1 ${mono ? "font-mono" : ""}`}>
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
    <div className="bg-slate-800/50 rounded p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-lg font-mono font-bold mt-1 ${negative ? "text-red-400" : "text-slate-100"}`}
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
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
      onClick={onClick}
      disabled={loading}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
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
      )}
      {loading ? "Processing..." : label}
    </button>
  );
}
