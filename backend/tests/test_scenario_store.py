"""Unit tests for the scenario persistence store."""

from __future__ import annotations

import importlib
import os
from datetime import date

import pytest

from modus.core.engine import Engine
from modus.data.fixtures_loader import load_company
from modus.data.providers.chain_builder import build_default_chain


@pytest.fixture()
def store(tmp_path: pytest.fixture, monkeypatch: pytest.MonkeyPatch):
    """Reload scenario_store with a temp MODUS_CACHE_DIR so tests are isolated."""
    monkeypatch.setenv("MODUS_CACHE_DIR", str(tmp_path))
    import modus.data.scenario_store as m
    importlib.reload(m)
    return m


@pytest.fixture()
def sample_output(store):
    """Run a mock audit and return a ValuationOutput for basis_ai."""
    company = load_company("basis_ai").model_copy(update={"as_of": date(2026, 4, 1)})
    chain = build_default_chain()
    engine = Engine(chain)
    return engine.run(company)


class TestSaveAndList:
    def test_save_returns_int(self, store, sample_output):
        row_id = store.save_scenario(sample_output, "Q1 draft")
        assert isinstance(row_id, int)
        assert row_id > 0

    def test_list_returns_meta_only(self, store, sample_output):
        row_id = store.save_scenario(sample_output, "Q1 draft")
        rows = store.list_scenarios(sample_output.company)
        assert len(rows) == 1
        row = rows[0]
        assert row["id"] == row_id
        assert row["label"] == "Q1 draft"
        assert row["company"] == sample_output.company
        assert "saved_at" in row
        assert "payload" not in row  # payload must NOT be returned in list

    def test_list_newest_first(self, store, sample_output):
        id1 = store.save_scenario(sample_output, "first")
        id2 = store.save_scenario(sample_output, "second")
        rows = store.list_scenarios(sample_output.company)
        assert rows[0]["id"] == id2
        assert rows[1]["id"] == id1

    def test_list_filters_by_company(self, store, sample_output):
        store.save_scenario(sample_output, "keep")
        rows = store.list_scenarios("NonExistentCompany")
        assert rows == []


class TestGetScenario:
    def test_roundtrip(self, store, sample_output):
        row_id = store.save_scenario(sample_output, "test")
        retrieved = store.get_scenario(row_id)
        assert retrieved is not None
        assert retrieved.company == sample_output.company
        assert retrieved.fair_value.base == pytest.approx(sample_output.fair_value.base, rel=1e-6)
        assert retrieved.fair_value.low == pytest.approx(sample_output.fair_value.low, rel=1e-6)
        assert retrieved.fair_value.high == pytest.approx(sample_output.fair_value.high, rel=1e-6)

    def test_missing_returns_none(self, store):
        assert store.get_scenario(99999) is None


class TestDeleteScenario:
    def test_delete_existing(self, store, sample_output):
        row_id = store.save_scenario(sample_output, "to delete")
        assert store.delete_scenario(row_id) is True
        assert store.get_scenario(row_id) is None

    def test_delete_missing_returns_false(self, store):
        assert store.delete_scenario(99999) is False

    def test_delete_removes_from_list(self, store, sample_output):
        row_id = store.save_scenario(sample_output, "remove me")
        store.delete_scenario(row_id)
        rows = store.list_scenarios(sample_output.company)
        assert all(r["id"] != row_id for r in rows)


class TestDiffScenarios:
    def test_same_output_zero_delta(self, store, sample_output):
        id_a = store.save_scenario(sample_output, "v1")
        id_b = store.save_scenario(sample_output, "v2")
        diff = store.diff_scenarios(id_a, id_b)
        assert diff is not None
        assert diff["fair_value"]["base_delta"] == pytest.approx(0.0, abs=1e-6)
        assert diff["fair_value"]["low_delta"] == pytest.approx(0.0, abs=1e-6)
        assert diff["fair_value"]["high_delta"] == pytest.approx(0.0, abs=1e-6)
        assert len(diff["methods"]) > 0

    def test_meta_present(self, store, sample_output):
        id_a = store.save_scenario(sample_output, "alpha")
        id_b = store.save_scenario(sample_output, "beta")
        diff = store.diff_scenarios(id_a, id_b)
        assert diff["a"]["label"] == "alpha"
        assert diff["b"]["label"] == "beta"

    def test_missing_id_returns_none(self, store, sample_output):
        id_a = store.save_scenario(sample_output, "v1")
        assert store.diff_scenarios(id_a, 99999) is None
        assert store.diff_scenarios(99999, id_a) is None
