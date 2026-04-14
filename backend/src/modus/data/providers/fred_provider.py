"""FRED provider — 10Y US Treasury yield (series DGS10).

Free API key required at https://fred.stlouisfed.org/docs/api/api_key.html.
Set via `FRED_API_KEY` env var. Without a key this provider immediately
raises `ProviderError` so the chain falls through.
"""

from __future__ import annotations

import os
from datetime import date

import requests

from modus.core.models import Citation
from modus.data.cache import get_or_compute
from modus.data.providers.base import IndexReturn, PeerMultiples, ProviderError, RiskFreeRate


class FredProvider:
    name = "fred"

    def _api_key(self) -> str:
        key = os.environ.get("FRED_API_KEY")
        if not key or os.environ.get("MODUS_FORCE_MOCK") == "1":
            raise ProviderError("FRED_API_KEY not set (or MODUS_FORCE_MOCK=1)")
        return key

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        raise ProviderError("peer_multiples not supported by FRED")

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        raise ProviderError("index_return not supported by FRED")

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        key = self._api_key()

        def _fetch() -> float:
            url = (
                "https://api.stlouisfed.org/fred/series/observations"
                f"?series_id=DGS10&api_key={key}&file_type=json&sort_order=desc&limit=5"
                f"&realtime_end={as_of.isoformat()}"
            )
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            for obs in r.json().get("observations", []):
                if obs.get("value") not in (".", None):
                    return float(obs["value"]) / 100.0
            raise ProviderError("no usable DGS10 observation")

        rate = get_or_compute("fred_dgs10", as_of.isoformat(), as_of, _fetch)
        return RiskFreeRate(
            rate=rate,
            as_of=as_of,
            citation=Citation(
                source="FRED",
                field="10Y UST (DGS10)",
                value=rate,
                as_of=as_of,
                url="https://fred.stlouisfed.org/series/DGS10",
            ),
        )
