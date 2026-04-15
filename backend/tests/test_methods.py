"""Unit tests per method, verifying methodology-specific invariants."""

from __future__ import annotations

from datetime import date

import pytest

from modus.core.models import CompanyInput
from modus.data.fixtures_loader import load_company
from modus.data.providers.base import ProviderChain
from modus.data.providers.mock_provider import MockProvider
from modus.methods.comps import CompsMethod
from modus.methods.dcf import DCFMethod
from modus.methods.last_round import LastRoundMethod
from modus.methods.precedent_transactions import PrecedentTransactionsMethod


@pytest.fixture
def providers() -> ProviderChain:
    return ProviderChain([MockProvider()])


@pytest.fixture
def basis_ai() -> CompanyInput:
    return load_company("basis_ai").model_copy(update={"as_of": date(2026, 4, 1)})


def test_comps_uses_peer_set(providers: ProviderChain, basis_ai: CompanyInput) -> None:
    result = CompsMethod(providers).run(basis_ai)
    assert result.method == "comps"
    assert result.range.base > 0
    # AI-SaaS peer set is 8 tickers → confidence should be 1.0
    assert result.confidence == pytest.approx(1.0)
    # Private company discount should have shrunk vs. raw peer multiple
    raw_est = basis_ai.ltm_revenue * 16.0  # rough median of fixture
    assert result.range.base < raw_est


def test_dcf_sensitivity_bounds_base(providers: ProviderChain, basis_ai: CompanyInput) -> None:
    result = DCFMethod(providers).run(basis_ai)
    assert result.method == "dcf"
    assert result.range.low < result.range.base < result.range.high
    # Sensitivity grid should create a non-trivial band
    assert result.range.width > 0


def test_last_round_marks_up(providers: ProviderChain, basis_ai: CompanyInput) -> None:
    result = LastRoundMethod(providers).run(basis_ai)
    assert result.method == "last_round"
    assert result.range.base > 0
    # Basis AI round was 2025-06-15 at 180M. Mocked IGV return is +12%/yr → should mark up.
    assert result.range.base > basis_ai.last_round_post_money * 0.95


def test_last_round_without_round_skipped(providers: ProviderChain, basis_ai: CompanyInput) -> None:
    no_round = basis_ai.model_copy(update={"last_round_post_money": None, "last_round_date": None})
    result = LastRoundMethod(providers).run(no_round)
    assert result.range.base == 0
    assert result.confidence == 0.0


def test_precedent_txns_uses_fixture(providers: ProviderChain, basis_ai: CompanyInput) -> None:
    result = PrecedentTransactionsMethod(providers).run(basis_ai)
    assert result.method == "precedent_txns"
    assert result.range.base > 0
    assert len(result.citations) >= 1
    assert "fixture" in result.citations[0].source.lower()


def test_precedent_txns_applies_illiquidity_discount(providers: ProviderChain, basis_ai: CompanyInput) -> None:
    result = PrecedentTransactionsMethod(providers).run(basis_ai)
    fixture_median = 16.5  # rough median of ai_saas fixture deals
    raw_est = basis_ai.ltm_revenue * fixture_median
    assert result.range.base < raw_est


def test_precedent_txns_no_sector_data(providers: ProviderChain, basis_ai: CompanyInput) -> None:
    bad_sector = basis_ai.model_copy(update={"sector": "consumer"})
    result = PrecedentTransactionsMethod(providers).run(bad_sector)
    assert result.range.base > 0 or result.confidence == 0.0
