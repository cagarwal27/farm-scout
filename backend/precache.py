"""
Satellite Data Pipeline — precache.py
Pulls real Sentinel-2 L2A data from Planetary Computer, computes NDVI
change detection, polygonizes stress hotspots, and saves results to cache.

Usage:
    cd backend
    source venv/Scripts/activate   (or venv\\Scripts\\activate on Windows)
    python precache.py

Output:
    cache/analyze_demo.json  — hotspot FeatureCollection matching API contract
"""

import json
import warnings
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from pyproj import Transformer
from pystac_client import Client
from rasterio.features import shapes, sieve
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling
from shapely.geometry import shape, mapping
from shapely.ops import transform as shapely_transform
from skimage.measure import label

warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CACHE_DIR = Path(__file__).parent / "cache"
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-2-l2a"

# Demo AOI — Yolo County, Knights Landing area (real orchard land)
AOI_BBOX = [-121.72, 38.80, -121.70, 38.82]
AOI_POLYGON = {
    "type": "Polygon",
    "coordinates": [[
        [-121.72, 38.82],
        [-121.70, 38.82],
        [-121.70, 38.80],
        [-121.72, 38.80],
        [-121.72, 38.82],
    ]],
}

# Two dates for change detection (during July 2024 heat wave)
DATE_1 = "2024-07-02"  # baseline — 0.04% cloud
DATE_2 = "2024-07-12"  # comparison — 2.76% cloud, after heat spike

# NDVI change detection thresholds (tuned for this AOI)
NDVI_DROP_THRESHOLD = -0.08  # flag pixels with NDVI drop below this
SIEVE_SIZE = 50              # minimum cluster size in pixels (~1.2 acres at 10m)
SIMPLIFY_TOLERANCE = 0.0001  # degrees (~11m) for polygon simplification

# Severity classification
SEVERITY_THRESHOLDS = {
    "high": -0.10,
    "medium": -0.08,
}
MAX_CLUSTERS = 8  # Keep only top clusters for clean demo

# Field metadata
FIELD_LOCATION = "Yolo County, CA"
FIELD_CROP = "Almond"


def main():
    print("=" * 60)
    print("FarmSense Satellite Data Pipeline")
    print("=" * 60)

    # Step 1: Find Sentinel-2 scenes
    print(f"\n[1/6] Searching for Sentinel-2 scenes...")
    item_t1, item_t2 = find_scenes()

    # Step 2: Download and read bands
    print(f"\n[2/6] Downloading bands for {DATE_1}...")
    red_t1, nir_t1, scl_t1, transform = read_bands(item_t1)
    print(f"[2/6] Downloading bands for {DATE_2}...")
    red_t2, nir_t2, scl_t2, _ = read_bands(item_t2)

    # Step 3: Compute NDVI
    print(f"\n[3/6] Computing NDVI...")
    ndvi_t1 = compute_ndvi(red_t1, nir_t1, scl_t1)
    ndvi_t2 = compute_ndvi(red_t2, nir_t2, scl_t2)
    print(f"  T1 mean NDVI: {np.nanmean(ndvi_t1):.3f}")
    print(f"  T2 mean NDVI: {np.nanmean(ndvi_t2):.3f}")

    # Step 4: Change detection
    print(f"\n[4/6] Detecting NDVI change...")
    delta = ndvi_t2 - ndvi_t1
    valid_mask = ~np.isnan(delta)
    stress_mask = (delta < NDVI_DROP_THRESHOLD) & valid_mask
    stress_pixels = np.sum(stress_mask)
    print(f"  Pixels with NDVI drop < {NDVI_DROP_THRESHOLD}: {stress_pixels}")

    if stress_pixels == 0:
        print("  WARNING: No stress detected. Trying looser threshold (-0.08)...")
        stress_mask = (delta < -0.08) & valid_mask
        stress_pixels = np.sum(stress_mask)
        print(f"  Pixels with NDVI drop < -0.08: {stress_pixels}")

    # Step 5: Cluster and polygonize
    print(f"\n[5/6] Clustering and polygonizing hotspots...")
    features = polygonize_hotspots(stress_mask, delta, transform)
    print(f"  Hotspot clusters found: {len(features)}")

    if len(features) == 0:
        print("  WARNING: No clusters survived sieving. Reducing minimum size...")
        features = polygonize_hotspots(stress_mask, delta, transform, min_sieve=10)
        print(f"  Hotspot clusters found (relaxed): {len(features)}")

    # Step 6: Build output and save
    print(f"\n[6/6] Saving to cache...")
    result = build_output(features, ndvi_t1, ndvi_t2, delta, valid_mask)
    save_result(result)

    print(f"\n{'=' * 60}")
    print(f"Pipeline complete!")
    print(f"  Clusters: {result['summary']['clusters_found']}")
    print(f"  Total affected acres: {result['summary']['total_affected_acres']}")
    print(f"  Avg NDVI drop: {result['summary']['avg_ndvi_drop']}")
    print(f"  Max NDVI drop: {result['summary']['max_ndvi_drop']}")
    print(f"  Saved to: {CACHE_DIR / 'analyze_demo.json'}")
    print(f"{'=' * 60}")


def find_scenes():
    """Query Planetary Computer for the two target Sentinel-2 scenes."""
    catalog = Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)

    # Find scene closest to DATE_1
    search_t1 = catalog.search(
        collections=[COLLECTION],
        bbox=AOI_BBOX,
        datetime=f"{DATE_1}/{DATE_1}",
        query={"eo:cloud_cover": {"lt": 15}},
    )
    items_t1 = list(search_t1.items())
    if not items_t1:
        raise RuntimeError(f"No Sentinel-2 scene found for {DATE_1}")
    item_t1 = items_t1[0]
    print(f"  T1: {item_t1.id} ({item_t1.datetime.strftime('%Y-%m-%d')}, cloud: {item_t1.properties.get('eo:cloud_cover', '?'):.1f}%)")

    # Find scene closest to DATE_2
    search_t2 = catalog.search(
        collections=[COLLECTION],
        bbox=AOI_BBOX,
        datetime=f"{DATE_2}/{DATE_2}",
        query={"eo:cloud_cover": {"lt": 15}},
    )
    items_t2 = list(search_t2.items())
    if not items_t2:
        raise RuntimeError(f"No Sentinel-2 scene found for {DATE_2}")
    item_t2 = items_t2[0]
    print(f"  T2: {item_t2.id} ({item_t2.datetime.strftime('%Y-%m-%d')}, cloud: {item_t2.properties.get('eo:cloud_cover', '?'):.1f}%)")

    return item_t1, item_t2


def _bbox_to_utm(bbox):
    """Convert WGS84 bbox [minlon, minlat, maxlon, maxlat] to UTM (EPSG:32610)."""
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32610", always_xy=True)
    min_x, min_y = transformer.transform(bbox[0], bbox[1])
    max_x, max_y = transformer.transform(bbox[2], bbox[3])
    return [min_x, min_y, max_x, max_y]


def read_bands(item):
    """
    Read B04 (Red), B08 (NIR), SCL (Scene Classification) for the AOI.
    Converts WGS84 bbox to UTM for windowed reading, returns WGS84 transform.
    """
    b04_href = item.assets["B04"].href
    b08_href = item.assets["B08"].href
    scl_href = item.assets["SCL"].href

    # Convert AOI bbox from WGS84 to UTM
    utm_bbox = _bbox_to_utm(AOI_BBOX)

    # Read Red band (B04) — 10m resolution
    with rasterio.open(b04_href) as src:
        window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
        red = src.read(1, window=window).astype(np.float32)
        utm_transform = rasterio.windows.transform(window, src.transform)
        out_shape = red.shape

    # Read NIR band (B08) — 10m resolution
    with rasterio.open(b08_href) as src:
        window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
        nir = src.read(1, window=window).astype(np.float32)

    # Read SCL band — 20m resolution, resample to match 10m bands via out_shape
    with rasterio.open(scl_href) as src:
        window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
        scl = src.read(1, window=window, out_shape=out_shape, resampling=Resampling.nearest)

    print(f"  Bands loaded: {red.shape} pixels ({red.shape[1] * 10}m x {red.shape[0] * 10}m)")
    return red, nir, scl, utm_transform


def compute_ndvi(red, nir, scl):
    """
    Compute NDVI with cloud masking via SCL band.
    SCL values 4 (vegetation) and 5 (bare soil) are kept.
    """
    # Cloud mask: keep only vegetation (4) and bare soil (5)
    valid = np.isin(scl, [4, 5])

    # Avoid division by zero
    denominator = nir + red
    ndvi = np.where(
        (denominator > 0) & valid,
        (nir - red) / denominator,
        np.nan,
    )
    valid_pct = np.sum(~np.isnan(ndvi)) / ndvi.size * 100
    print(f"  Valid pixels after cloud mask: {valid_pct:.1f}%")
    return ndvi


def polygonize_hotspots(stress_mask, delta, transform, min_sieve=None):
    """
    Cluster stressed pixels, sieve small clusters, and polygonize.
    Returns list of GeoJSON Feature dicts.
    """
    sieve_size = min_sieve if min_sieve is not None else SIEVE_SIZE

    # Convert boolean mask to uint8
    binary = stress_mask.astype(np.uint8)

    # Sieve: remove small clusters
    sieved = sieve(binary, size=sieve_size, connectivity=8)

    # Label connected components
    labeled = label(sieved, connectivity=2)
    n_clusters = labeled.max()

    if n_clusters == 0:
        return []

    features = []
    for cluster_id in range(1, n_clusters + 1):
        cluster_mask = (labeled == cluster_id).astype(np.uint8)

        # Get mean NDVI drop for this cluster
        cluster_delta = delta[labeled == cluster_id]
        mean_drop = float(np.nanmean(cluster_delta))
        pixel_count = int(np.sum(cluster_mask))

        # Convert pixel count to acres (10m pixel = 100 sq meters)
        area_m2 = pixel_count * 100  # 10m x 10m = 100 sq m per pixel
        area_acres = round(area_m2 / 4046.86, 1)  # sq meters to acres

        # Determine severity
        if mean_drop <= SEVERITY_THRESHOLDS["high"]:
            severity = "high"
        elif mean_drop <= SEVERITY_THRESHOLDS["medium"]:
            severity = "medium"
        else:
            severity = "low"

        # Polygonize (output is in UTM coords)
        utm_to_wgs84 = Transformer.from_crs("EPSG:32610", "EPSG:4326", always_xy=True)
        for geom, val in shapes(cluster_mask, transform=transform):
            if val == 1:
                poly_utm = shape(geom)
                # Simplify in UTM (meters) before reprojecting
                simplified_utm = poly_utm.simplify(20, preserve_topology=True)
                # Reproject to WGS84
                poly_wgs84 = shapely_transform(utm_to_wgs84.transform, simplified_utm)
                centroid = poly_wgs84.centroid

                features.append({
                    "type": "Feature",
                    "geometry": mapping(poly_wgs84),
                    "properties": {
                        "cluster_id": chr(64 + cluster_id),  # A, B, C...
                        "area_acres": area_acres,
                        "ndvi_drop": round(mean_drop, 3),
                        "severity": severity,
                        "centroid": [round(centroid.x, 4), round(centroid.y, 4)],
                    },
                })

    # Sort by NDVI drop (most severe first)
    features.sort(key=lambda f: f["properties"]["ndvi_drop"])

    # Keep only top clusters
    features = features[:MAX_CLUSTERS]

    # Re-assign cluster IDs after sorting
    for i, f in enumerate(features):
        f["properties"]["cluster_id"] = chr(65 + i)  # A, B, C...

    return features


def build_output(features, ndvi_t1, ndvi_t2, delta, valid_mask):
    """Build the final output matching the API contract."""
    total_affected = sum(f["properties"]["area_acres"] for f in features)
    drops = [f["properties"]["ndvi_drop"] for f in features]

    # Compute field area from AOI bbox
    lon_span = AOI_BBOX[2] - AOI_BBOX[0]
    lat_span = AOI_BBOX[3] - AOI_BBOX[1]
    # Rough conversion: 1 degree lat ~ 111km, 1 degree lon ~ 85km at 38.7N
    area_km2 = (lon_span * 85) * (lat_span * 111)
    area_acres = round(area_km2 * 247.105, 1)

    return {
        "field": {
            "location": FIELD_LOCATION,
            "crop": FIELD_CROP,
            "area_acres": area_acres,
            "date_start": DATE_1,
            "date_end": DATE_2,
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


def save_result(result):
    """Save result to cache directory."""
    CACHE_DIR.mkdir(exist_ok=True)
    out_path = CACHE_DIR / "analyze_demo.json"

    # Backup existing cache
    if out_path.exists():
        backup = CACHE_DIR / "analyze_demo_backup.json"
        backup.write_text(out_path.read_text())
        print(f"  Backed up existing cache to {backup}")

    out_path.write_text(json.dumps(result, indent=2))
    print(f"  Saved {out_path}")


if __name__ == "__main__":
    main()
