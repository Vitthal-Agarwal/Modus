"""DCF sensitivity utilities.

Build a WACC × terminal-growth grid of enterprise values and extract
low/base/high from the corners of the grid for the audit trail.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class SensitivityGrid:
    wacc_values: list[float]
    growth_values: list[float]
    grid: list[list[float]]  # grid[i][j] = EV for wacc_values[i], growth_values[j]

    def min_max(self) -> tuple[float, float]:
        flat = [v for row in self.grid for v in row]
        return min(flat), max(flat)


def build_grid(
    base_wacc: float,
    base_growth: float,
    compute_ev: Callable[[float, float], float],
    *,
    wacc_step: float = 0.01,
    growth_step: float = 0.01,
    steps: int = 1,
) -> SensitivityGrid:
    """Build a (2*steps+1) × (2*steps+1) grid around (base_wacc, base_growth)."""
    waccs = [round(base_wacc + i * wacc_step, 4) for i in range(-steps, steps + 1)]
    growths = [round(base_growth + j * growth_step, 4) for j in range(-steps, steps + 1)]
    grid = [[compute_ev(w, g) for g in growths] for w in waccs]
    return SensitivityGrid(wacc_values=waccs, growth_values=growths, grid=grid)
