"""Smoke tests for the PDF report renderer."""

from __future__ import annotations

from datetime import date

from modus.audit.pdf_report import render_pdf
from modus.core.engine import Engine
from modus.data.fixtures_loader import load_company
from modus.data.providers.base import ProviderChain
from modus.data.providers.mock_provider import MockProvider


def _run(company_key: str):
    engine = Engine(ProviderChain([MockProvider()]))
    company = load_company(company_key).model_copy(update={"as_of": date(2026, 4, 1)})
    return engine.run(company)


def test_pdf_render_is_non_empty_and_valid_header() -> None:
    output = _run("basis_ai")
    pdf = render_pdf(output)
    assert isinstance(pdf, bytes)
    assert len(pdf) > 2_000, "PDF suspiciously small"
    assert pdf.startswith(b"%PDF-"), "Missing PDF magic header"
    assert pdf.rstrip().endswith(b"%%EOF"), "Missing PDF EOF marker"


def test_pdf_render_all_fixtures() -> None:
    for key in ("basis_ai", "loft_saas", "trellis_fintech"):
        pdf = render_pdf(_run(key))
        assert pdf.startswith(b"%PDF-"), f"{key} PDF invalid"
