"""Discounted Cash Flow (DCF) valuation.

Methodology:
1. Project revenue over 5 explicit years using a linearly decaying growth rate
   (current → sector mid-point over 5 years).
2. Project EBIT margin linearly from current → target EBIT margin.
3. Compute unlevered free cash flow:  FCF = EBIT × (1 − tax) − capex − ΔWC
4. WACC = risk-free (10Y UST) + sector equity risk premium  (kept simple —
   no explicit beta since the private company has no market cap).
5. Discount explicit FCFs; add Gordon-growth terminal value at year 5.
6. Sensitivity grid: WACC ± 1pp × terminal g ± 1pp → EV min/max.
7. Apply illiquidity haircut same as Comps for private-company comparability.

All assumptions are recorded in the audit trail with sector-default rationale.
"""

from __future__ import annotations

from datetime import date

from modus.assumptions import defaults_for
from modus.audit.trail import AuditTrailBuilder
from modus.core.models import Assumption, CompanyInput, MethodResult, Range
from modus.data.providers.base import ProviderChain
from modus.methods._illiquidity import compute_illiquidity_discount
from modus.sensitivity import build_grid
PROJECTION_YEARS = 5
SECTOR_ERP = 0.08  # equity risk premium simplification


def _decay(current: float, target: float, years: int) -> list[float]:
    """Linearly decay from `current` to `target` over `years` steps (inclusive of year 1)."""
    if years <= 1:
        return [target]
    step = (target - current) / years
    return [current + step * (i + 1) for i in range(years)]


class DCFMethod:
    name = "dcf"

    def __init__(self, providers: ProviderChain) -> None:
        self.providers = providers

    def run(self, company: CompanyInput) -> MethodResult:
        trail = AuditTrailBuilder(self.name)
        d = defaults_for(company.sector)
        as_of = company.as_of or date.today()

        rf = self.providers.risk_free_rate(as_of)
        base_wacc = rf.rate + SECTOR_ERP
        trail.record(
            description=f"Computed WACC from risk-free rate ({rf.rate:.3f}) + ERP ({SECTOR_ERP:.3f})",
            outputs={"wacc": base_wacc},
            citations=[rf.citation],
            assumptions=[
                Assumption(
                    name="equity_risk_premium",
                    value=SECTOR_ERP,
                    rationale="Simplified sector-average ERP. A full model would use a bottom-up beta × ERP.",
                )
            ],
        )

        # Project revenue: decay growth from company's current growth toward sector mid (~10% yr5).
        sector_terminal_growth = d.terminal_growth
        growth_path = _decay(company.revenue_growth, 0.10, PROJECTION_YEARS)
        revenues: list[float] = []
        rev = company.ltm_revenue
        for g in growth_path:
            rev = rev * (1 + g)
            revenues.append(rev)
        trail.record(
            description="Projected revenue path (5yr) with decaying growth",
            inputs={"ltm_revenue": company.ltm_revenue, "current_growth": company.revenue_growth},
            outputs={"growth_path": [round(g, 3) for g in growth_path], "revenues": [round(r, 0) for r in revenues]},
            assumptions=[
                Assumption(
                    name="growth_decay",
                    value="linear to 10% by yr5",
                    rationale="Venture-stage growth fades to sector average over the explicit period.",
                )
            ],
        )

        # Project EBIT margin linearly from current to target
        margin_path = _decay(company.ebit_margin, company.target_ebit_margin or d.target_ebit_margin, PROJECTION_YEARS)
        tax_rate = company.tax_rate if company.tax_rate is not None else d.tax_rate
        capex_pct = company.capex_pct_revenue if company.capex_pct_revenue is not None else d.capex_pct_revenue
        wc_pct = company.wc_pct_revenue if company.wc_pct_revenue is not None else d.wc_pct_revenue

        fcfs: list[float] = []
        prev_rev = company.ltm_revenue
        for r, m in zip(revenues, margin_path, strict=True):
            ebit = r * m
            nopat = ebit * (1 - tax_rate)
            capex = r * capex_pct
            d_wc = (r - prev_rev) * wc_pct
            fcfs.append(nopat - capex - d_wc)
            prev_rev = r
        trail.record(
            description="Projected unlevered FCF path",
            outputs={
                "margin_path": [round(m, 3) for m in margin_path],
                "fcfs": [round(f, 0) for f in fcfs],
            },
            assumptions=[
                Assumption(name="tax_rate", value=tax_rate, rationale="Sector default / input."),
                Assumption(name="capex_pct_revenue", value=capex_pct, rationale="Sector default / input."),
                Assumption(name="wc_pct_revenue", value=wc_pct, rationale="Sector default / input."),
                Assumption(name="target_ebit_margin", value=margin_path[-1], rationale="Mature-state margin target."),
            ],
        )

        def compute_ev(wacc: float, term_g: float) -> float:
            pv_explicit = sum(f / (1 + wacc) ** (i + 1) for i, f in enumerate(fcfs))
            terminal_fcf = fcfs[-1] * (1 + term_g)
            terminal_value = terminal_fcf / (wacc - term_g) if wacc > term_g else 0.0
            pv_terminal = terminal_value / (1 + wacc) ** PROJECTION_YEARS
            return pv_explicit + pv_terminal

        base_ev = compute_ev(base_wacc, sector_terminal_growth)
        grid = build_grid(base_wacc, sector_terminal_growth, compute_ev)
        grid_min, grid_max = grid.min_max()

        trail.record(
            description="Built WACC × terminal-growth sensitivity grid (±1pp × ±1pp)",
            inputs={"base_wacc": base_wacc, "base_terminal_growth": sector_terminal_growth},
            outputs={
                "wacc_values": grid.wacc_values,
                "growth_values": grid.growth_values,
                "grid": [[round(v, 0) for v in row] for row in grid.grid],
                "min": round(grid_min, 0),
                "base": round(base_ev, 0),
                "max": round(grid_max, 0),
            },
        )

        illiq_rate, illiq_assumption = compute_illiquidity_discount(
            sector=company.sector,
            ltm_revenue=company.ltm_revenue,
            last_round_date=company.last_round_date,
            as_of=company.as_of,
        )
        discount = 1.0 - illiq_rate
        low = min(grid_min, base_ev) * discount
        base = base_ev * discount
        high = max(grid_max, base_ev) * discount
        low, base, high = sorted([low, base, high])
        rng = Range(low=low, base=base, high=high)

        trail.record(
            description=f"Applied {illiq_rate:.0%} stage-aware illiquidity discount",
            inputs={"pre_discount_low": min(grid_min, base_ev), "pre_discount_base": base_ev, "pre_discount_high": max(grid_max, base_ev)},
            outputs={"low": rng.low, "base": rng.base, "high": rng.high},
            assumptions=[illiq_assumption],
        )

        return MethodResult(
            method=self.name,
            range=rng,
            weight=0.0,
            confidence=0.6 if company.ebit_margin > -0.5 else 0.4,
            assumptions=trail.all_assumptions(),
            steps=trail.steps,
            citations=trail.all_citations(),
            summary=(
                f"DCF: WACC={base_wacc:.1%}, term g={sector_terminal_growth:.1%}, "
                f"range=${rng.low/1e6:,.0f}M–${rng.high/1e6:,.0f}M"
            ),
        )
