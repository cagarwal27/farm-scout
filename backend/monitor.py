"""
Field Monitor — monitor.py
Background thread that periodically checks for new Sentinel-2 scenes
and re-runs analysis for saved/monitored fields.
"""

import json
import logging
import threading
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from pipeline import run_satellite_pipeline

log = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / "cache"
FIELDS_FILE = CACHE_DIR / "monitored_fields.json"


@dataclass
class SavedField:
    field_id: str
    aoi_polygon: dict
    location_name: str
    crop_type: str
    created_at: str
    last_checked: Optional[str] = None
    last_scene_date: Optional[str] = None
    status: str = "active"  # active | error


class FieldMonitor:
    """Monitors saved fields for new satellite imagery."""

    def __init__(self, check_interval_hours: int = 6):
        self.check_interval = check_interval_hours * 3600
        self.saved_fields: dict[str, SavedField] = {}
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._load_fields()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def add_field(
        self, aoi_polygon: dict, location_name: str, crop_type: str
    ) -> str:
        """Save a field for monitoring. Returns field_id."""
        field_id = uuid.uuid4().hex[:8]
        sf = SavedField(
            field_id=field_id,
            aoi_polygon=aoi_polygon,
            location_name=location_name,
            crop_type=crop_type,
            created_at=datetime.utcnow().isoformat(),
        )
        with self._lock:
            self.saved_fields[field_id] = sf
            self._persist()
        log.info("Added monitored field %s (%s)", field_id, location_name)
        return field_id

    def remove_field(self, field_id: str) -> bool:
        """Stop monitoring a field. Returns True if found."""
        with self._lock:
            if field_id not in self.saved_fields:
                return False
            del self.saved_fields[field_id]
            self._persist()
            # Remove cached result
            result_file = CACHE_DIR / f"field_{field_id}_latest.json"
            if result_file.exists():
                result_file.unlink()
        log.info("Removed monitored field %s", field_id)
        return True

    def get_latest(self, field_id: str) -> Optional[dict]:
        """Get the most recent analysis result for a field."""
        result_file = CACHE_DIR / f"field_{field_id}_latest.json"
        if result_file.exists():
            return json.loads(result_file.read_text())
        return None

    def list_fields(self) -> list[dict]:
        """List all monitored fields with status info."""
        with self._lock:
            result = []
            for sf in self.saved_fields.values():
                info = asdict(sf)
                # Check if we have a cached result
                result_file = CACHE_DIR / f"field_{sf.field_id}_latest.json"
                info["has_result"] = result_file.exists()
                result.append(info)
            return result

    def start(self):
        """Start the background monitoring thread."""
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        log.info("Field monitor started (interval: %ds)", self.check_interval)

    def stop(self):
        """Stop the background monitoring thread."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        log.info("Field monitor stopped")

    # ------------------------------------------------------------------
    # Background loop
    # ------------------------------------------------------------------
    def _run_loop(self):
        """Main monitoring loop — runs in a daemon thread."""
        while not self._stop_event.is_set():
            # Wait for the check interval (but wake up early if stopped)
            self._stop_event.wait(timeout=self.check_interval)
            if self._stop_event.is_set():
                break

            with self._lock:
                fields_to_check = list(self.saved_fields.values())

            for sf in fields_to_check:
                if self._stop_event.is_set():
                    break
                try:
                    self._check_field(sf)
                except Exception as e:
                    log.error("Monitor error for field %s: %s", sf.field_id, e)
                    with self._lock:
                        sf.status = "error"
                        self._persist()

    def _check_field(self, sf: SavedField):
        """Check a single field for new data and re-analyze if available."""
        now = datetime.utcnow()

        # Use a rolling 14-day window ending today
        date_end = now.strftime("%Y-%m-%d")
        date_start = (now - timedelta(days=14)).strftime("%Y-%m-%d")

        log.info("Checking field %s (%s) for %s to %s",
                 sf.field_id, sf.location_name, date_start, date_end)

        try:
            result = run_satellite_pipeline(
                aoi_polygon=sf.aoi_polygon,
                date_start=date_start,
                date_end=date_end,
                location_name=sf.location_name,
                crop_type=sf.crop_type,
            )

            # Save result
            CACHE_DIR.mkdir(exist_ok=True)
            result_file = CACHE_DIR / f"field_{sf.field_id}_latest.json"
            result_file.write_text(json.dumps(result, indent=2))

            with self._lock:
                sf.last_checked = now.isoformat()
                sf.last_scene_date = result["field"]["date_end"]
                sf.status = "active"
                self._persist()

            log.info("Updated field %s — %d clusters found",
                     sf.field_id, result["summary"]["clusters_found"])

        except ValueError as e:
            log.warning("No usable data for field %s: %s", sf.field_id, e)
            with self._lock:
                sf.last_checked = now.isoformat()
                self._persist()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def _load_fields(self):
        """Load saved fields from disk."""
        if not FIELDS_FILE.exists():
            return
        try:
            data = json.loads(FIELDS_FILE.read_text())
            for item in data:
                sf = SavedField(**item)
                self.saved_fields[sf.field_id] = sf
            log.info("Loaded %d monitored fields", len(self.saved_fields))
        except Exception as e:
            log.error("Failed to load monitored fields: %s", e)

    def _persist(self):
        """Save fields to disk. Must be called with self._lock held."""
        CACHE_DIR.mkdir(exist_ok=True)
        data = [asdict(sf) for sf in self.saved_fields.values()]
        FIELDS_FILE.write_text(json.dumps(data, indent=2))
