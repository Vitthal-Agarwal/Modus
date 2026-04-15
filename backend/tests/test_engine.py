"""End-to-end engine tests against deterministic fixtures."""

from __future__ import annotations

from datetime import date

import pytest

from modus.core.engine import Engine
from modus.data.fixtures_loader import load_companies, load_company
from modus.data.providers.base import ProviderChain
from modus.data.providers.mock_provider import MockProvider


@pytest.fixture
def engine() -> Engine:
    return Engine(ProviderChain([MockProvider()]))


def test_basis_ai_end_to_end(engine: Engine) -> None:
    company = load_company("basis_ai")
    company = company.model_copy(update={"as_of": date(2026, 4, 1)})
    out = engine.run(company)

    assert out.company == "Basis AI"
    assert out.sector == "ai_saas"
    assert out.fair_value.low < out.fair_value.base < out.fair_value.high
    assert out.fair_value.low > 0
    assert len(out.methods) == 3
    assert {m.method for m in out.methods} == {"comps", "dcf", "last_round"}
    # Weights should sum ~1
    assert abs(sum(m.weight for m in out.methods) - 1.0) < 1e-6
    # Audit trail should have many steps
    assert len(out.audit_trail) >= 10
    # Every method step should reference at least one citation or assumption somewhere
    assert out.citations, "expected at least one citation in final output"


def test_all_fixture_companies_run(engine: Engine) -> None:
    companies = load_companies()
    assert set(companies) == {"basis_ai", "loft_saas", "trellis_fintech"}
    for key, company in companies.items():
        company = company.model_copy(update={"as_of": date(2026, 4, 1)})
        out = engine.run(company)
        assert out.fair_value.base > 0, f"{key} produced zero base value"


def test_range_monotonic_per_method(engine: Engine) -> None:
    company = load_company("basis_ai").model_copy(update={"as_of": date(2026, 4, 1)})
    out = engine.run(company)
    for m in out.methods:
        assert m.range.low <= m.range.base <= m.range.high, f"{m.method} non-monotonic"
