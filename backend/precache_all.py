"""
Run the satellite pipeline for multiple AOIs and save each to cache.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from pyproj import Transformer
from pystac_client import Client
from rasterio.features import shapes, sieve
from rasterio.warp import Resampling
from shapely.geometry import shape, mapping
from shapely.ops import transform as shapely_transform
from skimage.measure import label

CACHE_DIR = Path(__file__).parent / "cache"
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
DATE_1 = "2024-07-02"
DATE_2 = "2024-07-12"

AOIS = [
    {
        "name": "woodland_south_walnuts",
        "location": "Woodland South, Yolo County, CA",
        "crop": "Walnut",
        "bbox": [-121.78, 38.64, -121.76, 38.66],
        "threshold": -0.08,
        "sieve_size": 50,
        "max_clusters": 8,
        "sev_high": -0.10,
        "sev_med": -0.08,
    },
    {
        "name": "dunnigan_orchards",
        "location": "Dunnigan, Yolo County, CA",
        "crop": "Mixed Orchard",
        "bbox": [-121.98, 38.88, -121.96, 38.90],
        "threshold": -0.05,
        "sieve_size": 50,
        "max_clusters": 8,
        "sev_high": -0.08,
        "sev_med": -0.05,
    },
]


def run_pipeline(aoi_config):
    name = aoi_config["name"]
    bbox = aoi_config["bbox"]
    threshold = aoi_config["threshold"]
    sieve_size = aoi_config["sieve_size"]
    max_clusters = aoi_config["max_clusters"]

    print(f"\n{'='*60}")
    print(f"Processing: {name}")
    print(f"{'='*60}")

    catalog = Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32610", always_xy=True)
    min_x, min_y = transformer.transform(bbox[0], bbox[1])
    max_x, max_y = transformer.transform(bbox[2], bbox[3])
    utm_bbox = [min_x, min_y, max_x, max_y]

    ndvis = []
    for date_str in [DATE_1, DATE_2]:
        print(f"  Fetching {date_str}...")
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            bbox=bbox,
            datetime=f"{date_str}/{date_str}",
            query={"eo:cloud_cover": {"lt": 15}},
        )
        item = list(search.items())[0]
        print(f"    Scene: {item.id}, cloud: {item.properties.get('eo:cloud_cover', 0):.1f}%")

        with rasterio.open(item.assets["B04"].href) as src:
            window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
            red = src.read(1, window=window).astype(np.float32)
            out_shape = red.shape
            utm_transform = rasterio.windows.transform(window, src.transform)

        with rasterio.open(item.assets["B08"].href) as src:
            window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
            nir = src.read(1, window=window).astype(np.float32)

        with rasterio.open(item.assets["SCL"].href) as src:
            window = rasterio.windows.from_bounds(*utm_bbox, transform=src.transform)
            scl = src.read(1, window=window, out_shape=out_shape, resampling=Resampling.nearest)

        valid = np.isin(scl, [4, 5])
        ndvi = np.where((nir + red) > 0, (nir - red) / (nir + red), np.nan)
        ndvi = np.where(valid, ndvi, np.nan)
        ndvis.append(ndvi)
        print(f"    Shape: {red.shape}, mean NDVI: {np.nanmean(ndvi):.3f}")

    # Change detection
    delta = ndvis[1] - ndvis[0]
    valid_mask = ~np.isnan(delta)
    stress_mask = (delta < threshold) & valid_mask
    print(f"  Stress pixels: {np.sum(stress_mask)}")

    # Cluster and polygonize
    binary = stress_mask.astype(np.uint8)
    sieved = sieve(binary, size=sieve_size, connectivity=8)
    labeled = label(sieved, connectivity=2)
    n_clusters = labeled.max()
    print(f"  Raw clusters: {n_clusters}")

    utm_to_wgs84 = Transformer.from_crs("EPSG:32610", "EPSG:4326", always_xy=True)
    features = []

    for cid in range(1, n_clusters + 1):
        cluster_mask = (labeled == cid).astype(np.uint8)
        cluster_delta = delta[labeled == cid]
        mean_drop = float(np.nanmean(cluster_delta))
        pixel_count = int(np.sum(cluster_mask))
        area_acres = round(pixel_count * 100 / 4046.86, 1)

        if mean_drop <= aoi_config["sev_high"]:
            severity = "high"
        elif mean_drop <= aoi_config["sev_med"]:
            severity = "medium"
        else:
            severity = "low"

        for geom, val in shapes(cluster_mask, transform=utm_transform):
            if val == 1:
                poly_utm = shape(geom)
                simplified_utm = poly_utm.simplify(20, preserve_topology=True)
                poly_wgs84 = shapely_transform(utm_to_wgs84.transform, simplified_utm)
                centroid = poly_wgs84.centroid

                features.append({
                    "type": "Feature",
                    "geometry": mapping(poly_wgs84),
                    "properties": {
                        "cluster_id": "",
                        "area_acres": area_acres,
                        "ndvi_drop": round(mean_drop, 3),
                        "severity": severity,
                        "centroid": [round(centroid.x, 4), round(centroid.y, 4)],
                    },
                })

    # Sort by severity, keep top N
    features.sort(key=lambda f: f["properties"]["ndvi_drop"])
    features = features[:max_clusters]
    for i, f in enumerate(features):
        f["properties"]["cluster_id"] = chr(65 + i)

    # Compute field area
    lon_span = bbox[2] - bbox[0]
    lat_span = bbox[3] - bbox[1]
    area_acres = round((lon_span * 85) * (lat_span * 111) * 247.105, 1)

    total_affected = sum(f["properties"]["area_acres"] for f in features)
    drops = [f["properties"]["ndvi_drop"] for f in features]

    result = {
        "field": {
            "location": aoi_config["location"],
            "crop": aoi_config["crop"],
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

    # Save
    out_path = CACHE_DIR / f"analyze_{name}.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"  Saved: {out_path}")
    print(f"  Clusters: {len(features)}, Affected: {round(total_affected, 1)} acres")

    return result


if __name__ == "__main__":
    CACHE_DIR.mkdir(exist_ok=True)
    for aoi in AOIS:
        try:
            run_pipeline(aoi)
        except Exception as e:
            print(f"  FAILED: {e}")
    print("\nDone!")
