"""Octagon provider — response unwrapping, no-key behavior, chain wiring.

Network-free unit tests cover the response envelope parser and the absent-key
path. The regex parser itself is covered in test_firecrawl_provider.py since
both providers share `_parsing.parse_ev_revenue_multiple`.
"""

from __future__ import annotations

import os
from datetime import date

import pytest

from modus.data.providers.base import ProviderError
from modus.data.providers.chain_builder import build_default_chain
from modus.data.providers.octagon_provider import (
    OctagonProvider,
    _annotations_summary,
    _build_peer_query,
    _extract_reply,
    _primary_annotation_url,
)


def test_extract_reply_output_text_field() -> None:
    reply = _extract_reply({"output_text": "EV/Revenue: 8.4x"})
    assert reply.text == "EV/Revenue: 8.4x"
    assert reply.annotations == []


def test_extract_reply_responses_api_shape_with_annotations() -> None:
    payload = {
        "output": [
            {
                "content": [
                    {
                        "type": "text",
                        "text": "EV/Revenue: 12.1x per Q3 deals",
                        "annotations": [
                            {"name": "Snowflake 10-K", "url": "https://sec.gov/xyz"},
                            {"name": "PR Newswire", "url": "https://prnewswire.com/abc"},
                        ],
                    }
                ]
            }
        ]
    }
    reply = _extract_reply(payload)
    assert "12.1x" in reply.text
    assert len(reply.annotations) == 2
    assert _primary_annotation_url(reply.annotations) == "https://sec.gov/xyz"
    assert "Snowflake 10-K" in _annotations_summary(reply.annotations)


def test_extract_reply_fallback_stringifies() -> None:
    # Unknown shape must not raise — the regex still runs against the stringified blob.
    reply = _extract_reply({"weird": {"nested": "EV/Revenue of 7.5x somewhere"}})
    assert "7.5x" in reply.text


def test_primary_annotation_url_skips_non_http() -> None:
    anns = [{"name": "x", "url": "not-a-url"}, {"name": "y", "url": "https://ok.com"}]
    assert _primary_annotation_url(anns) == "https://ok.com"


def test_peer_query_contains_ev_revenue() -> None:
    q = _build_peer_query("Stripe")
    assert "EV/Revenue" in q
    assert "Stripe" in q


def test_octagon_without_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OCTAGON_API_KEY", raising=False)
    p = OctagonProvider()
    with pytest.raises(ProviderError, match="OCTAGON_API_KEY"):
        p.peer_multiples(["SNOW"])


def test_octagon_index_and_rate_unsupported() -> None:
    p = OctagonProvider()
    with pytest.raises(ProviderError):
        p.index_return("SPY", date(2025, 1, 1), date(2026, 1, 1))
    with pytest.raises(ProviderError):
        p.risk_free_rate(date(2026, 4, 1))


def test_force_mock_env_blocks_octagon(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCTAGON_API_KEY", "fake-key-will-not-be-used")
    monkeypatch.setenv("MODUS_FORCE_MOCK", "1")
    p = OctagonProvider()
    with pytest.raises(ProviderError, match="MODUS_FORCE_MOCK"):
        p.peer_multiples(["SNOW"])


def test_default_chain_order_includes_octagon() -> None:
    chain = build_default_chain()
    names = [p.name for p in chain.providers]
    assert names == ["yfinance", "fred", "octagon", "firecrawl", "mock"]


@pytest.mark.live
def test_octagon_live_snow() -> None:
    if not os.environ.get("OCTAGON_API_KEY"):
        pytest.skip("OCTAGON_API_KEY not set")
    p = OctagonProvider()
    out = p.peer_multiples(["SNOW"])
    assert out
    assert 0.5 < out[0].ev_revenue < 200.0
