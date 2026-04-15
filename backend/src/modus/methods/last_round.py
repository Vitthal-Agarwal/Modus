"""Last Round Post-Money — mark-to-market method.

Methodology:
1. Take the last-round post-money as the anchor.
2. Pull a sector public-market index return from round-date → as-of.
3. Apply the index return to the anchor (beta = 1.0 simplification).
4. Widen the range by ±15% to reflect private-company bid/ask uncertainty.
5. Apply a staleness penalty to confidence if the round is > 18 months old.
"""

from __future__ import annotations

from datetime import date, timedelta

from modus.assumptions import defaults_for
from modus.audit.trail import AuditTrailBuilder
from modus.core.models import Assumption, CompanyInput, MethodResult, Range
from modus.data.providers.base import ProviderChain

SPREAD = 0.15  # ±15% bid/ask widening


class LastRoundMethod:
    name = "last_round"

    def __init__(self, providers: ProviderChain) -> None:
        self.providers = providers

    def run(self, company: CompanyInput) -> MethodResult:
        trail = AuditTrailBuilder(self.name)
        d = defaults_for(company.sector)

        if company.last_round_post_money is None:
            trail.record(
                description="No last-round data provided — method skipped",
                outputs={"skipped": True},
            )
            zero = Range(low=0, base=0, high=0)
            return MethodResult(
                method=self.name,
                range=zero,
                weight=0.0,
                confidence=0.0,
                steps=trail.steps,
                citations=trail.all_citations(),
                summary="No last-round data — method excluded.",
            )

        anchor = company.last_round_post_money
        as_of = company.as_of or date.today()

        date_assumed = False
        if company.last_round_date is None:
            # No date from research — assume 24 months ago (conservative fallback)
            assumed_date = as_of - timedelta(days=730)
            trail.record(
                description="Round date unknown — assuming 24 months ago (conservative fallback)",
                outputs={"assumed_date": assumed_date.isoformat()},
                assumptions=[
                    Assumption(
                        name="assumed_round_date",
                        value=assumed_date.isoformat(),
                        rationale="Research did not return an exact round date. Using 24 months ago as a conservative fallback; confidence is penalized accordingly.",
                    )
                ],
            )
            round_date = assumed_date
            date_assumed = True
        else:
            round_date = company.last_round_date

        trail.record(
            description="Recorded last-round anchor",
            inputs={
                "post_money": anchor,
                "round_date": round_date.isoformat(),
                "date_assumed": date_assumed,
                "size": company.last_round_size,
                "investors": company.last_round_investors,
            },
            outputs={"anchor": anchor},
        )

        idx = self.providers.index_return(d.index_ticker, round_date, as_of)
        adjusted = anchor * (1.0 + idx.total_return)
        trail.record(
            description=f"Marked to market via {d.index_ticker} total return",
            inputs={"index": d.index_ticker},
            outputs={"index_return": round(idx.total_return, 4), "adjusted": round(adjusted, 0)},
            citations=[idx.citation],
            assumptions=[
                Assumption(
                    name="mark_to_market_beta",
                    value=1.0,
                    rationale=(
                        "Simplification: assumes private company moves 1:1 with the sector public-index proxy. "
                        "A full model would estimate a bottom-up beta."
                    ),
                )
            ],
        )

        low = adjusted * (1 - SPREAD)
        base = adjusted
        high = adjusted * (1 + SPREAD)
        rng = Range(low=low, base=base, high=high)
        trail.record(
            description=f"Applied ±{int(SPREAD*100)}% private-company bid/ask spread",
            outputs={"low": rng.low, "base": rng.base, "high": rng.high},
            assumptions=[
                Assumption(
                    name="bid_ask_spread",
                    value=SPREAD,
                    rationale="Private-company liquidity uncertainty; illustrative.",
                )
            ],
        )

        # Staleness penalty — extra hit if date was assumed
        days_since = (as_of - round_date).days
        if date_assumed:
            confidence = 0.2
            trail.record(
                description="Round date was estimated — confidence set to 0.2",
                outputs={"confidence": confidence},
            )
        elif days_since > 548:  # ~18 months
            confidence = 0.3
            trail.record(
                description=f"Round is {days_since} days old — confidence lowered",
                outputs={"confidence": confidence},
            )
        else:
            confidence = 0.7

        date_label = f"{round_date.isoformat()} (est.)" if date_assumed else round_date.isoformat()
        return MethodResult(
            method=self.name,
            range=rng,
            weight=0.0,
            confidence=confidence,
            assumptions=trail.all_assumptions(),
            steps=trail.steps,
            citations=trail.all_citations(),
            summary=(
                f"Last round: ${anchor/1e6:,.0f}M on {date_label} → "
                f"${rng.base/1e6:,.0f}M after {d.index_ticker} markup"
            ),
        )
