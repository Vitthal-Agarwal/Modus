"""Sector-level default assumptions.

These are intentionally conservative public-market-informed starting points. Every
default is cited in the audit trail when used, so auditors can see exactly what was
assumed and why.
"""

from __future__ import annotations

from dataclasses import dataclass

from modus.core.models import Sector


@dataclass(frozen=True)
class SectorDefaults:
    # DCF
    terminal_growth: float
    wacc: float
    target_ebit_margin: float
    tax_rate: float
    capex_pct_revenue: float
    wc_pct_revenue: float
    # Comps
    default_ev_revenue_multiple: float  # fallback if peer set empty
    # Index ticker (public proxy) for last-round mark-to-market
    index_ticker: str


SECTOR_DEFAULTS: dict[Sector, SectorDefaults] = {
    "ai_saas": SectorDefaults(
        terminal_growth=0.03,
        wacc=0.12,
        target_ebit_margin=0.25,
        tax_rate=0.21,
        capex_pct_revenue=0.03,
        wc_pct_revenue=0.05,
        default_ev_revenue_multiple=12.0,
        index_ticker="IGV",
    ),
    "vertical_saas": SectorDefaults(
        terminal_growth=0.025,
        wacc=0.11,
        target_ebit_margin=0.22,
        tax_rate=0.21,
        capex_pct_revenue=0.03,
        wc_pct_revenue=0.04,
        default_ev_revenue_multiple=8.0,
        index_ticker="IGV",
    ),
    "fintech": SectorDefaults(
        terminal_growth=0.025,
        wacc=0.13,
        target_ebit_margin=0.20,
        tax_rate=0.25,
        capex_pct_revenue=0.02,
        wc_pct_revenue=0.06,
        default_ev_revenue_multiple=6.0,
        index_ticker="XLF",
    ),
    "marketplace": SectorDefaults(
        terminal_growth=0.025,
        wacc=0.12,
        target_ebit_margin=0.18,
        tax_rate=0.23,
        capex_pct_revenue=0.02,
        wc_pct_revenue=0.05,
        default_ev_revenue_multiple=5.0,
        index_ticker="XLY",
    ),
    "consumer": SectorDefaults(
        terminal_growth=0.02,
        wacc=0.11,
        target_ebit_margin=0.15,
        tax_rate=0.23,
        capex_pct_revenue=0.04,
        wc_pct_revenue=0.08,
        default_ev_revenue_multiple=4.0,
        index_ticker="XLY",
    ),
}


def defaults_for(sector: Sector) -> SectorDefaults:
    return SECTOR_DEFAULTS[sector]
