# Modus — VC Audit Tool

An independent fair-value re-estimation engine for VC fund portfolio companies. Modus lets an auditor reproduce a fund's valuations from **four complementary methodologies** — Comparable Company Analysis, Discounted Cash Flow, Last Round Mark-to-Market, and Precedent Transactions — and ties every output number to a citation chain so the work is fully traceable and reproducible.

> **Determinism guarantee.** With `MODUS_FORCE_MOCK=1` (or no API keys set), Modus produces **byte-identical** `audit_report.json` on every run for a given fixture. Enforced by `tests/test_engine.py::test_mock_run_is_byte_deterministic` so a reviewer can re-derive every number offline.

---

## Features

- **4-method valuation engine** — Comps, DCF, Last Round, and Precedent Transactions running in parallel, blended by confidence-adjusted weights
- **Full audit trail** — every computed number traces back to a `Citation` (live provider or mock fixture) or a named `Assumption`; no magic numbers
- **AI-powered research** — type any company name and get a pre-filled audit form in seconds via a multi-provider research chain (Claude → Octagon → yfinance → Firecrawl → Mock)
- **SSE streaming** — research progress streams to the UI in real time via Server-Sent Events; 5-phase progress indicator updates as each provider responds
- **Stage-aware illiquidity discount** — discount rate scales with LTM revenue and round age instead of applying a flat 25% Damodaran haircut
- **DCF sensitivity grid** — WACC × terminal-growth 5×5 grid rendered as a heatmap in the UI and a markdown table in the exported report
- **Cross-check endpoint** — independently re-queries each provider for peer multiples and surfaces inter-provider disagreement
- **PDF, JSON, and Markdown exports** — `audit_report.{pdf,json,md}` written to disk on every CLI run; download buttons in the web UI
- **SQLite provider cache** — same-day query deduplication with a 24-hour TTL for hits and 10-minute TTL for misses (self-healing on transient failures)
- **Raycast-style dark UI** — command palette (⌘K), keyboard navigation, skeleton loading states, hover animations, and a full aggregation waterfall chart
- **Offline-first** — the full flow works with zero API keys; mock citations are labeled honestly so it's clear which runs are live vs. fixture-based

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web UI (Next.js 16)                   │
│  CompanySearch → ResearchStreamVisualizer → ValuationResults │
│  ValuationRangeChart · WaterfallChart · SensitivityHeatmap   │
│  MethodBreakdown · AuditTrailTimeline · CrossCheckPanel      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / SSE  (localhost:3000 → :8000)
┌────────────────────────▼────────────────────────────────────┐
│                   FastAPI Service (:8000)                     │
│  GET  /health          POST /audit                           │
│  GET  /companies       POST /audit/fixture/:key              │
│  GET  /research        GET  /research/stream  (SSE)          │
│  POST /audit/research  POST /cross-check                     │
│  GET  /cache/stats     POST /cache/clear                     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Valuation Engine                           │
│  ┌─────────┐ ┌─────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │  Comps  │ │ DCF │ │Last Round│ │Precedent Transactions │ │
│  └────┬────┘ └──┬──┘ └────┬─────┘ └──────────┬───────────┘ │
│       └─────────┴─────────┴──────────────────┘             │
│                    Confidence-weighted aggregation            │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Provider Chain                             │
│  Claude → Octagon → yfinance → FRED → Firecrawl → Mock       │
│                  ↕ SQLite cache (diskcache)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository layout

```
Modus/
├── backend/
│   ├── src/modus/
│   │   ├── core/
│   │   │   ├── models.py          # CompanyInput, ValuationOutput, Citation, Assumption, AuditStep
│   │   │   ├── engine.py          # Orchestrates all 4 methods in parallel
│   │   │   └── aggregation.py     # Confidence-adjusted weight blending
│   │   ├── methods/
│   │   │   ├── comps.py           # Comparable Company Analysis
│   │   │   ├── dcf.py             # Discounted Cash Flow (5yr projection + terminal value)
│   │   │   ├── last_round.py      # Last-round mark-to-market with index markup
│   │   │   ├── precedent_transactions.py  # Private deal comps from fixture database
│   │   │   └── _illiquidity.py    # Stage-aware illiquidity discount curve
│   │   ├── data/
│   │   │   ├── providers/
│   │   │   │   ├── base.py                  # Provider protocol + CompanyProfile dataclass
│   │   │   │   ├── chain_builder.py         # Builds the default provider chain
│   │   │   │   ├── claude_research_provider.py  # Claude AI — primary research provider
│   │   │   │   ├── octagon_provider.py      # Private-market comps via Octagon Agents API
│   │   │   │   ├── yfinance_provider.py     # Public company multiples via yfinance
│   │   │   │   ├── fred_provider.py         # Macro rates (10Y UST) via FRED API
│   │   │   │   ├── firecrawl_provider.py    # Web-search fallback via Firecrawl
│   │   │   │   ├── mock_provider.py         # Deterministic fixtures for offline runs
│   │   │   │   └── _sector_map.py           # Keyword → Sector enum classifier
│   │   │   ├── fixtures/                    # JSON fixtures for 3 demo companies + peer sets
│   │   │   ├── cache.py                     # SQLite disk cache (diskcache) with TTL helpers
│   │   │   ├── fixtures_loader.py           # Load/list fixture companies
│   │   │   └── stream.py                    # SSE event callback for research streaming
│   │   ├── audit/
│   │   │   ├── reporter.py        # Markdown + JSON report generation
│   │   │   └── pdf_report.py      # PDF report via reportlab Platypus
│   │   ├── sensitivity.py         # WACC × terminal-growth 5×5 grid
│   │   ├── assumptions.py         # Sector defaults (WACC, growth, margins, etc.)
│   │   ├── cli.py                 # Typer CLI (modus audit / companies / serve)
│   │   └── api.py                 # FastAPI application
│   └── tests/                     # ~70 pytest tests, all pass on MockProvider
├── web/
│   └── src/
│       ├── app/
│       │   ├── page.tsx           # Main Raycast-style UI shell
│       │   └── api/               # Next.js API routes (proxy to FastAPI)
│       ├── components/
│       │   ├── ValuationRangeChart.tsx      # Proportional SVG range bars
│       │   ├── WaterfallChart.tsx           # Method × weight contribution waterfall
│       │   ├── SensitivityHeatmap.tsx       # WACC × terminal-growth DCF grid
│       │   ├── MethodBreakdown.tsx          # 4-card breakdown with assumptions + citations
│       │   ├── AuditTrailTimeline.tsx       # Expandable vertical step timeline
│       │   ├── ResearchStreamVisualizer.tsx # 5-phase SSE progress indicator
│       │   ├── CrossCheckPanel.tsx          # Provider disagreement table
│       │   ├── CommandPalette.tsx           # ⌘K command palette
│       │   └── TerminalClock.tsx            # Live clock in the status bar
│       └── lib/types.ts           # TypeScript mirror of all Pydantic models
└── docs/
    ├── methodology.md             # Formulas and step-by-step for each method
    ├── architecture.md            # Component diagram and data-flow description
    ├── assumptions.md             # Sector defaults and their sources
    └── demo-scenarios.md          # Three walkthrough scripts for live review
```

---

## Quick start

**Prerequisites:** Python ≥ 3.11, `uv`, Node ≥ 20.

**1. Backend**

```bash
cd backend
uv sync
uv run pytest                                        # ~70 tests, all pass offline
uv run modus companies                               # list available fixture companies
uv run modus audit --from-fixture basis_ai           # full audit → writes audit_report.{md,json,pdf}
uv run uvicorn modus.api:app --reload --port 8000    # HTTP API on :8000
```

**2. Web UI**

```bash
cd web
npm install
npm run dev         # http://localhost:3000  (proxies /api/* to :8000)
```

**Offline mode** — set `MODUS_FORCE_MOCK=1` or simply leave all API keys unset. The full flow completes with citations honestly labeled `mock`. Every output is byte-identical across runs.

---

## Environment variables

Create `backend/.env` (loaded automatically at startup via `python-dotenv`):

```bash
# Primary AI research provider — powers the "Research any company" flow
ANTHROPIC_API_KEY=sk-ant-...

# Private-market comps via the Octagon Agents API
# Covers 3M+ private companies, 500K+ funding rounds, 2M+ M&A transactions
OCTAGON_API_KEY=...

# Web-search fallback for peer multiples
FIRECRAWL_API_KEY=...

# 10Y Treasury yield (risk-free rate) from FRED
# Free at https://fred.stlouisfed.org/docs/api/api_key.html
FRED_API_KEY=...

# Force the mock provider even when live keys are set (useful for demos)
MODUS_FORCE_MOCK=0
```

All providers fail gracefully if their key is absent — the chain falls through to the next provider and ultimately to the deterministic mock.

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service liveness + version |
| `GET` | `/companies` | List available fixture companies for quick-load |
| `POST` | `/audit` | Run a full valuation from a `CompanyInput` body |
| `POST` | `/audit/fixture/:key` | Run a full valuation from a named fixture (e.g. `basis_ai`) |
| `GET` | `/research?q=<name>` | Research a company by name — returns a pre-filled `CompanyInput` with citations |
| `GET` | `/research/stream?q=<name>` | SSE stream of research progress events, ending with the full result |
| `POST` | `/audit/research?q=<name>` | One-call: research + full audit in a single request |
| `POST` | `/cross-check` | Query each provider independently for peer multiples; surfaces inter-provider spread |
| `GET` | `/cache/stats` | Current cache hit/miss counts and size |
| `POST` | `/cache/clear` | Flush the SQLite cache (optionally scoped to a single provider) |

### Key request/response types

```typescript
// POST /audit body
CompanyInput {
  name: string
  sector: "ai_saas" | "saas" | "fintech" | "deeptech" | "consumer" | "healthcare" | ...
  ltm_revenue: number          // USD
  revenue_growth: number       // e.g. 0.45 = 45%
  ebit_margin: number          // e.g. -0.10 = -10%
  last_round_post_money?: number
  last_round_date?: string     // ISO date
  as_of?: string               // ISO date, defaults to today
}

// Response from /audit, /audit/research, /audit/fixture/:key
ValuationOutput {
  company: CompanyInput
  fair_value: Range            // { low, base, high } in USD
  methods: MethodResult[]      // one per method, each with its own Range + audit steps
  audit_trail: AuditStep[]     // flat, re-numbered across all methods
  citations: Citation[]        // deduplicated citation list
  confidence: number           // 0–1 blended confidence
  as_of: string
}
```

---

## Valuation methods

### 1. Comparable Company Analysis (Comps)
Loads a sector peer set, fetches EV/Revenue multiples per ticker via the provider chain (yfinance → Octagon → Firecrawl → Mock), takes 25th / 50th / 75th percentiles, multiplies by LTM revenue, and applies a stage-aware illiquidity discount. Confidence scales with peer count and data freshness.

### 2. Discounted Cash Flow (DCF)
Projects 5-year free cash flow from revenue × decaying growth × EBIT margin path → tax → capex% → ΔWC%. Terminal value via Gordon growth. WACC = FRED 10Y UST risk-free rate + sector equity risk premium (CAPM). Low/base/high come from a 5×5 WACC × terminal-growth sensitivity grid (±1pp each axis). Stage-aware illiquidity discount applied post-derivation.

### 3. Last Round Mark-to-Market
Anchors on the most recent post-money valuation, applies the sector index total return (IGV / XLF / XLY proxy) since the round date, and widens ±15% for uncertainty. Confidence decays for rounds older than 18 months.

### 4. Precedent Transactions
Applies deal-level EV/Revenue multiples from a curated fixture database of private-market M&A transactions, filtered by sector and deal recency, then blended with the same stage-aware illiquidity discount.

### Aggregation
Default weights: Comps 40% / DCF 40% / Last Round 15% / Precedent 5%, adjusted by per-method confidence and re-normalized to sum to 1. Blended low/base/high are computed as confidence-weighted per-leg averages. The aggregation waterfall chart in the UI visualizes each method's `base × weight` contribution stacking into the final blended value.

---

## Data provider chain

The chain is tried left-to-right for each data fetch. First non-null result wins and is cached in SQLite.

```
Claude AI  →  Octagon  →  yfinance  →  FRED  →  Firecrawl  →  Mock
```

| Provider | What it provides | Key required |
|----------|-----------------|--------------|
| **Claude** (`claude-sonnet-4-6`) | Company research: sector, revenue, growth, margins, last round via AI synthesis | `ANTHROPIC_API_KEY` |
| **Octagon** | Private-market peer multiples via the `octagon-agent` router (3M+ private companies, 500K+ rounds) | `OCTAGON_API_KEY` |
| **yfinance** | Public company EV/Revenue multiples, 10Y Treasury proxy (`^TNX`) | none |
| **FRED** | Authoritative 10Y UST (DGS10) risk-free rate | `FRED_API_KEY` (optional) |
| **Firecrawl** | Web-search fallback for peer multiples via `/v1/search` + regex extraction | `FIRECRAWL_API_KEY` |
| **Mock** | Deterministic JSON fixtures — always available, never fails | none |

Every provider tags its output with a `Citation` so the audit trail is honest about whether a data point is live or mocked.

---

## Traceability model

The core data types (`backend/src/modus/core/models.py`) are built so that **every number lives inside a Citation chain or is backed by a named Assumption**:

| Type | Fields |
|------|--------|
| `Citation` | `source`, `field`, `value`, `as_of`, optional `url`, optional `note` |
| `Assumption` | `name`, `value`, `rationale`, optional backing `Citation` |
| `AuditStep` | numbered step with `inputs`, `outputs`, `citations`, `assumptions` |
| `MethodResult` | low/base/high `Range` + full list of `AuditStep`s |
| `ValuationOutput` | blended fair-value `Range`, all `MethodResult`s, flat re-numbered audit trail, deduplicated citation list |

---

## Worked example

```
$ MODUS_FORCE_MOCK=1 uv run modus audit --from-fixture basis_ai

Basis AI  ·  ai_saas  ·  2026-04-14
Fair value: $139.6M  ($116.8M – $164.8M)

Method                 Weight  Confidence      Low       Base      High
comps                    38%     100%        $108.3M   $127.6M   $143.8M
dcf                      28%      60%         $91.1M   $114.6M   $151.2M
last_round               21%      70%        $168.1M   $197.7M   $227.4M
precedent_transactions   13%      80%        $120.0M   $142.0M   $165.0M

Audit trail: 18 steps  ·  Citations: 12
```

Drill into any step to see inputs → formula → outputs → source. For the Comps leg:

| Step | What it did | Source |
|------|-------------|--------|
| 1 | Loaded 8 ai_saas peers (Snowflake, Datadog, …) | `mock / peer_set` |
| 2 | Fetched EV/Rev per peer | `mock / ev_to_revenue` ×8 |
| 3 | 25/50/75 percentiles = 12.4× / 15.8× / 17.6× | derived |
| 4 | × LTM revenue $10M → $124–$176M pre-discount | derived |
| 5 | Stage-aware illiquidity discount (series B, 2.1yr) → 22% | `Assumption: illiquidity_curve` |
| 6 | Sorted range → $108.3 / $127.6 / $143.8M | invariant |

---

## Web UI

The frontend is a Next.js 16 App Router app styled with Tailwind v4 and Framer Motion. It connects to the FastAPI backend via proxied API routes.

**Key components:**

| Component | What it renders |
|-----------|----------------|
| `ResearchStreamVisualizer` | 5-phase SSE progress bar (Profile → Peers → Engine → Audit Trail → Report) |
| `ValuationRangeChart` | Custom SVG: per-method low/high bars on a shared proportional axis with consensus overlay |
| `WaterfallChart` | Stacked bar showing each method's `base × weight` contribution to the blended value |
| `SensitivityHeatmap` | Color-coded 5×5 DCF grid: WACC on one axis, terminal growth on the other |
| `MethodBreakdown` | 4 cards (one per method) with range, confidence, assumptions grid, and citation chips |
| `AuditTrailTimeline` | Vertical step timeline with expandable detail panels, keyboard navigation |
| `CrossCheckPanel` | Table of per-provider peer multiples and inter-provider spread |
| `CommandPalette` | ⌘K palette: New Valuation, View Audit Trail, Export JSON/Markdown/PDF, Toggle Theme |

**Quick-start chips** — 6 (soon 7) example companies on the empty state let a reviewer see the full flow in one click without typing anything.

---

## Testing

```bash
cd backend && uv run pytest
```

~70 tests covering:

- Core models and `Range` monotonicity invariant
- Each method's invariants (range sortedness, confidence bounds, skips on missing data)
- Engine end-to-end on all 3 fixture companies
- CLI (`typer.testing.CliRunner`) and API (`fastapi.testclient.TestClient`)
- Provider chain fallback — an `AlwaysFailsProvider` in front of the mock proves the chain recovers and output still carries citations
- **Byte-determinism** — `test_mock_run_is_byte_deterministic` asserts identical JSON on repeated mock runs

---

## Design decisions & tradeoffs

- **Methods as plugins** behind a `ValuationMethod` Protocol — adding a fifth method is a new file + one-line register in the engine.
- **Provider chain over hard dependencies** — `ProviderChain` tries each provider in order and falls through to a deterministic mock. The demo runs offline and the audit trail is honest about which source answered.
- **SQLite cache keyed on `(provider, key, as_of_date)`** via `diskcache` — a live demo yields the same numbers every run within a day, and reviewers can re-derive outputs.
- **Range monotonicity is a Pydantic invariant** — `Range` validates `low ≤ base ≤ high`; every builder sorts first to prevent silent inversions.
- **Stage-aware illiquidity discount** scales with LTM revenue and round age — more principled than a flat 25%, while still being an `Assumption` so it shows up in the audit trail.
- **Confidence-adjusted weighting** instead of fixed weights — a stale last round or thin peer set is automatically down-weighted.
- **SSE streaming for research** — the frontend shows real-time provider progress instead of a blank loading state, which matters when Octagon/Claude calls take 3–8 seconds.

---

## Known limitations

- **DCF is assumption-heavy.** Capex%, ΔWC%, margin path, and tax rate come from sector defaults in `assumptions.py`, not from a financial-statement pull. The audit trail names every one as an `Assumption`, but they're still estimates.
- **Peer set is fixture-driven on the mock path.** Live runs improve coverage, but the fixture universe is limited to ~20 public comps per sector.
- **Last-round markup uses a public ETF index** (IGV/XLF/XLY), not a private-company secondary index. Public and private valuations can diverge significantly in a downturn.
- **No currency handling.** All values are USD; international peers with non-USD financials are not adjusted.
- **`peer_multiples` cache key is `(provider, sector, as_of)`**, not the full ticker list. Adding a peer mid-day without changing `as_of` would serve stale data — acceptable for a demo, not for production.

---

## Potential improvements

- **SEC EDGAR integration** (`stefanoamorelli/sec-edgar-mcp`) for structured 10-K/10-Q financials — would let the DCF method consume real multi-year revenue/EBIT/capex line items instead of assumption-driven projections. Requires extending the `Provider` protocol with a `financial_history()` method (~2hr refactor).
- **Portfolio view** — list all audited companies with their valuation ranges, last audit dates, and aggregate statistics.
- **Historical tracking** — time-series chart of fair value midpoint per company across audit dates, with round-event annotations.
- **E2E test suite** with Playwright covering the full UI flow against MockProvider fixtures.
- **Per-method confidence elicitation** — let the reviewer override confidence scores at runtime before the blend.
- **Time-to-liquidity curve for illiquidity discount** — interpolate against an exit-timing distribution instead of the current step function.
