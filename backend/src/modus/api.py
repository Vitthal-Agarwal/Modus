"""FastAPI service exposing the engine over HTTP for the Next.js UI."""

from __future__ import annotations

from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from modus import __version__
from modus.core.engine import Engine
from modus.core.models import Citation, CompanyInput, ValuationOutput
from modus.data.fixtures_loader import load_companies, load_company
from modus.data.providers._sector_map import classify_sector
from modus.data.providers.chain_builder import build_default_chain

app = FastAPI(
    title="Modus VC Audit API",
    version=__version__,
    description="Independent VC portfolio valuation audits via Comps, DCF, and Last Round methodologies.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _engine() -> Engine:
    return Engine(build_default_chain())


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get("/companies")
def companies() -> dict[str, dict]:
    """List available fixture companies (for quick-load in the UI)."""
    return {key: c.model_dump(mode="json") for key, c in load_companies().items()}


@app.post("/audit", response_model=ValuationOutput)
def audit(company: CompanyInput) -> ValuationOutput:
    if company.as_of is None:
        company = company.model_copy(update={"as_of": date.today()})
    return _engine().run(company)


class ResearchResponse(BaseModel):
    input: CompanyInput
    sources: list[Citation]
    confidence: float
    provider: str


@app.get("/research", response_model=ResearchResponse)
def research(q: str) -> ResearchResponse:
    """Research a company by name — returns a pre-filled CompanyInput with citations."""
    chain = build_default_chain()
    try:
        profile = chain.company_profile(q)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not research '{q}': {e}") from e

    sector, _ = classify_sector(profile.sector)

    company = CompanyInput(
        name=profile.name,
        sector=sector,
        ltm_revenue=profile.ltm_revenue or 10_000_000,
        revenue_growth=profile.revenue_growth or 0.5,
        ebit_margin=profile.ebit_margin or -0.1,
        last_round_post_money=profile.last_round_post_money,
        last_round_date=profile.last_round_date,
        research_citations=profile.citations,
    )
    return ResearchResponse(
        input=company,
        sources=profile.citations,
        confidence=profile.confidence,
        provider=profile.citations[0].source if profile.citations else "unknown",
    )


@app.post("/audit/fixture/{key}", response_model=ValuationOutput)
def audit_fixture(key: str) -> ValuationOutput:
    try:
        company = load_company(key).model_copy(update={"as_of": date.today()})
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return _engine().run(company)
