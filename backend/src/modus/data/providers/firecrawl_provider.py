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
from modus.data.providers.base import IndexReturn, PeerMultiples, ProviderError, RiskFreeRate

log = logging.getLogger(__name__)

_API_BASE = "https://api.firecrawl.dev/v2"
_TIMEOUT = 30

# Require an EV/Revenue (or Enterprise Value/Revenue) anchor within ~30 chars of the number.
# Number may come after the phrase ("ev/revenue is 10.9x") or before ("10.9x EV/Revenue").
_EV_PHRASE = r"(?:ev|enterprise\s*value)\s*/\s*(?:revenue|sales)"
_MULTIPLE_RE = re.compile(
    rf"(?:{_EV_PHRASE}[^0-9]{{0,30}}(\d{{1,3}}(?:\.\d{{1,2}})?)\s*x?"
    rf"|(\d{{1,3}}(?:\.\d{{1,2}})?)\s*x?\s*{_EV_PHRASE})",
    re.IGNORECASE,
)


def _should_skip() -> bool:
    return os.environ.get("MODUS_FORCE_MOCK") == "1"


def _parse_multiple(text: str) -> float | None:
    """Find the first plausible EV/Revenue multiple in a blob of text."""
    for m in _MULTIPLE_RE.finditer(text):
        raw = m.group(1) or m.group(2)
        val = float(raw)
        if 0.1 <= val <= 200:  # filter out years, percents, etc.
            return val
    return None


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
            except Exception as e:  # noqa: BLE001
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

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        raise ProviderError("index_return not supported by firecrawl provider")

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        raise ProviderError("risk_free_rate not supported by firecrawl provider")
