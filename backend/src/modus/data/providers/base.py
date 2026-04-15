"""Data provider protocol and chain orchestrator.

A Provider knows how to return a specific set of financial facts. The
`ProviderChain` tries each provider in order and falls back on failure. The
final provider is always `MockProvider` so the pipeline never hard-fails.

Every returned value is a `Citation` (source-tagged), so the audit trail is
always honest about where a number came from — live API or deterministic mock.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol, runtime_checkable

from modus.core.models import Citation

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class CompanyProfile:
    name: str
    ticker: str | None
    sector: str | None
    ltm_revenue: float | None
    revenue_growth: float | None
    ebit_margin: float | None
    last_round_post_money: float | None
    last_round_date: date | None
    description: str | None
    citations: list[Citation]
    confidence: float


@dataclass(frozen=True)
class PeerMultiples:
    ticker: str
    ev_revenue: float
    ev_ebitda: float | None
    pe: float | None
    citation: Citation


@dataclass(frozen=True)
class IndexReturn:
    ticker: str
    start_date: date
    end_date: date
    total_return: float  # decimal, e.g. 0.23 = +23%
    citation: Citation


@dataclass(frozen=True)
class RiskFreeRate:
    rate: float  # decimal, e.g. 0.042
    as_of: date
    citation: Citation


@runtime_checkable
class Provider(Protocol):
    """Protocol every data provider must implement."""

    name: str

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        ...

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        ...

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        ...

    def company_profile(self, query: str) -> CompanyProfile:
        ...


class ProviderError(RuntimeError):
    """Raised by a provider when it cannot serve the request."""


class ProviderChain:
    """Try each provider in order. Final provider must always succeed (mock)."""

    def __init__(self, providers: list[Provider]) -> None:
        if not providers:
            raise ValueError("ProviderChain requires at least one provider")
        self.providers = providers

    def _call(self, method_name: str, *args: Any, **kwargs: Any) -> Any:
        errors: list[str] = []
        for p in self.providers:
            try:
                return getattr(p, method_name)(*args, **kwargs)
            except Exception as e:
                log.warning("provider %s failed %s: %s", p.name, method_name, e)
                errors.append(f"{p.name}: {e}")
        raise ProviderError(
            f"All providers failed for {method_name}: {'; '.join(errors)}"
        )

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        return self._call("peer_multiples", tickers)

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        return self._call("index_return", ticker, start, end)

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        return self._call("risk_free_rate", as_of)

    def company_profile(self, query: str) -> CompanyProfile:
        from modus.data.stream import emit  # late import to avoid cycles

        errors: list[str] = []
        for p in self.providers:
            emit({"type": "provider_try", "provider": p.name})
            try:
                result = p.company_profile(query)
                emit({"type": "provider_hit", "provider": p.name, "confidence": result.confidence})
                return result
            except Exception as e:
                reason = str(e)
                log.warning("provider %s failed company_profile: %s", p.name, reason)
                errors.append(f"{p.name}: {reason}")
                emit({"type": "provider_miss", "provider": p.name, "reason": reason[:120]})
        raise ProviderError(
            f"All providers failed for company_profile: {'; '.join(errors)}"
        )
