"""Tests for the caching layer."""

from __future__ import annotations

from datetime import date

from modus.data.cache import cache_key, cache_stats, clear_cache, get_cache, get_or_compute


def test_cache_key_format() -> None:
    k = cache_key("yfinance", "SNOW", date(2026, 4, 14))
    assert k == "yfinance::SNOW::2026-04-14"


def test_get_or_compute_caches_result() -> None:
    call_count = 0

    def compute():
        nonlocal call_count
        call_count += 1
        return {"ev_revenue": 10.5}

    as_of = date(2099, 1, 1)
    key = "test_cache_hit"
    result1 = get_or_compute("test_provider", key, as_of, compute)
    result2 = get_or_compute("test_provider", key, as_of, compute)
    assert result1 == result2 == {"ev_revenue": 10.5}
    assert call_count == 1

    clear_cache("test_provider")


def test_none_result_is_cached_with_short_ttl() -> None:
    call_count = 0

    def compute():
        nonlocal call_count
        call_count += 1
        return None

    as_of = date(2099, 1, 2)
    result1 = get_or_compute("test_none", "key", as_of, compute)
    result2 = get_or_compute("test_none", "key", as_of, compute)
    assert result1 is None
    assert result2 is None
    assert call_count == 1

    clear_cache("test_none")


def test_clear_cache_by_provider() -> None:
    as_of = date(2099, 1, 3)
    get_or_compute("prov_a", "k1", as_of, lambda: "a1")
    get_or_compute("prov_b", "k1", as_of, lambda: "b1")

    cleared = clear_cache("prov_a")
    assert cleared == 1

    c = get_cache()
    assert cache_key("prov_a", "k1", as_of) not in c
    assert cache_key("prov_b", "k1", as_of) in c

    clear_cache("prov_b")


def test_cache_stats() -> None:
    as_of = date(2099, 1, 4)
    get_or_compute("stats_test", "k1", as_of, lambda: 42)
    stats = cache_stats()
    assert stats["total_entries"] >= 1
    assert "by_provider" in stats
    assert "cache_dir" in stats

    clear_cache("stats_test")


def test_clear_all() -> None:
    as_of = date(2099, 1, 5)
    get_or_compute("all_a", "k", as_of, lambda: 1)
    get_or_compute("all_b", "k", as_of, lambda: 2)
    cleared = clear_cache()
    assert cleared >= 2
