"""
CSVStore — thread-safe CSV read/write engine.

Strategy:
  • One lock per CSV file (keyed by filename) avoids cross-table contention.
  • All mutations do: read → modify in-memory → write atomically via a tmp file.
  • pandas is used only for reads; writes use stdlib csv for speed & safety.
"""

import csv
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

import pandas as pd

_locks: dict[str, threading.Lock] = {}
_locks_meta = threading.Lock()


def _get_lock(path: str) -> threading.Lock:
    with _locks_meta:
        if path not in _locks:
            _locks[path] = threading.Lock()
        return _locks[path]


# ── Schema definitions ─────────────────────────────────────────────────────────
SCHEMAS: dict[str, list[str]] = {
    "users.csv": [
        "user_id", "username", "email", "password_hash",
        "created_at", "last_login",
    ],
    "notes.csv": [
        "note_id", "user_id", "title", "content", "tags",
        "file_paths", "created_at", "updated_at",
    ],
    "schedules.csv": [
        "schedule_id", "user_id", "title", "description",
        "date", "time_start", "time_end", "recurrence",
        "goal_id", "created_at",
    ],
    "goals.csv": [
        "goal_id", "user_id", "title", "description",
        "target_date", "status", "ai_plan", "created_at",
    ],
    "tasks.csv": [
        "task_id", "user_id", "title", "description",
        "status", "priority", "due_date", "completed_at",
        "schedule_id", "goal_id", "created_at",
    ],
    "medications.csv": [
        "med_id", "user_id", "patient_name", "medication_name",
        "dosage", "frequency", "times",          # times: comma-sep "08:00,20:00"
        "start_date", "end_date", "notes",
        "last_reminded", "created_at",
    ],
}


class CSVStore:
    """Namespace of static helpers — not instantiated."""

    # ── Bootstrap ──────────────────────────────────────────────────────────────
    @staticmethod
    def bootstrap(csv_dir: str) -> None:
        """Create CSV files with headers if they don't already exist."""
        for filename, headers in SCHEMAS.items():
            path = os.path.join(csv_dir, filename)
            if not os.path.exists(path):
                with open(path, "w", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=headers)
                    writer.writeheader()

    # ── Low-level helpers ──────────────────────────────────────────────────────
    @staticmethod
    def _read_df(path: str) -> pd.DataFrame:
        try:
            df = pd.read_csv(path, dtype=str, keep_default_na=False)
        except pd.errors.EmptyDataError:
            headers = SCHEMAS.get(os.path.basename(path), [])
            df = pd.DataFrame(columns=headers)
        return df

    @staticmethod
    def _write_df(path: str, df: pd.DataFrame) -> None:
        """Atomic write: write to .tmp then rename."""
        tmp = path + ".tmp"
        df.to_csv(tmp, index=False)
        os.replace(tmp, path)

    # ── Public CRUD API ────────────────────────────────────────────────────────
    @staticmethod
    def read_all(path: str) -> list[dict]:
        lock = _get_lock(path)
        with lock:
            df = CSVStore._read_df(path)
        return df.to_dict(orient="records")

    @staticmethod
    def filter_rows(
        path: str,
        filters: dict[str, Any],
    ) -> list[dict]:
        """Return rows where ALL filter key=value pairs match (string compare)."""
        lock = _get_lock(path)
        with lock:
            df = CSVStore._read_df(path)
        if df.empty:
            return []
        mask = pd.Series([True] * len(df))
        for col, val in filters.items():
            if col in df.columns:
                mask &= df[col] == str(val)
        return df[mask].to_dict(orient="records")

    @staticmethod
    def find_all(path: str, filters: dict[str, Any]) -> list[dict]:
        """Alias for filter_rows."""
        return CSVStore.filter_rows(path, filters)

    @staticmethod
    def find_one(path: str, filters: dict[str, Any]) -> dict | None:
        rows = CSVStore.filter_rows(path, filters)
        return rows[0] if rows else None

    @staticmethod
    def insert(path: str, row: dict) -> dict:
        """Append a new row; adds id + timestamps automatically if missing."""
        # Auto-fill common fields
        pk_field = list(SCHEMAS.get(os.path.basename(path), ["id"]))[0]
        if pk_field not in row or not row[pk_field]:
            row[pk_field] = str(uuid.uuid4())
        if "created_at" in SCHEMAS.get(os.path.basename(path), []) and "created_at" not in row:
            row["created_at"] = _now()

        lock = _get_lock(path)
        with lock:
            df = CSVStore._read_df(path)
            new_row = pd.DataFrame([row])
            df = pd.concat([df, new_row], ignore_index=True)
            CSVStore._write_df(path, df)
        return row

    @staticmethod
    def update(path: str, pk_field: str, pk_value: str, updates: dict) -> dict | None:
        """Update the first row matching pk_field=pk_value. Returns updated row."""
        lock = _get_lock(path)
        with lock:
            df = CSVStore._read_df(path)
            mask = df[pk_field] == str(pk_value)
            if not mask.any():
                return None
            for col, val in updates.items():
                df.loc[mask, col] = str(val)
            if "updated_at" in df.columns:
                df.loc[mask, "updated_at"] = _now()
            CSVStore._write_df(path, df)
            return df[mask].iloc[0].to_dict()

    @staticmethod
    def delete(path: str, pk_field: str, pk_value: str) -> bool:
        lock = _get_lock(path)
        with lock:
            df = CSVStore._read_df(path)
            mask = df[pk_field] == str(pk_value)
            if not mask.any():
                return False
            df = df[~mask]
            CSVStore._write_df(path, df)
        return True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
