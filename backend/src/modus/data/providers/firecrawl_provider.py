"""Firecrawl provider — web fallback for peer multiples when yfinance fails.

Used as a secondary source in the chain (between yfinance and mock): when a
ticker is private, illiquid, or yfinance schema-drifts, we ask Firecrawl to
search the web for the company's EV/Revenue multiple and parse it from the
returned summaries. Any parse/network failure raises ProviderError so the chain
falls back to mock.

Requires FIRECRAWL_API_KEY in the environment.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import date

import requests

from modus.core.models import Citation
from modus.data.cache import get_or_compute
from modus.data.providers import _env  # noqa: F401 — side-effect: load backend/.env
from modus.data.providers._parsing import parse_ev_revenue_multiple as _parse_multiple
from modus.data.providers.base import (
    CompanyProfile,
    IndexReturn,
    PeerMultiples,
    ProviderError,
    RiskFreeRate,
)

log = logging.getLogger(__name__)

_API_BASE = "https://api.firecrawl.dev/v2"
_TIMEOUT = 30

def _should_skip() -> bool:
    return os.environ.get("MODUS_FORCE_MOCK") == "1"


class FirecrawlProvider:
    name = "firecrawl"

    def __init__(self) -> None:
        self._api_key = os.environ.get("FIRECRAWL_API_KEY")

    def _require_key(self) -> str:
        if _should_skip():
            raise ProviderError("MODUS_FORCE_MOCK=1")
        if not self._api_key:
            raise ProviderError("FIRECRAWL_API_KEY not set")
        return self._api_key

    def _search(self, query: str) -> list[dict]:
        key = self._require_key()
        try:
            resp = requests.post(
                f"{_API_BASE}/search",
                headers={"Authorization": f"Bearer {key}"},
                json={"query": query, "limit": 3},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            raise ProviderError(f"firecrawl search failed: {e}") from e
        data = resp.json()
        results = data.get("data", {}).get("web") or data.get("data") or []
        if not isinstance(results, list):
            raise ProviderError(f"unexpected firecrawl payload: {type(results).__name__}")
        return results

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        self._require_key()
        today = date.today()
        out: list[PeerMultiples] = []
        for t in tickers:
            def _fetch(t: str = t) -> dict | None:
                query = f"{t} EV/Revenue multiple latest"
                results = self._search(query)
                for r in results:
                    blob = " ".join(
                        str(r.get(k, "")) for k in ("title", "description", "markdown")
                    )
                    val = _parse_multiple(blob)
                    if val is not None:
                        return {
                            "ev_revenue": val,
                            "source_url": r.get("url", ""),
                            "snippet": (r.get("description") or "")[:200],
                        }
                return None

            try:
                data = get_or_compute("firecrawl_peer", t, today, _fetch)
            except Exception as e:
                log.warning("firecrawl fetch failed for %s: %s", t, e)
                continue
            if not data:
                continue
            out.append(
                PeerMultiples(
                    ticker=t,
                    ev_revenue=float(data["ev_revenue"]),
                    ev_ebitda=None,
                    pe=None,
                    citation=Citation(
                        source="firecrawl (web search)",
                        field=f"{t} EV/Revenue",
                        value=f"EV/Rev={data['ev_revenue']}",
                        as_of=today,
                        url=data.get("source_url") or None,
                        note=f"parsed from: {data.get('snippet', '')}",
                    ),
                )
            )
        if not out:
            raise ProviderError("firecrawl returned no parseable peer data")
        return out

    def company_profile(self, query: str) -> CompanyProfile:
        self._require_key()
        today = date.today()

        def _fetch() -> dict | None:
            results = self._search(f"{query} revenue funding round valuation")
            blob = ""
            source_url = ""
            for r in results:
                blob += " ".join(str(r.get(k, "")) for k in ("title", "description", "markdown")) + " "
                if not source_url:
                    source_url = r.get("url", "")
            if not blob.strip():
                return None
            return {"text": blob, "url": source_url}

        data = get_or_compute("firecrawl_profile", query.lower().strip(), today, _fetch)
        if not data or not data.get("text"):
            raise ProviderError(f"firecrawl: no profile results for '{query}'")

        text = data["text"]
        source_url = data.get("url", "")
        citations: list[Citation] = []

        revenue = _parse_dollar_amount(text, ["revenue", "arr", "annual recurring"])
        if revenue:
            citations.append(Citation(
                source="firecrawl (web search)", field="revenue",
                value=revenue, as_of=today, url=source_url,
                note="parsed from web search results",
            ))

        last_round = _parse_dollar_amount(text, ["valuation", "valued at", "post-money", "funding round"])
        if last_round:
            citations.append(Citation(
                source="firecrawl (web search)", field="last_round_valuation",
                value=last_round, as_of=today, url=source_url,
                note="parsed from web search results",
            ))

        growth = _parse_growth(text)
        if growth is not None:
            citations.append(Citation(
                source="firecrawl (web search)", field="revenue_growth",
                value=growth, as_of=today, url=source_url,
            ))

        sector_raw = _extract_sector_hint(text)

        filled = sum(1 for v in [revenue, last_round, growth] if v is not None)
        confidence = 0.15 + 0.15 * filled

        return CompanyProfile(
            name=query,
            ticker=None,
            sector=sector_raw,
            ltm_revenue=revenue,
            revenue_growth=growth,
            ebit_margin=None,
            last_round_post_money=last_round,
            last_round_date=None,
            description=text[:300].strip(),
            citations=citations,
            confidence=confidence,
        )

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        raise ProviderError("index_return not supported by firecrawl provider")

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        raise ProviderError("risk_free_rate not supported by firecrawl provider")


_DOLLAR_RE = re.compile(
    r"\$\s*(\d{1,4}(?:\.\d{1,2})?)\s*(billion|million|bn|mn|m|b)",
    re.IGNORECASE,
)

_GROWTH_RE = re.compile(
    r"(?:revenue|arr|sales)\s+(?:growth|grew|increased)\s+(?:of\s+|by\s+)?(\d{1,4}(?:\.\d{1,2})?)\s*%",
    re.IGNORECASE,
)


def _parse_dollar_amount(text: str, anchors: list[str]) -> float | None:
    for anchor in anchors:
        idx = text.lower().find(anchor)
        if idx == -1:
            continue
        window = text[max(0, idx - 60):idx + 120]
        for m in _DOLLAR_RE.finditer(window):
            val = float(m.group(1))
            unit = m.group(2).lower()
            if unit in ("billion", "bn", "b"):
                val *= 1e9
            else:
                val *= 1e6
            if val >= 100_000:
                return val
    return None


def _parse_growth(text: str) -> float | None:
    m = _GROWTH_RE.search(text)
    if m:
        pct = float(m.group(1))
        if 1 <= pct <= 500:
            return pct / 100.0
    return None


def _extract_sector_hint(text: str) -> str:
    lower = text.lower()
    for kw in ["fintech", "ai", "saas", "marketplace", "e-commerce",
               "consumer", "healthcare", "payments", "crypto", "blockchain"]:
        if kw in lower:
            return kw
    return ""
