"""Firecrawl provider — parser unit tests and chain wiring.

Network-free: we unit-test the multiple parser and verify the provider
raises ProviderError cleanly when no API key is set. A live integration
test is marked with the `live` marker and excluded from the default run.
"""

from __future__ import annotations

import os
from datetime import date

import pytest

from modus.data.providers._parsing import parse_ev_revenue_multiple as _parse_multiple
from modus.data.providers.base import ProviderError
from modus.data.providers.chain_builder import build_default_chain
from modus.data.providers.firecrawl_provider import FirecrawlProvider


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("EV/Revenue of 8.2x as of Q3", 8.2),
        ("Enterprise Value/Revenue, 10.43, 12.51", 10.43),
        ("12.4x EV/Sales trailing", 12.4),
        ("ev / revenue is 9.3x for SNOW", 9.3),
        # Price/Sales must NOT be picked up:
        ("Price/Sales, 11.67, Price/Book 10.44", None),
        # No anchor phrase at all:
        ("Revenue grew 28% year over year", None),
    ],
)
def test_parse_multiple(text: str, expected: float | None) -> None:
    assert _parse_multiple(text) == expected


def test_firecrawl_without_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    p = FirecrawlProvider()
    with pytest.raises(ProviderError, match="FIRECRAWL_API_KEY"):
        p.peer_multiples(["SNOW"])


def test_firecrawl_index_and_rate_unsupported() -> None:
    p = FirecrawlProvider()
    with pytest.raises(ProviderError):
        p.index_return("SPY", date(2025, 1, 1), date(2026, 1, 1))
    with pytest.raises(ProviderError):
        p.risk_free_rate(date(2026, 4, 1))


def test_default_chain_includes_firecrawl() -> None:
    chain = build_default_chain()
    names = [p.name for p in chain.providers]
    assert "firecrawl" in names
    # Firecrawl must sit before mock so mock stays as final backstop.
    assert names.index("firecrawl") < names.index("mock")


@pytest.mark.live
def test_firecrawl_live_snow() -> None:
    if not os.environ.get("FIRECRAWL_API_KEY"):
        pytest.skip("FIRECRAWL_API_KEY not set")
    p = FirecrawlProvider()
    out = p.peer_multiples(["SNOW"])
    assert out
    assert out[0].ticker == "SNOW"
    assert 1.0 < out[0].ev_revenue < 100.0
