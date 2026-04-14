"""yfinance provider — peer multiples and sector-index returns from Yahoo Finance.

This is a best-effort provider. On any failure (network, rate limit, unknown
ticker, Pydantic schema drift), it raises so the chain falls back to the next
provider. Live data is cached via diskcache for reproducibility in demos.
"""

from __future__ import annotations

import logging
import os
from datetime import date

from modus.core.models import Citation
from modus.data.cache import get_or_compute
from modus.data.providers.base import IndexReturn, PeerMultiples, ProviderError, RiskFreeRate

log = logging.getLogger(__name__)


def _should_skip() -> bool:
    return os.environ.get("MODUS_FORCE_MOCK") == "1"


class YFinanceProvider:
    name = "yfinance"

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        if _should_skip():
            raise ProviderError("MODUS_FORCE_MOCK=1")
        import yfinance as yf  # lazy import: network-less tests never touch yfinance

        out: list[PeerMultiples] = []
        today = date.today()
        for t in tickers:
            def _fetch(t: str = t) -> dict:
                ticker = yf.Ticker(t)
                info = ticker.info or {}
                return {
                    "ev_revenue": info.get("enterpriseToRevenue"),
                    "ev_ebitda": info.get("enterpriseToEbitda"),
                    "pe": info.get("trailingPE") or info.get("forwardPE"),
                }

            try:
                data = get_or_compute("yfinance_info", t, today, _fetch)
            except Exception as e:  # noqa: BLE001
                log.warning("yfinance fetch failed for %s: %s", t, e)
                continue
            if data.get("ev_revenue") is None:
                continue
            out.append(
                PeerMultiples(
                    ticker=t,
                    ev_revenue=float(data["ev_revenue"]),
                    ev_ebitda=float(data["ev_ebitda"]) if data.get("ev_ebitda") else None,
                    pe=float(data["pe"]) if data.get("pe") else None,
                    citation=Citation(
                        source="yfinance",
                        field=f"{t} multiples",
                        value=f"EV/Rev={data['ev_revenue']}",
                        as_of=today,
                        url=f"https://finance.yahoo.com/quote/{t}",
                    ),
                )
            )
        if not out:
            raise ProviderError("yfinance returned no usable peer data")
        return out

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        if _should_skip():
            raise ProviderError("MODUS_FORCE_MOCK=1")
        import yfinance as yf

        def _fetch() -> float:
            hist = yf.Ticker(ticker).history(start=start.isoformat(), end=end.isoformat())
            if hist.empty:
                raise ProviderError(f"no history for {ticker} {start}..{end}")
            first = float(hist["Close"].iloc[0])
            last = float(hist["Close"].iloc[-1])
            return (last - first) / first

        total = get_or_compute("yfinance_index", f"{ticker}:{start}:{end}", end, _fetch)
        return IndexReturn(
            ticker=ticker,
            start_date=start,
            end_date=end,
            total_return=total,
            citation=Citation(
                source="yfinance",
                field=f"{ticker} total return",
                value=round(total, 4),
                as_of=end,
                url=f"https://finance.yahoo.com/quote/{ticker}/history",
            ),
        )

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        # yfinance does not serve the 10Y UST cleanly — defer to FRED / mock.
        raise ProviderError("risk_free_rate not supported by yfinance provider")
