"""SQLite-backed persistence for audit run scenarios.

Each saved scenario stores the full ValuationOutput payload as JSON alongside
a user-supplied label and timestamp. The DB lives at
``{MODUS_CACHE_DIR}/scenarios.db`` so it co-locates with the diskcache.

All public functions open and close a fresh connection; SQLite WAL mode makes
this safe under FastAPI's multi-threaded request handling.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from modus.core.models import ValuationOutput

_CACHE_DIR = Path(os.environ.get("MODUS_CACHE_DIR", ".modus_cache"))


def _db_path() -> Path:
    # Re-evaluated each call so tests can monkeypatch MODUS_CACHE_DIR.
    return Path(os.environ.get("MODUS_CACHE_DIR", ".modus_cache")) / "scenarios.db"


def _connect() -> sqlite3.Connection:
    db = _db_path()
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS scenarios (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            company   TEXT    NOT NULL,
            label     TEXT    NOT NULL,
            saved_at  TEXT    NOT NULL,
            payload   TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scenarios_company ON scenarios (company);
    """)
    conn.commit()


def save_scenario(output: ValuationOutput, label: str) -> int:
    """Persist a ValuationOutput with a label. Returns the new row id."""
    payload = json.dumps(output.model_dump(mode="json"))
    saved_at = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO scenarios (company, label, saved_at, payload) VALUES (?, ?, ?, ?)",
            (output.company, label, saved_at, payload),
        )
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]


def list_scenarios(company: str) -> list[dict]:
    """Return scenario metadata (no payload) for a company, newest first."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, company, label, saved_at FROM scenarios WHERE company = ? ORDER BY id DESC",
            (company,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_scenario(scenario_id: int) -> ValuationOutput | None:
    """Fetch and deserialize a single scenario by id. Returns None if not found."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT payload FROM scenarios WHERE id = ?",
            (scenario_id,),
        ).fetchone()
    if row is None:
        return None
    return ValuationOutput.model_validate(json.loads(row["payload"]))


def delete_scenario(scenario_id: int) -> bool:
    """Delete a scenario by id. Returns True if a row was deleted."""
    with _connect() as conn:
        cur = conn.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
        conn.commit()
        return cur.rowcount > 0


def _meta_row(conn: sqlite3.Connection, scenario_id: int) -> dict | None:
    row = conn.execute(
        "SELECT id, company, label, saved_at FROM scenarios WHERE id = ?",
        (scenario_id,),
    ).fetchone()
    return dict(row) if row else None


def diff_scenarios(id_a: int, id_b: int) -> dict | None:
    """Compute the delta between two saved scenarios.

    Returns None if either id is missing. The returned dict has shape::

        {
          "a": {id, company, label, saved_at},
          "b": {id, company, label, saved_at},
          "fair_value": {base_delta, base_delta_pct, low_delta, high_delta},
          "methods": [{method, base_delta, base_delta_pct, range_delta: {low,base,high}}]
        }
    """
    with _connect() as conn:
        meta_a = _meta_row(conn, id_a)
        meta_b = _meta_row(conn, id_b)
        if meta_a is None or meta_b is None:
            return None
        row_a = conn.execute("SELECT payload FROM scenarios WHERE id = ?", (id_a,)).fetchone()
        row_b = conn.execute("SELECT payload FROM scenarios WHERE id = ?", (id_b,)).fetchone()

    out_a = ValuationOutput.model_validate(json.loads(row_a["payload"]))
    out_b = ValuationOutput.model_validate(json.loads(row_b["payload"]))

    fv_a = out_a.fair_value
    fv_b = out_b.fair_value
    base_delta = fv_b.base - fv_a.base
    base_delta_pct = base_delta / fv_a.base if fv_a.base != 0 else 0.0

    # Build per-method diff, keyed by method name.
    methods_a = {m.method: m for m in out_a.methods}
    methods_b = {m.method: m for m in out_b.methods}
    all_methods = sorted(set(methods_a) | set(methods_b))

    method_diffs = []
    for method in all_methods:
        ma = methods_a.get(method)
        mb = methods_b.get(method)
        if ma is None or mb is None:
            continue
        bd = mb.range.base - ma.range.base
        bd_pct = bd / ma.range.base if ma.range.base != 0 else None
        method_diffs.append({
            "method": method,
            "base_delta": bd,
            "base_delta_pct": bd_pct,
            "range_delta": {
                "low": mb.range.low - ma.range.low,
                "base": bd,
                "high": mb.range.high - ma.range.high,
            },
        })

    return {
        "a": meta_a,
        "b": meta_b,
        "fair_value": {
            "base_delta": base_delta,
            "base_delta_pct": base_delta_pct,
            "low_delta": fv_b.low - fv_a.low,
            "high_delta": fv_b.high - fv_a.high,
        },
        "methods": method_diffs,
    }
