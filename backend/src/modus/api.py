"""FastAPI service exposing the engine over HTTP for the Next.js UI."""

from __future__ import annotations

import re
from datetime import date
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


def _clean_query(q: str) -> str:
    """Normalize user input: extract company name from URLs, strip junk."""
    q = q.strip()
    if not q:
        return q
    looks_like_url = bool(re.match(r"^https?://", q, re.IGNORECASE)) or (
        "." in q and " " not in q
    )
    if looks_like_url:
        try:
            parsed = urlparse(q if "://" in q else f"http://{q}")
            host = (parsed.netloc or parsed.path).split("/")[0]
            host = re.sub(r"^www\.", "", host, flags=re.IGNORECASE)
            stem = host.split(".")[0] if "." in host else host
            if stem:
                return re.sub(r"[-_]+", " ", stem).strip().title()
        except Exception:
            pass
    return q

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


@app.get("/cache/stats")
def cache_stats_endpoint() -> dict:
    from modus.data.cache import cache_stats
    return cache_stats()


@app.post("/cache/clear")
def cache_clear_endpoint(provider: str | None = None) -> dict:
    from modus.data.cache import clear_cache
    count = clear_cache(provider)
    return {"cleared": count, "provider": provider or "all"}


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
    cleaned = _clean_query(q)
    chain = build_default_chain()
    try:
        profile = chain.company_profile(cleaned)
    except Exception:
        return ResearchResponse(
            input=CompanyInput(
                name=cleaned,
                sector="ai_saas",
                ltm_revenue=10_000_000,
                revenue_growth=0.5,
                ebit_margin=-0.1,
            ),
            sources=[],
            confidence=0.0,
            provider="none",
        )

    sector, _ = classify_sector(profile.sector)
    today = date.today()

    # Track which critical fields were actually researched vs. defaulted.
    # ltm_revenue, revenue_growth, ebit_margin are the 3 required engine inputs.
    missing: list[str] = []
    citations = list(profile.citations)

    ltm_revenue = profile.ltm_revenue
    if ltm_revenue is None or ltm_revenue <= 0:
        ltm_revenue = 10_000_000
        missing.append("ltm_revenue")
        citations.append(Citation(
            source="default", field="ltm_revenue", value=ltm_revenue,
            as_of=today, note="placeholder — not found in research",
        ))

    revenue_growth = profile.revenue_growth
    if revenue_growth is None:
        revenue_growth = 0.5
        missing.append("revenue_growth")
        citations.append(Citation(
            source="default", field="revenue_growth", value=revenue_growth,
            as_of=today, note="placeholder — not found in research",
        ))

    ebit_margin = profile.ebit_margin
    if ebit_margin is None:
        ebit_margin = -0.1
        missing.append("ebit_margin")
        citations.append(Citation(
            source="default", field="ebit_margin", value=ebit_margin,
            as_of=today, note="placeholder — not found in research",
        ))

    # Hard-cap confidence when critical inputs are missing: each missing
    # required field multiplies confidence by 0.3. If revenue itself was
    # never found, the valuation is essentially guesswork.
    confidence = profile.confidence
    for _ in missing:
        confidence *= 0.3

    company = CompanyInput(
        name=profile.name,
        sector=sector,
        ltm_revenue=ltm_revenue,
        revenue_growth=revenue_growth,
        ebit_margin=ebit_margin,
        last_round_post_money=profile.last_round_post_money,
        last_round_date=profile.last_round_date,
        research_citations=citations,
    )
    return ResearchResponse(
        input=company,
        sources=citations,
        confidence=round(confidence, 3),
        provider=profile.citations[0].source if profile.citations else "unknown",
    )


class ResearchAndAuditResponse(BaseModel):
    research: ResearchResponse
    audit: ValuationOutput


@app.post("/audit/research", response_model=ResearchAndAuditResponse)
def audit_research(q: str) -> ResearchAndAuditResponse:
    """One-click: research a company by name, then immediately run the full audit."""
    chain = build_default_chain()

    try:
        profile = chain.company_profile(q)
    except Exception:
        profile = None

    if profile and profile.ltm_revenue:
        sector, _ = classify_sector(profile.sector)
        company = CompanyInput(
            name=profile.name,
            sector=sector,
            ltm_revenue=profile.ltm_revenue,
            revenue_growth=profile.revenue_growth or 0.5,
            ebit_margin=profile.ebit_margin or -0.1,
            last_round_post_money=profile.last_round_post_money,
            last_round_date=profile.last_round_date,
            research_citations=profile.citations,
            as_of=date.today(),
        )
        research_resp = ResearchResponse(
            input=company,
            sources=profile.citations,
            confidence=profile.confidence,
            provider=profile.citations[0].source if profile.citations else "unknown",
        )
    else:
        company = CompanyInput(
            name=q.strip(),
            sector="ai_saas",
            ltm_revenue=10_000_000,
            revenue_growth=0.5,
            ebit_margin=-0.1,
            as_of=date.today(),
        )
        research_resp = ResearchResponse(
            input=company,
            sources=[],
            confidence=0.0,
            provider="none",
        )

    audit_result = Engine(chain).run(company)
    return ResearchAndAuditResponse(research=research_resp, audit=audit_result)


class ProviderMultiple(BaseModel):
    ticker: str
    ev_revenue: float
    source: str


class CrossCheckResult(BaseModel):
    providers: dict[str, list[ProviderMultiple]]
    tickers: list[str]
    spread: dict[str, dict[str, float]]


@app.post("/cross-check", response_model=CrossCheckResult)
def cross_check(company: CompanyInput) -> CrossCheckResult:
    """Query each provider independently for peer multiples — shows source disagreement."""
    import json
    from importlib import resources
    from pathlib import Path

    fp = resources.files("modus.data.fixtures") / "peer_sets.json"
    peer_sets: dict[str, list[str]] = json.loads(Path(str(fp)).read_text())
    tickers = peer_sets.get(company.sector, [])

    chain = build_default_chain()
    providers_data: dict[str, list[ProviderMultiple]] = {}
    for p in chain.providers:
        try:
            multiples = p.peer_multiples(tickers)
            if multiples:
                providers_data[p.name] = [
                    ProviderMultiple(ticker=m.ticker, ev_revenue=m.ev_revenue, source=p.name)
                    for m in multiples
                ]
        except Exception:
            continue

    spread: dict[str, dict[str, float]] = {}
    for ticker in tickers:
        vals: dict[str, float] = {}
        for pname, mults in providers_data.items():
            for m in mults:
                if m.ticker == ticker:
                    vals[pname] = m.ev_revenue
        if len(vals) >= 2:
            values = list(vals.values())
            vals["_spread"] = max(values) - min(values)
            vals["_mean"] = sum(values) / len(values)
        spread[ticker] = vals

    return CrossCheckResult(providers=providers_data, tickers=tickers, spread=spread)


@app.post("/audit/fixture/{key}", response_model=ValuationOutput)
def audit_fixture(key: str) -> ValuationOutput:
    try:
        company = load_company(key).model_copy(update={"as_of": date.today()})
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return _engine().run(company)
