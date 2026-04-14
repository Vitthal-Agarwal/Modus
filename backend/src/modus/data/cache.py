"""Thin diskcache wrapper keyed on `(provider, key, as_of_date)` for reproducibility.

Every cache entry carries its own namespace so a failed live call that got
partially cached does not poison mock runs.
"""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Any

from diskcache import Cache

_CACHE_DIR = Path(os.environ.get("MODUS_CACHE_DIR", ".modus_cache"))
_cache: Cache | None = None


def get_cache() -> Cache:
    global _cache
    if _cache is None:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _cache = Cache(str(_CACHE_DIR))
    return _cache


def cache_key(provider: str, key: str, as_of: date) -> str:
    return f"{provider}::{key}::{as_of.isoformat()}"


def get_or_compute(provider: str, key: str, as_of: date, compute: callable) -> Any:  # type: ignore[valid-type]
    """Look up a cached value; compute + store on miss."""
    c = get_cache()
    ck = cache_key(provider, key, as_of)
    if ck in c:
        return c[ck]
    value = compute()
    c[ck] = value
    return value
