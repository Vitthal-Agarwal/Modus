"""API-level tests for scenario persistence and portfolio NAV endpoints."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: pytest.fixture, monkeypatch: pytest.MonkeyPatch):
    """TestClient with isolated scenario DB via tmp_path."""
    monkeypatch.setenv("MODUS_CACHE_DIR", str(tmp_path))
    import modus.data.scenario_store as store
    importlib.reload(store)
    from modus.api import app
    return TestClient(app)


@pytest.fixture()
def audit_payload(client: TestClient) -> dict:
    """Run a fixture audit and return the raw JSON dict."""
    r = client.post("/audit/fixture/basis_ai")
    assert r.status_code == 200
    return r.json()


class TestSaveScenarioEndpoint:
    def test_save_returns_201_with_meta(self, client, audit_payload):
        body = {"output": audit_payload, "label": "Q1 2026 draft"}
        r = client.post("/scenarios", json=body)
        assert r.status_code == 201
        meta = r.json()
        assert meta["label"] == "Q1 2026 draft"
        assert meta["company"] == audit_payload["company"]
        assert "id" in meta
        assert "saved_at" in meta

    def test_save_bad_payload_returns_422(self, client):
        r = client.post("/scenarios", json={"output": {"bad": "data"}, "label": "x"})
        assert r.status_code == 422


class TestListScenariosEndpoint:
    def test_list_empty(self, client):
        r = client.get("/scenarios/NonExistent")
        assert r.status_code == 200
        assert r.json()["scenarios"] == []

    def test_list_after_save(self, client, audit_payload):
        client.post("/scenarios", json={"output": audit_payload, "label": "saved"})
        company = audit_payload["company"]
        r = client.get(f"/scenarios/{company}")
        assert r.status_code == 200
        scenarios = r.json()["scenarios"]
        assert len(scenarios) == 1
        assert scenarios[0]["label"] == "saved"


class TestGetScenarioEndpoint:
    def test_get_existing(self, client, audit_payload):
        save_r = client.post("/scenarios", json={"output": audit_payload, "label": "get me"})
        sid = save_r.json()["id"]
        r = client.get(f"/scenarios/id/{sid}")
        assert r.status_code == 200
        data = r.json()
        assert data["company"] == audit_payload["company"]

    def test_get_missing_returns_404(self, client):
        r = client.get("/scenarios/id/99999")
        assert r.status_code == 404


class TestDeleteScenarioEndpoint:
    def test_delete_existing(self, client, audit_payload):
        save_r = client.post("/scenarios", json={"output": audit_payload, "label": "del"})
        sid = save_r.json()["id"]
        r = client.delete(f"/scenarios/id/{sid}")
        assert r.status_code == 204
        # Verify gone
        r2 = client.get(f"/scenarios/id/{sid}")
        assert r2.status_code == 404

    def test_delete_missing_returns_404(self, client):
        r = client.delete("/scenarios/id/99999")
        assert r.status_code == 404


class TestDiffScenariosEndpoint:
    def test_diff_same_output_zero_delta(self, client, audit_payload):
        id_a = client.post("/scenarios", json={"output": audit_payload, "label": "a"}).json()["id"]
        id_b = client.post("/scenarios", json={"output": audit_payload, "label": "b"}).json()["id"]
        r = client.get(f"/scenarios/diff/{id_a}/{id_b}")
        assert r.status_code == 200
        body = r.json()
        assert body["fair_value"]["base_delta"] == pytest.approx(0.0, abs=1e-6)
        assert body["a"]["label"] == "a"
        assert body["b"]["label"] == "b"

    def test_diff_missing_id_returns_404(self, client, audit_payload):
        id_a = client.post("/scenarios", json={"output": audit_payload, "label": "a"}).json()["id"]
        r = client.get(f"/scenarios/diff/{id_a}/99999")
        assert r.status_code == 404


class TestPortfolioNAVEndpoint:
    def test_returns_200_with_all_companies(self, client):
        r = client.get("/portfolio/nav")
        assert r.status_code == 200
        body = r.json()
        assert "total_nav" in body
        assert body["total_nav"] > 0
        assert len(body["companies"]) == 3  # basis_ai, loft_saas, trellis_fintech
        assert all(c["valuation"] is not None for c in body["companies"])

    def test_nav_range_encloses_total(self, client):
        r = client.get("/portfolio/nav")
        body = r.json()
        low = body["nav_range"]["low"]
        high = body["nav_range"]["high"]
        total = body["total_nav"]
        assert low <= total <= high

    def test_by_sector_present(self, client):
        r = client.get("/portfolio/nav")
        body = r.json()
        assert len(body["by_sector"]) >= 1
        for sector_row in body["by_sector"]:
            assert sector_row["nav_base"] > 0
            assert sector_row["company_count"] >= 1

    def test_as_of_is_today(self, client):
        from datetime import date
        r = client.get("/portfolio/nav")
        body = r.json()
        assert body["as_of"] == date.today().isoformat()
