import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import maplibregl from "maplibre-gl";

const MAP_CENTER: [number, number] = [-121.872, 38.718];
const MAP_ZOOM = 14;
const EOX_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";

export interface MapHandle {
  getMap: () => maplibregl.Map | null;
}

export const MapView = forwardRef<MapHandle>(function MapView(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [EOX_TILES],
            tileSize: 256,
            attribution:
              "&copy; EOX IT Services GmbH - Sentinel-2 cloudless",
          },
        },
        layers: [
          {
            id: "satellite",
            type: "raster",
            source: "satellite",
            paint: {
              "raster-brightness-max": 0.5,
              "raster-saturation": -0.3,
              "raster-contrast": 0.2,
            },
          },
        ],
      },
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
});
