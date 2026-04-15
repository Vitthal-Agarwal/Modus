"""Tests for the company research feature.

All endpoint tests use MODUS_FORCE_MOCK=1 so the chain goes straight to mock.
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from modus.api import app
from modus.core.models import Citation, CompanyInput
from modus.data.providers._sector_map import classify_sector
from modus.data.providers.base import ProviderError
from modus.data.providers.mock_provider import MockProvider


@pytest.fixture(autouse=True)
def _force_mock(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("MODUS_FORCE_MOCK", "1")


client = TestClient(app)


class TestSectorClassifier:
    def test_ai_keywords(self):
        assert classify_sector("Artificial Intelligence platform")[0] == "ai_saas"

    def test_fintech_keywords(self):
        assert classify_sector("Payment processing and banking")[0] == "fintech"

    def test_consumer_keywords(self):
        assert classify_sector("Social media and gaming")[0] == "consumer"

    def test_marketplace_keywords(self):
        assert classify_sector("E-commerce marketplace")[0] == "marketplace"

    def test_vertical_saas_keywords(self):
        assert classify_sector("Construction tech platform")[0] == "vertical_saas"

    def test_unknown_defaults_to_ai_saas(self):
        sector, conf = classify_sector("Quantum computing hardware")
        assert sector == "ai_saas"
        assert conf < 0.5

    def test_none_input(self):
        sector, conf = classify_sector(None)
        assert sector == "ai_saas"
        assert conf < 0.5


class TestMockCompanyProfile:
    def test_fixture_match(self):
        mock = MockProvider()
        profile = mock.company_profile("basis")
        assert profile.name == "Basis AI"
        assert profile.ltm_revenue == 10_000_000
        assert profile.confidence == 1.0
        assert len(profile.citations) == 1
        assert profile.citations[0].source == "mock fixture"

    def test_fixture_match_full_name(self):
        mock = MockProvider()
        profile = mock.company_profile("Loft")
        assert "Loft" in profile.name
        assert profile.ltm_revenue == 28_000_000

    def test_fixture_no_match(self):
        mock = MockProvider()
        import pytest
        with pytest.raises(ProviderError):
            mock.company_profile("nonexistent_company_xyz")


class TestResearchEndpoint:
    def test_research_fixture_company(self):
        resp = client.get("/research", params={"q": "basis"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["input"]["name"] == "Basis AI"
        assert data["confidence"] == 1.0
        assert len(data["sources"]) > 0

    def test_research_no_match_returns_defaults(self):
        resp = client.get("/research", params={"q": "nonexistent_company_xyz_12345"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["confidence"] == 0.0
        assert data["provider"] == "none"
        assert data["input"]["name"] == "nonexistent_company_xyz_12345"
        assert len(data["sources"]) == 0

    def test_research_missing_param(self):
        resp = client.get("/research")
        assert resp.status_code == 422

    def test_research_output_valid_company_input(self):
        resp = client.get("/research", params={"q": "trellis"})
        assert resp.status_code == 200
        data = resp.json()
        inp = CompanyInput(**data["input"])
        assert inp.name == "Trellis Capital"
        assert inp.sector == "fintech"


class TestResearchCitationsInAudit:
    def test_citations_appear_in_trail(self):
        citation = Citation(
            source="test",
            field="totalRevenue",
            value=50_000_000,
            as_of=date(2026, 4, 14),
        )
        payload = {
            "name": "Test Co",
            "sector": "ai_saas",
            "ltm_revenue": 50_000_000,
            "revenue_growth": 1.0,
            "ebit_margin": -0.1,
            "research_citations": [citation.model_dump(mode="json")],
        }
        resp = client.post("/audit", json=payload)
        assert resp.status_code == 200
        trail = resp.json()["audit_trail"]
        step_1 = trail[0]
        assert step_1["description"] == "Company profile researched from external sources"
        assert len(step_1["citations"]) == 1
        assert step_1["citations"][0]["source"] == "test"

    def test_no_research_step_without_citations(self):
        payload = {
            "name": "Test Co",
            "sector": "ai_saas",
            "ltm_revenue": 50_000_000,
            "revenue_growth": 1.0,
            "ebit_margin": -0.1,
        }
        resp = client.post("/audit", json=payload)
        assert resp.status_code == 200
        trail = resp.json()["audit_trail"]
        assert trail[0]["description"].startswith("Audit run started")
