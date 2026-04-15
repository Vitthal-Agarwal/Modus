"""Precedent Transactions Analysis — comparable M&A deal multiples.

Methodology:
1. Query the Octagon deals agent for recent M&A/IPO transactions in the
   target's sector that include EV/Revenue multiples.
2. Parse all multiples from the response.
3. Compute 25th / median / 75th percentile of deal EV/Revenue.
4. Apply those multiples to the target company's LTM revenue.
5. Apply the stage-aware illiquidity discount.
6. Return a fair-value range with full deal citations in the audit trail.

Falls back to sector-level fixture multiples if Octagon is unavailable.
"""

from __future__ import annotations

import json
import re
import statistics
from importlib import resources
from pathlib import Path

from modus.audit.trail import AuditTrailBuilder
from modus.core.models import Assumption, Citation, CompanyInput, MethodResult, Range
from modus.data.providers.base import ProviderChain
from modus.methods._illiquidity import compute_illiquidity_discount

_DEAL_MULTIPLE_RE = re.compile(
    r"(\d{1,3}(?:\.\d{1,2})?)\s*x",
    re.IGNORECASE,
)


def _load_fixture_deals() -> dict[str, list[dict]]:
    fp = resources.files("modus.data.fixtures") / "precedent_deals.json"
    path = Path(str(fp))
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def _parse_all_multiples(text: str) -> list[float]:
    """Extract all plausible EV/Revenue multiples from text."""
    out: list[float] = []
    for m in _DEAL_MULTIPLE_RE.finditer(text):
        val = float(m.group(1))
        if 0.5 <= val <= 100:
            out.append(val)
    return out


class PrecedentTransactionsMethod:
    name = "precedent_txns"

    def __init__(self, providers: ProviderChain) -> None:
        self.providers = providers
        self._fixture_deals = _load_fixture_deals()

    def _query_octagon(self, sector: str) -> tuple[list[float], list[Citation]]:
        """Try Octagon's deals agent for sector M&A multiples."""
        from modus.data.providers.octagon_provider import OctagonProvider

        octagon = None
        for p in self.providers.providers:
            if isinstance(p, OctagonProvider):
                octagon = p
                break
        if octagon is None:
            return [], []

        try:
            octagon._require_key()
        except Exception:
            return [], []

        question = (
            f"List 5-8 recent M&A or IPO transactions in the {sector} sector "
            f"from the last 24 months. For each deal, give the company name "
            f"and the EV/Revenue multiple in the form 'N.Nx'. Be concise."
        )
        try:
            reply = octagon._ask(question)
        except Exception:
            return [], []

        multiples = _parse_all_multiples(reply.text)
        citations: list[Citation] = []
        if multiples:
            from datetime import date as date_cls

            from modus.data.providers.octagon_provider import _primary_annotation_url

            ann_url = _primary_annotation_url(reply.annotations)
            citations.append(Citation(
                source="octagon (deals-agent)",
                field=f"{sector} precedent transactions",
                value=f"{len(multiples)} deals parsed",
                as_of=date_cls.today(),
                url=ann_url or "https://octagonai.co/private-market-intelligence/",
                note=reply.text[:240].replace("\n", " "),
            ))
        return multiples, citations

    def _load_mock_deals(self, sector: str) -> tuple[list[float], list[Citation]]:
        """Fallback to fixture deals if Octagon is unavailable."""
        from datetime import date as date_cls

        deals = self._fixture_deals.get(sector, [])
        multiples = [d["ev_revenue"] for d in deals if "ev_revenue" in d]
        citations: list[Citation] = []
        if multiples:
            citations.append(Citation(
                source="mock fixture",
                field=f"{sector} precedent transactions",
                value=f"{len(multiples)} fixture deals",
                as_of=date_cls.today(),
                note="deterministic fixture — not live deal data",
            ))
        return multiples, citations

    def run(self, company: CompanyInput) -> MethodResult:
        trail = AuditTrailBuilder(self.name)

        trail.record(
            description=f"Searching for precedent M&A transactions in {company.sector}",
            inputs={"sector": company.sector},
        )

        multiples, citations = self._query_octagon(company.sector)
        source = "octagon"
        if not multiples:
            multiples, citations = self._load_mock_deals(company.sector)
            source = "mock fixture"

        if not multiples:
            trail.record(
                description="No precedent transaction data available — method skipped",
                outputs={"skipped": True},
            )
            return MethodResult(
                method=self.name,
                range=Range(low=0, base=0, high=0),
                weight=0.0,
                confidence=0.0,
                steps=trail.steps,
                citations=trail.all_citations(),
                summary="No precedent deal data — method excluded.",
            )

        sorted_vals = sorted(multiples)
        p25 = statistics.quantiles(sorted_vals, n=4)[0] if len(sorted_vals) >= 4 else sorted_vals[0]
        median = statistics.median(sorted_vals)
        p75 = statistics.quantiles(sorted_vals, n=4)[2] if len(sorted_vals) >= 4 else sorted_vals[-1]

        trail.record(
            description=f"Parsed {len(multiples)} deal multiples from {source}",
            inputs={"deal_multiples": sorted_vals},
            outputs={"p25": p25, "median": median, "p75": p75, "n_deals": len(multiples)},
            citations=citations,
        )

        illiq_rate, illiq_assumption = compute_illiquidity_discount(
            sector=company.sector,
            ltm_revenue=company.ltm_revenue,
            last_round_date=company.last_round_date,
            as_of=company.as_of,
        )
        discount = 1.0 - illiq_rate

        low = company.ltm_revenue * p25 * discount
        base = company.ltm_revenue * median * discount
        high = company.ltm_revenue * p75 * discount
        low, base, high = sorted([low, base, high])
        rng = Range(low=low, base=base, high=high)

        trail.record(
            description=f"Applied deal multiples to LTM revenue with {illiq_rate:.0%} illiquidity discount",
            inputs={"ltm_revenue": company.ltm_revenue},
            outputs={"low": rng.low, "base": rng.base, "high": rng.high},
            assumptions=[illiq_assumption],
        )

        confidence = min(1.0, len(multiples) / 6.0) * (0.9 if source == "octagon" else 0.5)

        return MethodResult(
            method=self.name,
            range=rng,
            weight=0.0,
            confidence=confidence,
            assumptions=trail.all_assumptions(),
            steps=trail.steps,
            citations=trail.all_citations(),
            summary=(
                f"Precedent Txns: {len(multiples)} deals ({source}), "
                f"median={median:.1f}x, range=${rng.low/1e6:,.0f}M–${rng.high/1e6:,.0f}M"
            ),
        )
