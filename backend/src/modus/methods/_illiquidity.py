"""Stage-aware illiquidity discount for private companies.

Instead of a flat 25% discount, we compute a discount that varies based on
three observable signals:

1. **Time since last round** — more recent funding = better price discovery
   = lower discount. Stale rounds (>3yr) get penalized.
2. **Revenue scale** — higher revenue = closer to IPO-readiness = lower
   discount. A $500M-ARR company is more liquid than a $5M-ARR one.
3. **Sector liquidity** — some sectors (fintech, SaaS) have deeper
   secondary markets than others (consumer, marketplace).

The model outputs a discount in [0.10, 0.35] (10%–35%) and returns an
`Assumption` recording exactly how it was derived, so the audit trail stays
fully transparent.
"""

from __future__ import annotations

from datetime import date

from modus.core.models import Assumption, Sector


# Sector liquidity premiums — higher = more liquid secondary market = lower discount.
_SECTOR_LIQUIDITY: dict[str, float] = {
    "ai_saas": 0.04,
    "vertical_saas": 0.03,
    "fintech": 0.05,
    "marketplace": 0.02,
    "consumer": 0.01,
}

_MIN_DISCOUNT = 0.10
_MAX_DISCOUNT = 0.35
_BASE_DISCOUNT = 0.25


def compute_illiquidity_discount(
    sector: Sector,
    ltm_revenue: float,
    last_round_date: date | None = None,
    as_of: date | None = None,
) -> tuple[float, Assumption]:
    """Return (discount_fraction, audit_assumption).

    The discount is applied as `fair_value *= (1 - discount)`.
    """
    as_of = as_of or date.today()
    adjustments: list[str] = []

    discount = _BASE_DISCOUNT

    # 1. Round staleness adjustment (-5% to +5%)
    if last_round_date is not None:
        months_since = max(0, (as_of - last_round_date).days) / 30.44
        if months_since < 6:
            adj = -0.05
            adjustments.append(f"recent round ({months_since:.0f}mo): −5pp")
        elif months_since < 18:
            adj = -0.02
            adjustments.append(f"moderately recent round ({months_since:.0f}mo): −2pp")
        elif months_since > 36:
            adj = +0.05
            adjustments.append(f"stale round ({months_since:.0f}mo): +5pp")
        else:
            adj = 0.0
        discount += adj
    else:
        discount += 0.03
        adjustments.append("no round date: +3pp (unknown price discovery)")

    # 2. Revenue scale adjustment (-5% to +3%)
    if ltm_revenue >= 500_000_000:
        adj = -0.05
        adjustments.append(f"large revenue (${ltm_revenue/1e6:,.0f}M): −5pp")
    elif ltm_revenue >= 100_000_000:
        adj = -0.03
        adjustments.append(f"growth-stage revenue (${ltm_revenue/1e6:,.0f}M): −3pp")
    elif ltm_revenue >= 20_000_000:
        adj = -0.01
        adjustments.append(f"mid-stage revenue (${ltm_revenue/1e6:,.0f}M): −1pp")
    elif ltm_revenue < 5_000_000:
        adj = +0.03
        adjustments.append(f"early-stage revenue (${ltm_revenue/1e6:,.0f}M): +3pp")
    else:
        adj = 0.0
    discount += adj

    # 3. Sector liquidity adjustment
    sector_adj = _SECTOR_LIQUIDITY.get(sector, 0.0)
    discount -= sector_adj
    if sector_adj:
        adjustments.append(f"sector liquidity ({sector}): −{sector_adj*100:.0f}pp")

    discount = max(_MIN_DISCOUNT, min(_MAX_DISCOUNT, discount))

    rationale = (
        f"Stage-aware illiquidity discount: base 25%, adjustments: "
        f"{'; '.join(adjustments) or 'none'}. "
        f"Final: {discount:.0%}. Range [{_MIN_DISCOUNT:.0%}, {_MAX_DISCOUNT:.0%}]."
    )

    assumption = Assumption(
        name="illiquidity_discount",
        value=discount,
        rationale=rationale,
    )
    return discount, assumption
