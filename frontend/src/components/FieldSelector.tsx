import { useState, useEffect } from "react";
import type { FieldConfig } from "../config/field";
import { decodeCropCode } from "../config/cropCodes";
import { listFields, type SavedFieldInfo } from "../services/api";

interface FieldSelectorProps {
  drawnAoi: { type: "Polygon"; coordinates: number[][][] } | null;
  drawnCenter: [number, number] | null;
  onActivateDraw: () => void;
  onConfirm: (config: FieldConfig, monitor: boolean) => void;
  onLoadSaved: (fieldId: string) => void;
  selectedParcel?: GeoJSON.Feature | null;
  zoomSufficient?: boolean;
  parcelLoading?: boolean;
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
  selectedParcel,
  zoomSufficient,
  parcelLoading,
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

  // Auto-populate from selected parcel
  useEffect(() => {
    if (!selectedParcel) return;
    const props = selectedParcel.properties ?? {};
    const county = props.COUNTY ?? "";
    const cropCode = props.MAIN_CROP ?? "";
    const cropName = decodeCropCode(cropCode);
    setName(county ? `${county} County \u2014 ${cropName}` : cropName);
    setCrop(cropName);
  }, [selectedParcel]);

  const hasAoi = selectedParcel !== null || (drawnAoi !== null && drawnCenter !== null);
  const hasDates = dateStart !== "" && dateEnd !== "";
  const canConfirm = hasAoi && hasDates;

  const handleConfirm = () => {
    // Validate dates first (common to both paths)
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

    // --- Parcel path ---
    if (selectedParcel) {
      const props = selectedParcel.properties ?? {};
      const geom = selectedParcel.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;

      // Use DWR ACRES or fall back to 0
      const areaAcres = props.ACRES ? Math.round(props.ACRES * 10) / 10 : 0;

      // Compute center from geometry bbox
      const coords =
        geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const pt of coords) {
        if (pt[0] < minLon) minLon = pt[0];
        if (pt[0] > maxLon) maxLon = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }
      const center: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];

      // Compute zoom from bbox extent
      const lonSpan = maxLon - minLon;
      const latSpan = maxLat - minLat;
      const maxSpan = Math.max(lonSpan, latSpan);
      const zoom = Math.min(17, Math.max(13, Math.round(Math.log2(360 / maxSpan) - 1)));

      const aoi: { type: "Polygon"; coordinates: number[][][] } =
        geom.type === "Polygon"
          ? { type: "Polygon", coordinates: geom.coordinates }
          : { type: "Polygon", coordinates: geom.coordinates[0] };

      const config: FieldConfig = {
        name: name || `${center[1].toFixed(2)}N, ${Math.abs(center[0]).toFixed(2)}W`,
        crop: crop || "Unknown",
        area_acres: areaAcres,
        date_start: dateStart,
        date_end: dateEnd,
        center,
        zoom,
        aoi,
      };

      onConfirm(config, monitor);
      return;
    }

    // --- Draw path ---
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

  const parcelProps = selectedParcel?.properties;

  return (
    <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
      {/* Select Field section */}
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
          Select Field
        </p>

        {/* State 1: Parcel or drawn area selected */}
        {selectedParcel ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[12px] text-emerald-400 font-medium">
                Farm Parcel Selected
              </span>
            </div>
            <div className="space-y-0.5 text-[10px] text-white/40 font-mono">
              {parcelProps?.COUNTY && <p>County: {parcelProps.COUNTY}</p>}
              {parcelProps?.MAIN_CROP && (
                <p>Crop: {decodeCropCode(parcelProps.MAIN_CROP)}</p>
              )}
              {parcelProps?.ACRES && (
                <p>Acreage: {Math.round(parcelProps.ACRES * 10) / 10} ac</p>
              )}
              {parcelProps?.UniqueID && <p>ID: {parcelProps.UniqueID}</p>}
            </div>
          </div>
        ) : drawnAoi ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[12px] text-emerald-400 font-medium">
                Area Drawn
              </span>
            </div>
            {drawnCenter && (
              <p className="text-[10px] text-white/25 font-mono">
                Center: {drawnCenter[1].toFixed(4)}N, {Math.abs(drawnCenter[0]).toFixed(4)}W
              </p>
            )}
          </div>
        ) : zoomSufficient ? (
          /* State 2: Zoomed in, no selection */
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
            <p className="text-[12px] text-cyan-300/80">
              {parcelLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading farm parcels...
                </span>
              ) : (
                "Click a highlighted farm parcel on the map"
              )}
            </p>
          </div>
        ) : (
          /* State 3: Not zoomed in */
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
            <p className="text-[12px] text-white/40">
              Zoom into a farm area to see field boundaries
            </p>
            <p className="text-[10px] text-white/20 mt-1">
              Parcels appear at zoom 12+
            </p>
          </div>
        )}

        {/* Draw fallback */}
        <button
          onClick={onActivateDraw}
          className="mt-2 w-full py-2 rounded-lg text-[11px] text-white/30 hover:text-white/50 border border-white/[0.06] hover:border-white/[0.12] transition-all"
        >
          Or draw a custom area
        </button>
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
