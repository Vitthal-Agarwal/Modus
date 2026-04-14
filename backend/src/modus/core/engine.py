"""Engine: runs the configured methods, aggregates results, emits the final output.

Methods are plugins (see `modus.methods.base.ValuationMethod`). The engine
concatenates each method's audit trail into one ordered trail so the final
output is fully reconstructable from the audit log alone.
"""

from __future__ import annotations

from datetime import date

from modus.audit.trail import AuditTrailBuilder
from modus.core.aggregation import blend, resolve_weights
from modus.core.models import (
    AuditStep,
    Citation,
    CompanyInput,
    MethodName,
    MethodResult,
    ValuationOutput,
)
from modus.data.providers.base import ProviderChain
from modus.methods.base import ValuationMethod
from modus.methods.comps import CompsMethod
from modus.methods.dcf import DCFMethod
from modus.methods.last_round import LastRoundMethod


def build_default_methods(providers: ProviderChain) -> dict[MethodName, ValuationMethod]:
    return {
        "comps": CompsMethod(providers),
        "dcf": DCFMethod(providers),
        "last_round": LastRoundMethod(providers),
    }


class Engine:
    def __init__(
        self,
        providers: ProviderChain,
        methods: dict[MethodName, ValuationMethod] | None = None,
    ) -> None:
        self.providers = providers
        self.methods = methods or build_default_methods(providers)

    def run(self, company: CompanyInput) -> ValuationOutput:
        engine_trail = AuditTrailBuilder("engine")
        as_of = company.as_of or date.today()

        if company.research_citations:
            engine_trail.record(
                description="Company profile researched from external sources",
                inputs={"query": company.name},
                outputs={
                    "ltm_revenue": company.ltm_revenue,
                    "revenue_growth": company.revenue_growth,
                    "ebit_margin": company.ebit_margin,
                    "sector": company.sector,
                },
                citations=company.research_citations,
            )

        engine_trail.record(
            description=f"Audit run started for '{company.name}' ({company.sector})",
            inputs=company.model_dump(mode="json", exclude_none=True, exclude={"research_citations"}),
            outputs={"as_of": as_of.isoformat(), "methods": company.methods},
        )

        results: list[MethodResult] = []
        for name in company.methods:
            method = self.methods.get(name)
            if method is None:
                continue
            results.append(method.run(company))

        weights = resolve_weights(results, company.weights)
        weighted_results = [
            r.model_copy(update={"weight": weights.get(r.method, 0.0)}) for r in results
        ]

        fair_value = blend(weighted_results, weights)
        engine_trail.record(
            description="Blended method ranges into final fair-value envelope",
            inputs={"weights": weights},
            outputs={
                "low": fair_value.low,
                "base": fair_value.base,
                "high": fair_value.high,
            },
        )

        # Concatenate audit trail: engine step 1, then each method's steps, then engine wrap-up.
        full_trail: list[AuditStep] = []
        full_trail.extend(engine_trail.steps[:1])
        for r in weighted_results:
            full_trail.extend(r.steps)
        full_trail.extend(engine_trail.steps[1:])
        # Renumber so the step sequence is monotonic 1..N
        full_trail = [s.model_copy(update={"step": i + 1}) for i, s in enumerate(full_trail)]

        all_citations: list[Citation] = list(company.research_citations)
        for r in weighted_results:
            all_citations.extend(r.citations)

        summary_lines = [r.summary for r in weighted_results if r.summary]
        summary_lines.append(
            f"Fair value: ${fair_value.low/1e6:,.0f}M – ${fair_value.high/1e6:,.0f}M "
            f"(base ${fair_value.base/1e6:,.0f}M)"
        )

        return ValuationOutput(
            company=company.name,
            sector=company.sector,
            as_of=as_of,
            fair_value=fair_value,
            methods=weighted_results,
            audit_trail=full_trail,
            citations=all_citations,
            summary="\n".join(summary_lines),
        )
