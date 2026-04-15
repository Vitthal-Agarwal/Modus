"""Octagon provider — peer multiples via the intelligent `octagon-agent` router.

Octagon exposes 13 specialized data-dump agents plus `octagon-agent`, a router
that reasons over all of them (financials, stock-data, deals, companies,
web-search, …). Empirically the specialized agents return raw database rows
for an entity match, while the router actually computes and explains the
requested metric — it's the only agent that can answer "EV/Revenue multiple"
directly. So we always call `octagon-agent`, with a query crafted to nudge
it away from the stock-data path (which would return a price JSON instead
of a ratio).

This provider's unique value is that the router handles **private companies
by name** — something neither yfinance nor Firecrawl can do well. It also
works for public tickers as a cross-source sanity check against yfinance.

We also expose `target_implied_multiple(name)` as a public helper — not part
of the Provider protocol — for cross-checking a private target company's
last-round implied valuation against the user's audit input. The engine
doesn't call it yet; it's documented capability a future report method can
lean on.

API shape (https://docs.octagonai.co):
    POST https://api.octagonai.co/v1/responses
    Authorization: Bearer <OCTAGON_API_KEY>
    {"model": "octagon-agent", "instructions": "...", "input": "..."}
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import date

import requests

from modus.core.models import Citation
from modus.data.cache import get_or_compute
from modus.data.providers import _env  # noqa: F401 — side-effect: load backend/.env
from modus.data.providers._parsing import parse_ev_revenue_multiple
from modus.data.providers.base import (
    CompanyProfile,
    IndexReturn,
    PeerMultiples,
    ProviderError,
    RiskFreeRate,
)

log = logging.getLogger(__name__)

_API_URL = "https://api.octagonai.co/v1/responses"
_TIMEOUT = 120  # router fans out to sub-agents + web search; don't throttle it
_MODEL = "octagon-agent"

_INSTRUCTIONS = (
    "You are a valuation-comps research agent. The user will ask for a "
    "company's EV/Revenue (Enterprise Value to Revenue) multiple. You MUST "
    "answer with EXACTLY one numeric ratio in the form 'EV/Revenue: N.Nx'. "
    "Do NOT return stock price JSON. Do NOT return raw database records. "
    "If the company is public, use EV/Sales or evToSales from its latest "
    "fiscal year. If the company is private, compute it from the latest "
    "disclosed valuation and revenue/ARR. Always cite the source inline."
)


@dataclass(frozen=True)
class _AgentReply:
    text: str
    annotations: list[dict]  # [{"name": str, "url": str, ...}]


def _should_skip() -> bool:
    return os.environ.get("MODUS_FORCE_MOCK") == "1"


def _extract_reply(payload: dict) -> _AgentReply:
    """Pull assistant text + annotations out of Octagon's /v1/responses envelope."""
    annotations: list[dict] = []
    if isinstance(payload.get("output_text"), str):
        return _AgentReply(text=payload["output_text"], annotations=annotations)

    output = payload.get("output")
    if isinstance(output, list):
        chunks: list[str] = []
        for item in output:
            content = item.get("content") if isinstance(item, dict) else None
            if isinstance(content, list):
                for c in content:
                    if not isinstance(c, dict):
                        continue
                    if isinstance(c.get("text"), str):
                        chunks.append(c["text"])
                    ann = c.get("annotations")
                    if isinstance(ann, list):
                        annotations.extend(a for a in ann if isinstance(a, dict))
            elif isinstance(content, str):
                chunks.append(content)
        if chunks:
            return _AgentReply(text="\n".join(chunks), annotations=annotations)

    return _AgentReply(text=str(payload), annotations=annotations)


def _primary_annotation_url(anns: list[dict]) -> str | None:
    for a in anns:
        url = a.get("url")
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            return url
    return None


def _annotations_summary(anns: list[dict], limit: int = 3) -> str:
    parts: list[str] = []
    for a in anns[:limit]:
        name = a.get("name") or a.get("title") or ""
        url = a.get("url") or ""
        if name or url:
            parts.append(f"{name} {url}".strip())
    return "; ".join(parts)


def _build_peer_query(entity: str) -> str:
    """Craft a query that forces the router to compute EV/Revenue rather than
    route to stock-data-agent (which dumps a price JSON).
    """
    return (
        f"What is the current EV/Revenue (Enterprise Value to Revenue) "
        f"valuation multiple for {entity}? Return EXACTLY one numeric ratio "
        f"in the form 'EV/Revenue: N.Nx'. Use financial statements and "
        f"enterprise value, not the raw stock price. Cite the source."
    )


class OctagonProvider:
    name = "octagon"

    def __init__(self) -> None:
        self._api_key = os.environ.get("OCTAGON_API_KEY")

    def _require_key(self) -> str:
        if _should_skip():
            raise ProviderError("MODUS_FORCE_MOCK=1")
        if not self._api_key:
            raise ProviderError("OCTAGON_API_KEY not set")
        return self._api_key

    def _ask(self, question: str) -> _AgentReply:
        key = self._require_key()
        try:
            resp = requests.post(
                _API_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _MODEL,
                    "instructions": _INSTRUCTIONS,
                    "input": question,
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            raise ProviderError(f"octagon request failed: {e}") from e
        return _extract_reply(resp.json())

    def _lookup(self, entity: str) -> dict | None:
        reply = self._ask(_build_peer_query(entity))
        val = parse_ev_revenue_multiple(reply.text)
        if val is None:
            return None
        return {
            "ev_revenue": val,
            "text": reply.text,
            "annotations": reply.annotations,
        }

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        """Fetch EV/Revenue multiples for a list of tickers or company names.

        Callers can pass plain tickers (SNOW, DDOG) or full names for private
        companies (Stripe, OpenAI) — the router handles both.
        """
        self._require_key()
        today = date.today()
        out: list[PeerMultiples] = []
        for t in tickers:
            try:
                data = get_or_compute(
                    "octagon_peer", t, today, lambda t=t: self._lookup(t)
                )
            except Exception as e:
                log.warning("octagon fetch failed for %s: %s", t, e)
                continue
            if not data:
                continue
            anns = data.get("annotations") or []
            citation_url = _primary_annotation_url(anns) or (
                "https://octagonai.co/private-market-intelligence/"
            )
            snippet = (data.get("text") or "")[:240].replace("\n", " ")
            ann_summary = _annotations_summary(anns)
            note = f"octagon-agent: {snippet}"
            if ann_summary:
                note = f"{note} | sources: {ann_summary}"
            out.append(
                PeerMultiples(
                    ticker=t,
                    ev_revenue=float(data["ev_revenue"]),
                    ev_ebitda=None,
                    pe=None,
                    citation=Citation(
                        source="octagon (agent router)",
                        field=f"{t} EV/Revenue",
                        value=f"EV/Rev={data['ev_revenue']}",
                        as_of=today,
                        url=citation_url,
                        note=note,
                    ),
                )
            )
        if not out:
            raise ProviderError("octagon returned no parseable peer data")
        return out

    def target_implied_multiple(self, company_name: str) -> PeerMultiples | None:
        """Cross-check helper for private-target audits.

        Not part of the Provider protocol — this is a direct utility the
        audit report can call to ask "what EV/Revenue did the last round
        imply for <private target>?" and surface it next to the comps-driven
        number. Returns None if Octagon can't compute a multiple.
        """
        self._require_key()
        data = self._lookup(company_name)
        if not data:
            return None
        anns = data.get("annotations") or []
        return PeerMultiples(
            ticker=company_name,
            ev_revenue=float(data["ev_revenue"]),
            ev_ebitda=None,
            pe=None,
            citation=Citation(
                source="octagon (agent router, target cross-check)",
                field=f"{company_name} last-round EV/Revenue",
                value=f"EV/Rev={data['ev_revenue']}",
                as_of=date.today(),
                url=_primary_annotation_url(anns)
                or "https://octagonai.co/private-market-intelligence/",
                note=(data.get("text") or "")[:240].replace("\n", " "),
            ),
        )

    def company_profile(self, query: str) -> CompanyProfile:
        self._require_key()
        today = date.today()

        def _fetch() -> dict | None:
            question = (
                f"Give me the following financial data for {query}. Use web "
                f"search and all available agents. Answer EXACTLY in this format, "
                f"one field per line, nothing else:\n"
                f"Revenue: $XB or $XM\n"
                f"Revenue Growth: X%\n"
                f"EBIT Margin: X%\n"
                f"Last Funding Valuation: $XB post-money\n"
                f"Sector: one word\n"
                f"If a field is unknown, write 'Unknown'. Cite sources."
            )
            reply = self._ask(question)
            return {
                "text": reply.text,
                "annotations": reply.annotations,
            }

        data = get_or_compute("octagon_profile", query.lower().strip(), today, _fetch)
        if not data or not data.get("text"):
            raise ProviderError(f"octagon: no profile for '{query}'")

        text = data["text"]
        anns = data.get("annotations") or []
        ann_url = _primary_annotation_url(anns)
        citations: list[Citation] = []

        revenue = _parse_octagon_dollar(text, "revenue")
        if revenue:
            citations.append(Citation(
                source="octagon (agent router)", field="revenue",
                value=revenue, as_of=today, url=ann_url,
                note=f"parsed from agent response: {text[:200]}",
            ))

        growth = _parse_octagon_pct(text, "revenue growth")
        if growth is None:
            growth = _parse_octagon_pct(text, "growth")
        if growth is not None:
            citations.append(Citation(
                source="octagon (agent router)", field="revenue_growth",
                value=growth, as_of=today, url=ann_url,
            ))

        margin = _parse_octagon_pct(text, "ebit margin")
        if margin is None:
            margin = _parse_octagon_pct(text, "margin")
        if margin is not None:
            citations.append(Citation(
                source="octagon (agent router)", field="ebit_margin",
                value=margin, as_of=today, url=ann_url,
            ))

        last_round = _parse_octagon_dollar(text, "funding valuation")
        if not last_round:
            last_round = _parse_octagon_dollar(text, "valuation")
        if not last_round:
            last_round = _parse_octagon_dollar(text, "valued at")
        if not last_round:
            last_round = _parse_octagon_dollar(text, "post-money")
        if last_round:
            citations.append(Citation(
                source="octagon (agent router)", field="last_round_post_money",
                value=last_round, as_of=today, url=ann_url,
            ))

        sector_hint = ""
        sector_match = re.search(r"sector:\s*(\w[\w\s]*)", text, re.IGNORECASE)
        if sector_match:
            sector_hint = sector_match.group(1).strip()

        filled = sum(1 for v in [revenue, growth, margin, last_round] if v is not None)
        if filled == 0:
            raise ProviderError(f"octagon profile for '{query}' yielded no parseable data")
        confidence = 0.25 + 0.15 * filled

        return CompanyProfile(
            name=query,
            ticker=None,
            sector=sector_hint,
            ltm_revenue=revenue,
            revenue_growth=growth,
            ebit_margin=margin,
            last_round_post_money=last_round,
            last_round_date=None,
            description=text[:300].strip(),
            citations=citations,
            confidence=confidence,
        )

    def _ask_with_instructions(self, instructions: str, question: str) -> _AgentReply:
        key = self._require_key()
        try:
            resp = requests.post(
                _API_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _MODEL,
                    "instructions": instructions,
                    "input": question,
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            raise ProviderError(f"octagon request failed: {e}") from e
        return _extract_reply(resp.json())

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        raise ProviderError("index_return not supported by octagon provider")

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        raise ProviderError("risk_free_rate not supported by octagon provider")


_DOLLAR_RE = re.compile(
    r"\$\s*(\d{1,4}(?:\.\d{1,2})?)\s*(billion|million|bn|mn|m|b)\b",
    re.IGNORECASE,
)

_PCT_RE = re.compile(
    r"(-?\d{1,4}(?:\.\d{1,2})?)\s*%",
)


def _parse_octagon_dollar(text: str, anchor: str) -> float | None:
    idx = text.lower().find(anchor.lower())
    if idx == -1:
        return None
    window = text[idx:idx + 120]
    m = _DOLLAR_RE.search(window)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2).lower()
    if unit in ("billion", "bn", "b"):
        val *= 1e9
    else:
        val *= 1e6
    return val if val >= 100_000 else None


def _parse_octagon_pct(text: str, anchor: str) -> float | None:
    idx = text.lower().find(anchor.lower())
    if idx == -1:
        return None
    window = text[idx:idx + 80]
    m = _PCT_RE.search(window)
    if not m:
        return None
    pct = float(m.group(1))
    if -100 <= pct <= 500:
        return pct / 100.0
    return None
