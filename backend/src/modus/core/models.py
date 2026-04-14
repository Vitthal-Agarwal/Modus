"""Core Pydantic data models for the Modus VC Audit Tool.

These models define the structured, auditable output that every valuation
method must produce. The guiding principle is **traceability**: every number
carries a citation chain back to its source and every assumption is recorded
with a human-readable rationale.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MethodName = Literal["comps", "dcf", "last_round"]
Sector = Literal["ai_saas", "vertical_saas", "fintech", "marketplace", "consumer"]


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Citation(FrozenModel):
    """A single sourced fact. Every number in the audit trail points back to one of these."""

    source: str  # e.g. "yfinance", "SEC 10-K 2024", "FRED", "mock fixture"
    field: str  # e.g. "EV/Revenue", "10Y UST", "Series C post-money"
    value: float | str
    as_of: date
    url: str | None = None
    note: str | None = None


class Assumption(FrozenModel):
    """An assumption made during valuation, with rationale and (optional) citation."""

    name: str  # e.g. "terminal_growth", "wacc", "peer_size_band"
    value: float | str
    rationale: str
    citation: Citation | None = None


class AuditStep(BaseModel):
    """One step in the audit trail. Append-only; built up as the engine runs."""

    model_config = ConfigDict(extra="forbid")

    step: int
    method: MethodName | Literal["engine"]
    description: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    citations: list[Citation] = Field(default_factory=list)
    assumptions: list[Assumption] = Field(default_factory=list)


class Range(FrozenModel):
    """Low / base / high fair-value triple. Always monotonic."""

    low: float
    base: float
    high: float

    @model_validator(mode="after")
    def _check_monotonic(self) -> Range:
        if not (self.low <= self.base <= self.high):
            raise ValueError(
                f"Range must satisfy low <= base <= high, got {self.low}/{self.base}/{self.high}"
            )
        return self

    @property
    def width(self) -> float:
        return self.high - self.low

    def scale(self, factor: float) -> Range:
        return Range(low=self.low * factor, base=self.base * factor, high=self.high * factor)


class MethodResult(BaseModel):
    """Output of a single valuation method."""

    model_config = ConfigDict(extra="forbid")

    method: MethodName
    range: Range
    weight: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    assumptions: list[Assumption] = Field(default_factory=list)
    steps: list[AuditStep] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    summary: str = ""


class CompanyInput(BaseModel):
    """What the auditor supplies about the portfolio company being valued."""

    model_config = ConfigDict(extra="forbid")

    name: str
    sector: Sector
    ltm_revenue: float = Field(gt=0, description="Last twelve months revenue (USD)")
    revenue_growth: float = Field(description="YoY growth as decimal, e.g. 1.5 = 150%")
    ebit_margin: float = Field(description="Current EBIT margin as decimal, e.g. -0.20")
    # DCF-specific (optional; sector defaults applied if missing)
    target_ebit_margin: float | None = None
    tax_rate: float | None = None
    capex_pct_revenue: float | None = None
    wc_pct_revenue: float | None = None
    # Last round (optional)
    last_round_post_money: float | None = None
    last_round_date: date | None = None
    last_round_size: float | None = None
    last_round_investors: list[str] = Field(default_factory=list)
    # Run config
    methods: list[MethodName] = Field(default_factory=lambda: ["comps", "dcf", "last_round"])
    weights: dict[MethodName, float] | None = None
    as_of: date | None = None


class ValuationOutput(BaseModel):
    """Final audit output: fair-value range, every method result, and the full audit trail."""

    model_config = ConfigDict(extra="forbid")

    company: str
    sector: Sector
    as_of: date
    fair_value: Range
    methods: list[MethodResult]
    audit_trail: list[AuditStep]
    citations: list[Citation]
    summary: str = ""
