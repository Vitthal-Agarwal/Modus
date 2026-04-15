"""Thin diskcache wrapper keyed on `(provider, key, as_of_date)` for reproducibility.

Every cache entry carries its own namespace so a failed live call that got
partially cached does not poison mock runs.

Cache entries have a default TTL of 24 hours — live market data shouldn't be
stale across audit sessions. `None` values (provider failures) are cached for
only 10 minutes so transient errors self-heal.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

from diskcache import Cache

_CACHE_DIR = Path(os.environ.get("MODUS_CACHE_DIR", ".modus_cache"))
_cache: Cache | None = None

_DEFAULT_TTL = 60 * 60 * 24  # 24 hours for successful results
_NONE_TTL = 60 * 10  # 10 minutes for None/failure results


def get_cache() -> Cache:
    global _cache
    if _cache is None:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _cache = Cache(str(_CACHE_DIR))
    return _cache


def cache_key(provider: str, key: str, as_of: date) -> str:
    return f"{provider}::{key}::{as_of.isoformat()}"


def get_or_compute(provider: str, key: str, as_of: date, compute: Callable[[], Any]) -> Any:
    """Look up a cached value; compute + store on miss.

    Successful (non-None) results are cached for 24h.
    None results are cached for 10min to avoid hammering failing providers
    while still allowing retry on transient errors.
    """
    c = get_cache()
    ck = cache_key(provider, key, as_of)
    sentinel = object()
    cached = c.get(ck, default=sentinel)
    if cached is not sentinel:
        return cached
    value = compute()
    ttl = _NONE_TTL if value is None else _DEFAULT_TTL
    c.set(ck, value, expire=ttl)
    return value


def cache_stats() -> dict[str, Any]:
    """Return cache health metrics."""
    c = get_cache()
    keys = list(c)
    providers: dict[str, int] = {}
    none_count = 0
    for k in keys:
        provider_name = k.split("::")[0] if "::" in k else "unknown"
        providers[provider_name] = providers.get(provider_name, 0) + 1
        if c.get(k) is None:
            none_count += 1
    return {
        "total_entries": len(keys),
        "none_entries": none_count,
        "by_provider": providers,
        "cache_dir": str(_CACHE_DIR),
        "cache_size_bytes": sum(
            f.stat().st_size for f in _CACHE_DIR.iterdir() if f.is_file()
        ) if _CACHE_DIR.exists() else 0,
    }


def clear_cache(provider: str | None = None) -> int:
    """Clear cache entries. If provider is given, clear only that provider's entries."""
    c = get_cache()
    if provider is None:
        count = len(c)
        c.clear()
        return count
    count = 0
    for k in list(c):
        if k.startswith(f"{provider}::"):
            del c[k]
            count += 1
    return count
