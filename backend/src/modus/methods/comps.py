"""Comparable Company Analysis (Comps / CCA).

Methodology:
1. Select a peer set for the company's sector (from fixtures).
2. Pull EV/Revenue, EV/EBITDA, P/E multiples for each peer (via provider chain).
3. Compute 25th / median / 75th percentile of EV/Revenue across peers.
4. Apply those multiples to the target company's LTM revenue.
5. Apply an illiquidity / private-company discount to reflect lack of marketability.
6. Return a fair-value range with full audit trail (peer table + all citations).

EV/Revenue is the primary multiple (works for loss-making growth companies);
EV/EBITDA and P/E are shown in the trail for context but do not drive the range.
"""

from __future__ import annotations

import json
import statistics
from importlib import resources
from pathlib import Path

from modus.audit.trail import AuditTrailBuilder
from modus.core.models import Assumption, CompanyInput, MethodResult, Range
from modus.data.providers.base import ProviderChain

PRIVATE_COMPANY_DISCOUNT = 0.25  # 25% haircut vs. public peers — standard auditor convention


def _load_peer_sets() -> dict[str, list[str]]:
    fp = resources.files("modus.data.fixtures") / "peer_sets.json"
    return json.loads(Path(str(fp)).read_text())


class CompsMethod:
    name = "comps"

    def __init__(self, providers: ProviderChain) -> None:
        self.providers = providers
        self._peer_sets = _load_peer_sets()

    def run(self, company: CompanyInput) -> MethodResult:
        trail = AuditTrailBuilder(self.name)
        peers = self._peer_sets.get(company.sector, [])

        trail.record(
            description=f"Selected {len(peers)} peers for sector '{company.sector}'",
            inputs={"sector": company.sector},
            outputs={"peers": peers},
            assumptions=[
                Assumption(
                    name="peer_set",
                    value=", ".join(peers),
                    rationale=f"Canonical public-market peer set for {company.sector} from fixtures.",
                )
            ],
        )

        multiples = self.providers.peer_multiples(peers)
        ev_rev_values = [m.ev_revenue for m in multiples]
        peer_citations = [m.citation for m in multiples]

        if not ev_rev_values:
            # Degenerate case — no peers matched. Return a minimal range on defaults.
            trail.record(
                description="No peer multiples available — returning zero range",
                outputs={"ev_revenue_stats": None},
            )
            zero = Range(low=0, base=0, high=0)
            return MethodResult(
                method=self.name,
                range=zero,
                weight=0.0,
                confidence=0.0,
                steps=trail.steps,
                citations=trail.all_citations(),
                summary="No peer data — method excluded from aggregation.",
            )

        sorted_vals = sorted(ev_rev_values)
        p25 = statistics.quantiles(sorted_vals, n=4)[0] if len(sorted_vals) >= 4 else sorted_vals[0]
        median = statistics.median(sorted_vals)
        p75 = (
            statistics.quantiles(sorted_vals, n=4)[2] if len(sorted_vals) >= 4 else sorted_vals[-1]
        )

        trail.record(
            description="Computed EV/Revenue quartiles across peer set",
            inputs={"peer_multiples": [{"ticker": m.ticker, "ev_rev": m.ev_revenue} for m in multiples]},
            outputs={"p25": p25, "median": median, "p75": p75, "n_peers": len(multiples)},
            citations=peer_citations,
        )

        # Private-company / illiquidity discount
        discount = 1.0 - PRIVATE_COMPANY_DISCOUNT
        trail.record(
            description=f"Applied {int(PRIVATE_COMPANY_DISCOUNT * 100)}% private-company discount",
            outputs={"discount_factor": discount},
            assumptions=[
                Assumption(
                    name="private_company_discount",
                    value=PRIVATE_COMPANY_DISCOUNT,
                    rationale=(
                        "Standard auditor haircut for lack of marketability on private shares. "
                        "See Damodaran's illiquidity-discount literature."
                    ),
                )
            ],
        )

        low = company.ltm_revenue * p25 * discount
        base = company.ltm_revenue * median * discount
        high = company.ltm_revenue * p75 * discount
        # Ensure monotonic even if the quartile calc was noisy
        low, base, high = sorted([low, base, high])
        rng = Range(low=low, base=base, high=high)

        trail.record(
            description="Applied quartile multiples to target LTM revenue",
            inputs={"ltm_revenue": company.ltm_revenue},
            outputs={"low": rng.low, "base": rng.base, "high": rng.high},
        )

        return MethodResult(
            method=self.name,
            range=rng,
            weight=0.0,  # engine assigns final weights
            confidence=min(1.0, len(multiples) / 8.0),
            assumptions=trail.all_assumptions(),
            steps=trail.steps,
            citations=trail.all_citations(),
            summary=(
                f"Comps: {len(multiples)} peers, EV/Rev median={median:.1f}x, "
                f"range=${rng.low/1e6:,.0f}M–${rng.high/1e6:,.0f}M"
            ),
        )
