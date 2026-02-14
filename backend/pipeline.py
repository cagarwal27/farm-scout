"""
Satellite Data Pipeline — pipeline.py
Reusable module that accepts arbitrary AOI/dates and returns NDVI
change-detection results matching the /api/analyze contract.

Extracted from precache.py with all hardcoded values parameterized.
"""

import json
import math
import logging
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from pyproj import Transformer
from pystac_client import Client
from rasterio.features import shapes, sieve
from rasterio.warp import Resampling
from shapely.geometry import shape as shapely_shape, mapping
from shapely.ops import transform as shapely_transform
from skimage.measure import label

warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-2-l2a"

NDVI_DROP_THRESHOLD = -0.08
SIEVE_SIZE = 50
MAX_CLUSTERS = 8

SEVERITY_THRESHOLDS = {"high": -0.10, "medium": -0.08}

# California bounds (lat 32.5–42, lon -124.5 to -114)
CA_BOUNDS = {"lat_min": 32.5, "lat_max": 42.0, "lon_min": -124.5, "lon_max": -114.0}
MAX_AOI_AREA_DEG2 = 0.04  # ~25 km2 at CA latitudes


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def run_satellite_pipeline(
    aoi_polygon: dict,
    date_start: str,
    date_end: str,
    location_name: str = "",
    crop_type: str = "",
) -> dict:
    """
    Run the full satellite NDVI change-detection pipeline.

    Args:
        aoi_polygon: GeoJSON Polygon geometry dict
        date_start: "YYYY-MM-DD" baseline date
        date_end: "YYYY-MM-DD" comparison date
        location_name: optional human label for the field
        crop_type: optional crop label

    Returns:
        dict matching the /api/analyze response contract

    Raises:
        ValueError: invalid AOI or dates
        RuntimeError: satellite data unavailable
    """
    # Validate inputs
    poly = shapely_shape(aoi_polygon)
    bbox = list(poly.bounds)  # [minlon, minlat, maxlon, maxlat]
    _validate_aoi(bbox, poly)
    _validate_dates(date_start, date_end)

    center_lon = (bbox[0] + bbox[2]) / 2
    center_lat = (bbox[1] + bbox[3]) / 2
    utm_epsg = _get_utm_epsg(center_lon, center_lat)
    utm_crs = f"EPSG:{utm_epsg}"

    log.info("Pipeline: AOI center (%.4f, %.4f), UTM %s", center_lon, center_lat, utm_crs)

    # Step 1: Find scenes
    item_t1, item_t2 = _find_scenes(bbox, date_start, date_end)
    log.info("T1: %s (%s)", item_t1.id, item_t1.datetime.strftime("%Y-%m-%d"))
    log.info("T2: %s (%s)", item_t2.id, item_t2.datetime.strftime("%Y-%m-%d"))

    # Step 2: Read bands
    red_t1, nir_t1, scl_t1, transform = _read_bands(item_t1, bbox, utm_crs)
    red_t2, nir_t2, scl_t2, _ = _read_bands(item_t2, bbox, utm_crs)

    # Step 3: Compute NDVI
    ndvi_t1 = _compute_ndvi(red_t1, nir_t1, scl_t1)
    ndvi_t2 = _compute_ndvi(red_t2, nir_t2, scl_t2)

    # Step 4: Change detection
    delta = ndvi_t2 - ndvi_t1
    valid_mask = ~np.isnan(delta)
    stress_mask = (delta < NDVI_DROP_THRESHOLD) & valid_mask

    if np.sum(stress_mask) == 0:
        # Try looser threshold
        stress_mask = (delta < -0.06) & valid_mask

    # Step 5: Cluster and polygonize
    features = _polygonize_hotspots(stress_mask, delta, transform, utm_crs)

    if len(features) == 0:
        features = _polygonize_hotspots(stress_mask, delta, transform, utm_crs, min_sieve=10)

    # Step 6: Build output
    actual_start = item_t1.datetime.strftime("%Y-%m-%d")
    actual_end = item_t2.datetime.strftime("%Y-%m-%d")

    result = _build_output(
        features, bbox, actual_start, actual_end,
        location_name or f"{center_lat:.2f}N, {abs(center_lon):.2f}W",
        crop_type or "Unknown",
    )
    return result


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def _validate_aoi(bbox, poly):
    """Check AOI is within California and not too large."""
    center_lon = (bbox[0] + bbox[2]) / 2
    center_lat = (bbox[1] + bbox[3]) / 2

    if not (CA_BOUNDS["lat_min"] <= center_lat <= CA_BOUNDS["lat_max"]):
        raise ValueError(
            f"AOI center latitude {center_lat:.2f} is outside California bounds "
            f"({CA_BOUNDS['lat_min']}–{CA_BOUNDS['lat_max']})"
        )
    if not (CA_BOUNDS["lon_min"] <= center_lon <= CA_BOUNDS["lon_max"]):
        raise ValueError(
            f"AOI center longitude {center_lon:.2f} is outside California bounds "
            f"({CA_BOUNDS['lon_min']}–{CA_BOUNDS['lon_max']})"
        )

    # Rough area check in degrees
    lon_span = bbox[2] - bbox[0]
    lat_span = bbox[3] - bbox[1]
    area_deg2 = lon_span * lat_span
    if area_deg2 > MAX_AOI_AREA_DEG2:
        km2 = (lon_span * 85) * (lat_span * 111)
        raise ValueError(
            f"AOI too large (~{km2:.1f} km2). Draw a smaller area (max ~25 km2)."
        )


def _validate_dates(date_start, date_end):
    """Check date format and minimum gap."""
    try:
        dt_start = datetime.strptime(date_start, "%Y-%m-%d")
        dt_end = datetime.strptime(date_end, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Dates must be in YYYY-MM-DD format.")

    if dt_end <= dt_start:
        raise ValueError("End date must be after start date.")

    gap = (dt_end - dt_start).days
    if gap < 5:
        raise ValueError(
            f"Date range is only {gap} days. Need at least 5 days for "
            "Sentinel-2 change detection (revisit every ~5 days)."
        )


# ---------------------------------------------------------------------------
# UTM helpers
# ---------------------------------------------------------------------------
def _get_utm_epsg(lon: float, lat: float) -> int:
    """Determine EPSG code for the UTM zone containing this lon/lat."""
    zone_number = int((lon + 180) / 6) + 1
    return 32600 + zone_number if lat >= 0 else 32700 + zone_number


def _bbox_to_utm(bbox, utm_crs):
    """Convert WGS84 bbox to UTM coordinates."""
    transformer = Transformer.from_crs("EPSG:4326", utm_crs, always_xy=True)
    min_x, min_y = transformer.transform(bbox[0], bbox[1])
    max_x, max_y = transformer.transform(bbox[2], bbox[3])
    return [min_x, min_y, max_x, max_y]


# ---------------------------------------------------------------------------
# Satellite data
# ---------------------------------------------------------------------------
def _find_scenes(bbox, date_start, date_end):
    """Find two Sentinel-2 scenes for change detection."""
    catalog = Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)

    search = catalog.search(
        collections=[COLLECTION],
        bbox=bbox,
        datetime=f"{date_start}/{date_end}",
        query={"eo:cloud_cover": {"lt": 20}},
    )
    items = sorted(list(search.items()), key=lambda i: i.datetime)

    if len(items) < 2:
        raise ValueError(
            f"Need at least 2 cloud-free Sentinel-2 scenes between "
            f"{date_start} and {date_end}. Found {len(items)}. "
            f"Try widening the date range (Sentinel-2 revisits every ~5 days)."
        )

    # Pick scenes closest to requested start and end
    dt_start = datetime.strptime(date_start, "%Y-%m-%d")
    dt_end = datetime.strptime(date_end, "%Y-%m-%d")

    item_t1 = min(items, key=lambda i: abs((i.datetime.replace(tzinfo=None) - dt_start).total_seconds()))
    item_t2 = min(items, key=lambda i: abs((i.datetime.replace(tzinfo=None) - dt_end).total_seconds()))

    # Ensure we have two different scenes
    if item_t1.id == item_t2.id:
        item_t1 = items[0]
        item_t2 = items[-1]

    return item_t1, item_t2


def _read_bands(item, bbox, utm_crs):
    """Read B04, B08, SCL bands for the AOI."""
    b04_href = item.assets["B04"].href
    b08_href = item.assets["B08"].href
    scl_href = item.assets["SCL"].href

    utm_bbox = _bbox_to_utm(bbox, utm_crs)

    # Red band (B04) — 10m
    with rasterio.open(b04_href) as src:
        window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
        red = src.read(1, window=window).astype(np.float32)
        utm_transform = rasterio.windows.transform(window, src.transform)
        out_shape = red.shape

    # NIR band (B08) — 10m
    with rasterio.open(b08_href) as src:
        window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
        nir = src.read(1, window=window).astype(np.float32)

    # SCL band — 20m, resample to 10m
    with rasterio.open(scl_href) as src:
        window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
        scl = src.read(1, window=window, out_shape=out_shape, resampling=Resampling.nearest)

    log.info("Bands loaded: %s pixels", red.shape)
    return red, nir, scl, utm_transform


def _compute_ndvi(red, nir, scl):
    """Compute NDVI with cloud masking via SCL band."""
    valid = np.isin(scl, [4, 5])
    denominator = nir + red
    ndvi = np.where(
        (denominator > 0) & valid,
        (nir - red) / denominator,
        np.nan,
    )
    return ndvi


def _polygonize_hotspots(stress_mask, delta, transform, utm_crs, min_sieve=None):
    """Cluster stressed pixels, sieve, and polygonize to GeoJSON features."""
    sieve_size = min_sieve if min_sieve is not None else SIEVE_SIZE
    binary = stress_mask.astype(np.uint8)
    sieved = sieve(binary, size=sieve_size, connectivity=8)
    labeled = label(sieved, connectivity=2)
    n_clusters = labeled.max()

    if n_clusters == 0:
        return []

    utm_to_wgs84 = Transformer.from_crs(utm_crs, "EPSG:4326", always_xy=True)
    features = []

    for cluster_id in range(1, n_clusters + 1):
        cluster_mask = (labeled == cluster_id).astype(np.uint8)
        cluster_delta = delta[labeled == cluster_id]
        mean_drop = float(np.nanmean(cluster_delta))
        pixel_count = int(np.sum(cluster_mask))

        area_m2 = pixel_count * 100
        area_acres = round(area_m2 / 4046.86, 1)

        if mean_drop <= SEVERITY_THRESHOLDS["high"]:
            severity = "high"
        elif mean_drop <= SEVERITY_THRESHOLDS["medium"]:
            severity = "medium"
        else:
            severity = "low"

        for geom, val in shapes(cluster_mask, transform=transform):
            if val == 1:
                poly_utm = shapely_shape(geom)
                simplified_utm = poly_utm.simplify(20, preserve_topology=True)
                poly_wgs84 = shapely_transform(utm_to_wgs84.transform, simplified_utm)
                centroid = poly_wgs84.centroid

                features.append({
                    "type": "Feature",
                    "geometry": mapping(poly_wgs84),
                    "properties": {
                        "cluster_id": chr(64 + cluster_id),
                        "area_acres": area_acres,
                        "ndvi_drop": round(mean_drop, 3),
                        "severity": severity,
                        "centroid": [round(centroid.x, 4), round(centroid.y, 4)],
                    },
                })

    # Sort by severity (most severe first)
    features.sort(key=lambda f: f["properties"]["ndvi_drop"])
    features = features[:MAX_CLUSTERS]

    # Re-assign cluster IDs
    for i, f in enumerate(features):
        f["properties"]["cluster_id"] = chr(65 + i)

    return features


def _build_output(features, bbox, date_start, date_end, location_name, crop_type):
    """Build the final output matching the API contract."""
    total_affected = sum(f["properties"]["area_acres"] for f in features)
    drops = [f["properties"]["ndvi_drop"] for f in features]

    lon_span = bbox[2] - bbox[0]
    lat_span = bbox[3] - bbox[1]
    center_lat = (bbox[1] + bbox[3]) / 2
    km_per_lon = 111.32 * math.cos(math.radians(center_lat))
    area_km2 = (lon_span * km_per_lon) * (lat_span * 111)
    area_acres = round(area_km2 * 247.105, 1)

    return {
        "field": {
            "location": location_name,
            "crop": crop_type,
            "area_acres": area_acres,
            "date_start": date_start,
            "date_end": date_end,
        },
        "summary": {
            "clusters_found": len(features),
            "total_affected_acres": round(total_affected, 1),
            "avg_ndvi_drop": round(float(np.mean(drops)), 3) if drops else 0.0,
            "max_ndvi_drop": round(float(min(drops)), 3) if drops else 0.0,
        },
        "hotspots": {
            "type": "FeatureCollection",
            "features": features,
        },
    }
