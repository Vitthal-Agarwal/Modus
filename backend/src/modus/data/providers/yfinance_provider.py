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
from modus.data.providers.base import (
    CompanyProfile,
    IndexReturn,
    PeerMultiples,
    ProviderError,
    RiskFreeRate,
)

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
            except Exception as e:
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
        raise ProviderError("risk_free_rate not supported by yfinance provider")

    def company_profile(self, query: str) -> CompanyProfile:
        if _should_skip():
            raise ProviderError("MODUS_FORCE_MOCK=1")
        import yfinance as yf

        today = date.today()

        def _fetch() -> dict:
            results = yf.Search(query)
            quotes = getattr(results, "quotes", None) or []
            if not quotes:
                raise ProviderError(f"no yfinance search results for '{query}'")
            ticker_sym = quotes[0].get("symbol")
            if not ticker_sym:
                raise ProviderError(f"no ticker in search results for '{query}'")
            info = yf.Ticker(ticker_sym).info or {}
            return {"ticker": ticker_sym, **info}

        data = get_or_compute("yfinance_profile", query.lower().strip(), today, _fetch)

        ticker = data.get("ticker")
        if not ticker:
            raise ProviderError("yfinance profile: no ticker resolved")

        url = f"https://finance.yahoo.com/quote/{ticker}"
        citations: list[Citation] = []

        ltm_revenue = data.get("totalRevenue")
        if ltm_revenue is not None:
            citations.append(Citation(
                source="yfinance", field="totalRevenue",
                value=ltm_revenue, as_of=today, url=url,
            ))

        growth = data.get("revenueGrowth")
        if growth is not None:
            citations.append(Citation(
                source="yfinance", field="revenueGrowth",
                value=growth, as_of=today, url=url,
            ))

        margin = data.get("ebitMargins") or data.get("operatingMargins")
        margin_field = "ebitMargins" if data.get("ebitMargins") is not None else "operatingMargins"
        if margin is not None:
            citations.append(Citation(
                source="yfinance", field=margin_field,
                value=margin, as_of=today, url=url,
            ))

        raw_sector = data.get("sector") or data.get("industry") or ""
        desc = data.get("longBusinessSummary")

        filled = sum(1 for v in [ltm_revenue, growth, margin] if v is not None)
        if filled == 0:
            raise ProviderError(f"yfinance profile for '{query}' has no usable financial data")
        confidence = 0.3 + 0.2 * filled

        return CompanyProfile(
            name=data.get("longName") or data.get("shortName") or query,
            ticker=ticker,
            sector=raw_sector,
            ltm_revenue=float(ltm_revenue) if ltm_revenue else None,
            revenue_growth=float(growth) if growth else None,
            ebit_margin=float(margin) if margin else None,
            last_round_post_money=None,
            last_round_date=None,
            description=desc,
            citations=citations,
            confidence=confidence,
        )
