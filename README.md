# Modus — VC Audit Tool

An independent fair-value re-estimation tool for VC fund portfolio companies. Modus
lets an auditor reproduce a fund's valuations from three complementary methodologies
— **Comparable Company Analysis**, **Discounted Cash Flow**, and **Last Round
Mark-to-Market** — and ties every output number to a citation chain so the work is
fully traceable.

Built as a 24–48h work-trial take-home. The priority is **code quality, structure,
and auditability**, not precision of the underlying financial model.

---

## What it does

Given a portfolio company (sector, LTM revenue, growth, margin profile, optional
last round terms), Modus:

1. Runs all three methods in parallel, each producing a low/base/high range plus an
   audit trail of the steps it took and the assumptions it made.
2. Blends them into a single fair-value range using confidence-adjusted weights.
3. Emits a `ValuationOutput` where every computed number is tied back to either a
   source citation (live provider or mock fixture) or a named assumption.

You can drive it three ways:

- **CLI** — `uv run modus audit --from-fixture basis_ai` → rich terminal output +
  `audit_report.md` / `audit_report.json` on disk.
- **HTTP API** — `POST /audit` to a FastAPI service, `GET /companies` for fixtures.
- **Web UI** — a Next.js page that loads fixtures, runs the audit, and renders the
  range chart, per-method breakdown, and collapsible audit trail.

---

## Repository layout

```
Modus/
├── backend/          # Python 3.11 + uv + FastAPI + Typer
│   ├── src/modus/
│   │   ├── core/         models, engine, aggregation
│   │   ├── methods/      comps, dcf, last_round (all implement ValuationMethod)
│   │   ├── data/         provider chain + SQLite cache + JSON fixtures
│   │   ├── audit/        append-only audit trail + report renderers
│   │   ├── cli.py        Typer CLI
│   │   └── api.py        FastAPI app
│   └── tests/            pytest, 20 tests, deterministic on mock fallback
└── web/              # Next.js 16 + TypeScript + Tailwind v4 + recharts
    └── src/
        ├── app/          page, api routes (proxy to FastAPI)
        ├── components/   ValuationRangeChart, MethodBreakdown, AuditTrailTimeline
        └── lib/types.ts  TS mirror of the Pydantic models
```

Architecture, methodology, and assumptions are each documented in `docs/`.

---

## Quick start

**Backend**

```bash
cd backend
uv sync
uv run pytest                                  # 20 tests, ~1s
uv run modus companies                         # list fixture companies
uv run modus audit --from-fixture basis_ai     # full audit, writes audit_report.{md,json}
uv run uvicorn modus.api:app --reload          # HTTP API on :8000
```

**Web**

```bash
cd web
npm install
npm run dev        # http://localhost:3000, proxies to :8000
```

**Offline mode** — set `MODUS_FORCE_MOCK=1` (or just unset API keys) to force the
mock provider. The full flow completes with citations honestly labeled `mock`.

---

## Methods (one-paragraph each)

**Comparable Company Analysis.** Pull a sector peer set from fixtures, fetch
EV/Revenue multiples per peer via yfinance (mock fallback), take 25th / 50th / 75th
percentiles, apply to the target's LTM revenue, and discount 25% for private-company
illiquidity. Confidence scales with peer count.

**Discounted Cash Flow.** Project 5yr FCF from revenue × decaying growth × EBIT
margin path → tax → capex% → ΔWC%. Terminal value via Gordon growth. WACC = FRED
10Y UST + sector ERP. Low/base/high come from a WACC×g sensitivity grid (±1pp each).
25% illiquidity discount applied.

**Last Round Mark-to-Market.** Anchor on the most recent post-money, mark-to-market
by the sector index total return (IGV / XLF / XLY proxy) since the round date, widen
±15% for uncertainty. Staleness > 18mo halves the confidence.

**Aggregation.** Default weights Comps 40% / DCF 40% / Last Round 20%, adjusted by
per-method confidence, re-normalized. Blended low/base/high are weighted per-leg.

---

## Traceability model

The core data types (`backend/src/modus/core/models.py`) are built so that **every
number lives inside a Citation chain or is backed by a named Assumption**:

- `Citation` — `source`, `field`, `value`, `as_of`, optional `url`
- `Assumption` — `name`, `value`, `rationale`, optional backing `Citation`
- `AuditStep` — numbered step with `inputs`, `outputs`, citations, assumptions
- `MethodResult` — the range plus its complete list of steps
- `ValuationOutput` — methods blended into a fair-value range, with a flat
  re-numbered audit trail and a deduped citation list

The CLI and web UI both render this structure end-to-end. An auditor can open any
step and see exactly which values flowed in, which flowed out, and where they came
from — including whether a data point was live or mocked.

---

## Design decisions & tradeoffs

- **Methods are plugins** behind a `ValuationMethod` Protocol. Adding a fourth
  method (e.g. precedent transactions) is a new file + register in the engine.
- **Provider chain over hard dependencies.** `ProviderChain` tries each provider in
  order and falls through to a deterministic mock. The demo therefore runs offline,
  and the audit trail is honest about which source answered.
- **SQLite cache keyed on `(provider, key, as_of_date)`** via `diskcache`. A live
  demo yields the same numbers every run and reviewers can re-derive outputs.
- **Range monotonicity is an invariant.** A `Range` Pydantic validator enforces
  `low ≤ base ≤ high`; every place that builds a range sorts first.
- **Private-company illiquidity discount (25%)** applied to Comps and DCF outputs
  (Damodaran convention). Tradeoff: it's a blunt instrument; a mature version would
  tie it to stage and liquidity events.
- **Confidence-adjusted weighting** instead of fixed weights. A stale last round or
  a thin peer set gets down-weighted automatically.
- **Ship end-to-end first, polish later.** Full CLI → engine → report → API → web
  worked on mocks before any real providers were wired in.

---

## Assumptions & data sources

Sector defaults (terminal growth, WACC, margin target, tax, capex%, ΔWC%, default
EV/Rev multiple, sector index proxy) live in `backend/src/modus/assumptions.py` and
are documented in `docs/assumptions.md`.

Live data:

- **yfinance** — peer multiples (`enterpriseToRevenue`, `enterpriseToEbitda`,
  `trailingPE`). No key required.
- **FRED** — 10Y UST (DGS10) as risk-free rate. Free API key optional.
- **Octagon** — private-market comps via the Octagon Agents API (`octagon-agent`
  on `api-gateway.octagonagents.com`). Covers 3M+ private companies, 500K+
  funding rounds, and 2M+ M&A transactions with multiples, which is exactly
  the gap yfinance leaves for private/illiquid targets. Reply text is parsed
  with the same EV/Revenue-anchored regex as Firecrawl, so Price/Sales can't
  masquerade as a multiple. Requires `OCTAGON_API_KEY` (free tier); raises
  cleanly without one.
- **Firecrawl** — web-search fallback for peer multiples when Octagon and
  yfinance both miss (or no Octagon key is set). Hits `POST /v2/search` and
  parses EV/Revenue out of the top hits with the same anchored regex.
  Requires `FIRECRAWL_API_KEY`; raises cleanly without one so the chain falls
  straight to mock.
- **Mock fixtures** — `backend/src/modus/data/fixtures/*.json` — peer multiples for
  ~20 public comps, sector index YTD returns, and 3 demo portfolio companies
  (Basis AI, Loft SaaS, Trellis Fintech).

Every live provider tags its output with a `Citation` so an offline run is visibly
distinct from a live one.

---

## Testing

```bash
cd backend && uv run pytest
```

20 tests covering:

- Core models and Range monotonicity
- Each method's invariants (range sortedness, confidence bounds, skips)
- Engine end-to-end on all 3 fixture companies
- CLI (Typer `CliRunner`) and API (FastAPI `TestClient`)
- Provider chain fallback — an `AlwaysFailsProvider` in front of the mock proves the
  chain recovers cleanly and the output still carries citations

---

## Potential improvements

- **Precedent transactions** as a fourth method (requires a deal database).
- **Stage-aware illiquidity discount** driven by time-to-liquidity rather than a
  flat 25%.
- **SEC EDGAR pull** for 10-K/10-Q financials on public comps (currently using
  yfinance summary fields). The cleanest path is the open-source SEC EDGAR
  MCP server (`stefanoamorelli/sec-edgar-mcp` or `flothjl/edgar-sec`), which
  exposes structured XBRL financial statements for 10K+ public companies with
  no API key required. Integrating it properly means extending the `Provider`
  protocol with a `financial_history()` method so the DCF method can consume
  real multi-year revenue/EBIT/capex/ΔWC line items instead of the current
  assumption-driven path — it's a ~2 hour refactor, not a drop-in, which is
  why it's parked here rather than wired up with Firecrawl and Octagon.
- **PDF report renderer** alongside the markdown/JSON exports.
- **Waterfall visualization** of aggregation contribution per method.
- **Per-method confidence elicitation** from the reviewer at runtime.
- **Scenario persistence** — save `ValuationOutput` runs to SQLite so an auditor
  can diff revaluations quarter-over-quarter.

---

## Docs

- `docs/methodology.md` — formulas and step-by-step for each method
- `docs/architecture.md` — component diagram and data flow
- `docs/assumptions.md` — sector defaults and their sources
- `docs/demo-scenarios.md` — three walkthrough scripts for the live review
