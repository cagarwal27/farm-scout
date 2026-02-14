import { useState, useEffect } from "react";
import type { FieldConfig } from "../config/field";
import { listFields, type SavedFieldInfo } from "../services/api";

interface FieldSelectorProps {
  drawnAoi: { type: "Polygon"; coordinates: number[][][] } | null;
  drawnCenter: [number, number] | null;
  onActivateDraw: () => void;
  onConfirm: (config: FieldConfig, monitor: boolean) => void;
  onLoadSaved: (fieldId: string) => void;
}

// California bounds
const CA_LAT_MIN = 32.5;
const CA_LAT_MAX = 42.0;
const CA_LON_MIN = -124.5;
const CA_LON_MAX = -114.0;

export function FieldSelector({
  drawnAoi,
  drawnCenter,
  onActivateDraw,
  onConfirm,
  onLoadSaved,
}: FieldSelectorProps) {
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [monitor, setMonitor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFields, setSavedFields] = useState<SavedFieldInfo[]>([]);

  // Load saved fields on mount
  useEffect(() => {
    listFields()
      .then(setSavedFields)
      .catch(() => setSavedFields([]));
  }, []);

  const hasAoi = drawnAoi !== null && drawnCenter !== null;
  const hasDates = dateStart !== "" && dateEnd !== "";
  const canConfirm = hasAoi && hasDates;

  const handleConfirm = () => {
    if (!drawnAoi || !drawnCenter) return;

    // Validate California bounds
    if (
      drawnCenter[1] < CA_LAT_MIN ||
      drawnCenter[1] > CA_LAT_MAX ||
      drawnCenter[0] < CA_LON_MIN ||
      drawnCenter[0] > CA_LON_MAX
    ) {
      setError("Selected area is outside California bounds.");
      return;
    }

    // Validate date gap
    const d1 = new Date(dateStart);
    const d2 = new Date(dateEnd);
    const gap = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
    if (gap < 5) {
      setError("Dates must be at least 5 days apart for change detection.");
      return;
    }
    if (d2 <= d1) {
      setError("End date must be after start date.");
      return;
    }

    setError(null);

    // Compute area from the drawn AOI
    const coords = drawnAoi.coordinates[0];
    const lonSpan = Math.abs(coords[1][0] - coords[0][0]);
    const latSpan = Math.abs(coords[0][1] - coords[2][1]);
    const kmPerLon = 111.32 * Math.cos((drawnCenter[1] * Math.PI) / 180);
    const areaKm2 = lonSpan * kmPerLon * latSpan * 111;
    const areaAcres = Math.round(areaKm2 * 247.105 * 10) / 10;

    const config: FieldConfig = {
      name: name || `${drawnCenter[1].toFixed(2)}N, ${Math.abs(drawnCenter[0]).toFixed(2)}W`,
      crop: crop || "Unknown",
      area_acres: areaAcres,
      date_start: dateStart,
      date_end: dateEnd,
      center: drawnCenter,
      zoom: 15,
      aoi: drawnAoi,
    };

    onConfirm(config, monitor);
  };

  return (
    <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
      {/* Draw area section */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
          Select Field
        </p>
        <button
          onClick={onActivateDraw}
          className={`w-full py-2.5 rounded-lg text-[13px] font-medium transition-all ${
            hasAoi
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20"
          }`}
        >
          {hasAoi ? "Area Selected — Click to Redraw" : "Draw Area on Map"}
        </button>
        {hasAoi && drawnCenter && (
          <p className="text-[10px] text-white/25 mt-1.5 font-mono">
            Center: {drawnCenter[1].toFixed(4)}N, {Math.abs(drawnCenter[0]).toFixed(4)}W
          </p>
        )}
      </div>

      {/* Field details */}
      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-widest block mb-1">
            Location Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. North Orchard"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-blue-500/40"
          />
        </div>

        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-widest block mb-1">
            Crop Type
          </label>
          <input
            type="text"
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
            placeholder="e.g. Almond, Walnut"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-blue-500/40"
          />
        </div>
      </div>

      {/* Date range */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">
          Analysis Period
        </p>
        <p className="text-[10px] text-white/15 mb-2">
          Choose dates at least 5 days apart for change detection
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-white/25 block mb-0.5">Start</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 focus:outline-none focus:border-blue-500/40 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-[9px] text-white/25 block mb-0.5">End</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 focus:outline-none focus:border-blue-500/40 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* Monitor toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-white/60">Save & Monitor</p>
          <p className="text-[9px] text-white/25">Auto-refresh with new satellite data</p>
        </div>
        <button
          onClick={() => setMonitor(!monitor)}
          className={`w-10 h-5 rounded-full transition-all flex items-center ${
            monitor ? "bg-blue-500 justify-end" : "bg-white/[0.08] justify-start"
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full mx-0.5 transition-all ${
              monitor ? "bg-white" : "bg-white/30"
            }`}
          />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
          {error}
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-blue-600/30 disabled:to-blue-500/30 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.15)]"
      >
        Confirm Selection
      </button>

      {/* Saved fields */}
      {savedFields.length > 0 && (
        <div className="pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
            Monitored Fields
          </p>
          <div className="space-y-1.5">
            {savedFields.map((f) => (
              <button
                key={f.field_id}
                onClick={() => onLoadSaved(f.field_id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition-all text-left"
              >
                <div>
                  <p className="text-[12px] text-white/70">
                    {f.location_name || f.field_id}
                  </p>
                  <p className="text-[10px] text-white/25">
                    {f.crop_type} · {f.status}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      f.has_result ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <span className="text-[10px] text-white/20">
                    {f.has_result ? "Ready" : "Pending"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
