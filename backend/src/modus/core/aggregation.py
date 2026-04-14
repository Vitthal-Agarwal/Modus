"""Blend multiple MethodResults into a single fair-value Range."""

from __future__ import annotations

from modus.core.models import MethodName, MethodResult, Range

DEFAULT_WEIGHTS: dict[MethodName, float] = {
    "comps": 0.4,
    "dcf": 0.4,
    "last_round": 0.2,
}


def resolve_weights(
    results: list[MethodResult],
    overrides: dict[MethodName, float] | None,
) -> dict[MethodName, float]:
    """Compute normalized weights, honoring user overrides and dropping zero-confidence methods."""
    active = {r.method: max(r.confidence, 0.01) for r in results if r.range.base > 0}
    if not active:
        return {}
    base = overrides if overrides else {k: DEFAULT_WEIGHTS[k] for k in active}
    weighted = {k: base.get(k, 0.0) * active[k] for k in active}
    total = sum(weighted.values())
    if total == 0:
        return {k: 1.0 / len(active) for k in active}
    return {k: v / total for k, v in weighted.items()}


def blend(results: list[MethodResult], weights: dict[MethodName, float]) -> Range:
    """Weighted blend of low/base/high across methods. Preserves monotonicity."""
    if not results or not weights:
        return Range(low=0, base=0, high=0)
    low = sum(r.range.low * weights.get(r.method, 0.0) for r in results)
    base = sum(r.range.base * weights.get(r.method, 0.0) for r in results)
    high = sum(r.range.high * weights.get(r.method, 0.0) for r in results)
    lo, bs, hi = sorted([low, base, high])
    return Range(low=lo, base=bs, high=hi)
