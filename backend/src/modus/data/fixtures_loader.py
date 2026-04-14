"""Load demo-company fixtures into `CompanyInput` objects."""

from __future__ import annotations

import json
from datetime import date
from importlib import resources
from pathlib import Path
from typing import cast

from modus.core.models import CompanyInput, Sector


def _read(name: str) -> dict:
    fp = resources.files("modus.data.fixtures") / name
    return json.loads(Path(str(fp)).read_text())


def load_companies() -> dict[str, CompanyInput]:
    raw = _read("companies.json")
    out: dict[str, CompanyInput] = {}
    for key, row in raw.items():
        out[key] = CompanyInput(
            name=row["name"],
            sector=cast(Sector, row["sector"]),
            ltm_revenue=row["ltm_revenue"],
            revenue_growth=row["revenue_growth"],
            ebit_margin=row["ebit_margin"],
            target_ebit_margin=row.get("target_ebit_margin"),
            tax_rate=row.get("tax_rate"),
            capex_pct_revenue=row.get("capex_pct_revenue"),
            wc_pct_revenue=row.get("wc_pct_revenue"),
            last_round_post_money=row.get("last_round_post_money"),
            last_round_date=date.fromisoformat(row["last_round_date"]) if row.get("last_round_date") else None,
            last_round_size=row.get("last_round_size"),
            last_round_investors=row.get("last_round_investors", []),
        )
    return out


def load_company(key: str) -> CompanyInput:
    companies = load_companies()
    if key not in companies:
        raise KeyError(f"Unknown fixture '{key}'. Available: {sorted(companies)}")
    return companies[key]
