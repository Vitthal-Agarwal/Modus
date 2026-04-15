"""Tests for the Claude Agent SDK research provider.

We don't actually spawn Claude in tests — we stub out _run_agent (the async
SDK call) and feed fixed payloads through the same _build_profile code path
that production uses. This verifies the citation-enforcement contract, the
chain-skip behavior for non-company_profile calls, and the env-gating.
"""

from __future__ import annotations

from datetime import date

import pytest

from modus.data import cache
from modus.data.providers import claude_research_provider as crp
from modus.data.providers.base import ProviderError


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear_cache("claude_research_profile")
    yield
    cache.clear_cache("claude_research_profile")


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("MODUS_FORCE_MOCK", raising=False)
    p = crp.ClaudeResearchProvider()
    with pytest.raises(ProviderError, match="ANTHROPIC_API_KEY"):
        p.company_profile("Stripe")


def test_force_mock_short_circuits(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setenv("MODUS_FORCE_MOCK", "1")
    p = crp.ClaudeResearchProvider()
    with pytest.raises(ProviderError, match="MODUS_FORCE_MOCK"):
        p.company_profile("Stripe")


def test_peer_multiples_always_raises():
    p = crp.ClaudeResearchProvider()
    with pytest.raises(ProviderError, match="peer_multiples"):
        p.peer_multiples(["AAPL"])


def test_index_return_always_raises():
    p = crp.ClaudeResearchProvider()
    with pytest.raises(ProviderError, match="index_return"):
        p.index_return("SPY", date(2024, 1, 1), date(2025, 1, 1))


def test_risk_free_rate_always_raises():
    p = crp.ClaudeResearchProvider()
    with pytest.raises(ProviderError, match="risk_free_rate"):
        p.risk_free_rate(date(2025, 1, 1))


def test_fields_without_citations_are_dropped(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("MODUS_FORCE_MOCK", raising=False)

    # Payload: revenue has a good URL, growth is missing URL, margin has a bad URL
    fake_payload = {
        "name": "Acme Co",
        "sector": "ai_saas",
        "ltm_revenue_usd": 50_000_000,
        "ltm_revenue_source_url": "https://crunchbase.com/acme",
        "revenue_growth": 0.8,
        "revenue_growth_source_url": None,
        "ebit_margin": -0.15,
        "ebit_margin_source_url": "not-a-url",
        "last_round_post_money_usd": 400_000_000,
        "last_round_post_money_source_url": "https://techcrunch.com/acme-series-c",
        "last_round_date": "2025-02-01",
        "description": "An AI company",
        "confidence_notes": "Decent sourcing",
    }

    async def _fake_run(q: str) -> dict:
        return fake_payload

    monkeypatch.setattr(crp, "_run_agent", _fake_run)

    p = crp.ClaudeResearchProvider()
    profile = p.company_profile("Acme Co")

    assert profile.ltm_revenue == 50_000_000
    assert profile.revenue_growth is None  # dropped: no URL
    assert profile.ebit_margin is None  # dropped: malformed URL
    assert profile.last_round_post_money == 400_000_000
    assert profile.last_round_date == date(2025, 2, 1)
    assert profile.sector == "ai_saas"

    cited_fields = {c.field for c in profile.citations}
    assert cited_fields == {"ltm_revenue", "last_round_post_money"}
    for c in profile.citations:
        assert c.source == "claude-agent"
        assert c.url and c.url.startswith("https://")


def test_cache_hit_avoids_second_agent_call(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("MODUS_FORCE_MOCK", raising=False)

    calls = {"n": 0}

    async def _fake_run(q: str) -> dict:
        calls["n"] += 1
        return {
            "name": "Beta Inc",
            "sector": "fintech",
            "ltm_revenue_usd": 10_000_000,
            "ltm_revenue_source_url": "https://example.com/beta",
            "confidence_notes": "ok",
        }

    monkeypatch.setattr(crp, "_run_agent", _fake_run)

    p = crp.ClaudeResearchProvider()
    p.company_profile("Beta Inc")
    p.company_profile("Beta Inc")
    assert calls["n"] == 1


def test_empty_payload_raises(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("MODUS_FORCE_MOCK", raising=False)

    async def _fake_run(q: str) -> dict:
        return {}

    monkeypatch.setattr(crp, "_run_agent", _fake_run)

    p = crp.ClaudeResearchProvider()
    with pytest.raises(ProviderError, match="empty payload"):
        p.company_profile("Nothing Co")
