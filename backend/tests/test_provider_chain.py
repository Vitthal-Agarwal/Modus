"""Provider chain fallback tests — force failures and verify mock catches them."""

from __future__ import annotations

from datetime import date

import pytest

from modus.data.providers.base import (
    IndexReturn,
    PeerMultiples,
    ProviderChain,
    ProviderError,
    RiskFreeRate,
)
from modus.data.providers.mock_provider import MockProvider


class AlwaysFailsProvider:
    name = "always_fails"

    def peer_multiples(self, tickers):
        raise ProviderError("intentional failure")

    def index_return(self, ticker, start, end):
        raise ProviderError("intentional failure")

    def risk_free_rate(self, as_of):
        raise ProviderError("intentional failure")


def test_chain_falls_through_to_mock() -> None:
    chain = ProviderChain([AlwaysFailsProvider(), MockProvider()])
    peers = chain.peer_multiples(["PLTR", "SNOW"])
    assert len(peers) == 2
    assert all(isinstance(p, PeerMultiples) for p in peers)
    assert all("mock" in p.citation.source for p in peers)


def test_chain_risk_free_fallback() -> None:
    chain = ProviderChain([AlwaysFailsProvider(), MockProvider()])
    rf = chain.risk_free_rate(date(2026, 4, 1))
    assert isinstance(rf, RiskFreeRate)
    assert rf.rate == 0.042
    assert "mock" in rf.citation.source


def test_chain_index_return_fallback() -> None:
    chain = ProviderChain([AlwaysFailsProvider(), MockProvider()])
    ir = chain.index_return("IGV", date(2025, 1, 1), date(2026, 1, 1))
    assert isinstance(ir, IndexReturn)
    assert ir.total_return > 0


def test_chain_raises_when_all_fail() -> None:
    chain = ProviderChain([AlwaysFailsProvider(), AlwaysFailsProvider()])
    with pytest.raises(ProviderError, match="All providers failed"):
        chain.peer_multiples(["PLTR"])


def test_chain_requires_at_least_one() -> None:
    with pytest.raises(ValueError):
        ProviderChain([])
