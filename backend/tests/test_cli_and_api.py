"""CLI + API smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient
from typer.testing import CliRunner

from modus.api import app as api_app
from modus.cli import app as cli_app


def test_cli_companies() -> None:
    result = CliRunner().invoke(cli_app, ["companies"])
    assert result.exit_code == 0
    assert "basis_ai" in result.output


def test_cli_audit_fixture(tmp_path) -> None:
    result = CliRunner().invoke(cli_app, ["audit", "--from-fixture", "basis_ai", "--out", str(tmp_path)])
    assert result.exit_code == 0, result.output
    assert (tmp_path / "audit_report.md").exists()
    assert (tmp_path / "audit_report.json").exists()
    md = (tmp_path / "audit_report.md").read_text()
    assert "Basis AI" in md
    assert "Fair value" in md


def test_api_health() -> None:
    client = TestClient(api_app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_api_audit_fixture() -> None:
    client = TestClient(api_app)
    r = client.post("/audit/fixture/basis_ai")
    assert r.status_code == 200
    body = r.json()
    assert body["company"] == "Basis AI"
    assert body["fair_value"]["base"] > 0
    assert len(body["methods"]) == 3


def test_api_audit_not_found() -> None:
    client = TestClient(api_app)
    r = client.post("/audit/fixture/nonexistent")
    assert r.status_code == 404
