"""Deterministic mock provider. Always succeeds; honest about being mocked."""

from __future__ import annotations

import json
from datetime import date
from importlib import resources
from pathlib import Path

from modus.core.models import Citation
from modus.data.providers.base import CompanyProfile, IndexReturn, PeerMultiples, RiskFreeRate

_MOCK_AS_OF = date(2026, 4, 1)


def _load_json(name: str) -> dict:
    pkg = resources.files("modus.data.fixtures")
    fp = pkg / name
    return json.loads(Path(str(fp)).read_text())


class MockProvider:
    """Reads deterministic fixtures from `modus/data/fixtures/*.json`."""

    name = "mock"

    def __init__(self) -> None:
        self._peers = _load_json("peer_multiples.json")
        self._index = _load_json("index_returns.json")

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        out: list[PeerMultiples] = []
        for t in tickers:
            if t not in self._peers:
                continue
            row = self._peers[t]
            out.append(
                PeerMultiples(
                    ticker=t,
                    ev_revenue=float(row["ev_revenue"]),
                    ev_ebitda=float(row["ev_ebitda"]) if row.get("ev_ebitda") is not None else None,
                    pe=float(row["pe"]) if row.get("pe") is not None else None,
                    citation=Citation(
                        source="mock fixture",
                        field=f"{t} multiples",
                        value=f"EV/Rev={row['ev_revenue']}",
                        as_of=_MOCK_AS_OF,
                        note="deterministic fixture — not live market data",
                    ),
                )
            )
        return out

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        # Fixture stores annualized total return by ticker; synthesize a period return.
        annual = float(self._index.get(ticker, {"annual_return": 0.08})["annual_return"])
        years = max((end - start).days / 365.25, 0.0)
        total = (1.0 + annual) ** years - 1.0
        return IndexReturn(
            ticker=ticker,
            start_date=start,
            end_date=end,
            total_return=total,
            citation=Citation(
                source="mock fixture",
                field=f"{ticker} total return",
                value=round(total, 4),
                as_of=end,
                note=f"synthesized from fixture annual_return={annual}",
            ),
        )

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        return RiskFreeRate(
            rate=0.042,
            as_of=as_of,
            citation=Citation(
                source="mock fixture",
                field="10Y UST",
                value=0.042,
                as_of=as_of,
                note="deterministic fixture — not live FRED data",
            ),
        )

    def company_profile(self, query: str) -> CompanyProfile:
        q = query.lower().strip()
        companies = _load_json("companies.json")
        for key, c in companies.items():
            if q in c.get("name", "").lower() or q == key:
                return CompanyProfile(
                    name=c["name"],
                    ticker=None,
                    sector=c.get("sector"),
                    ltm_revenue=c.get("ltm_revenue"),
                    revenue_growth=c.get("revenue_growth"),
                    ebit_margin=c.get("ebit_margin"),
                    last_round_post_money=c.get("last_round_post_money"),
                    last_round_date=date.fromisoformat(c["last_round_date"]) if c.get("last_round_date") else None,
                    description=f"Mock fixture: {c['name']}",
                    citations=[Citation(
                        source="mock fixture",
                        field="company_profile",
                        value=c["name"],
                        as_of=_MOCK_AS_OF,
                        note="deterministic fixture — not live research",
                    )],
                    confidence=1.0,
                )
        from modus.data.providers.base import ProviderError
        raise ProviderError(f"mock: no fixture company matching '{query}'")
