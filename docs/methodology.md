# Methodology

Modus runs three independent valuation methods and blends them. Each method is a
plugin behind the `ValuationMethod` Protocol (`backend/src/modus/methods/base.py`)
and produces a `MethodResult`: a low/base/high `Range`, a weight, a confidence, a
list of `AuditStep`s, and a list of `Assumption`s. The engine
(`backend/src/modus/core/engine.py`) orchestrates the three and blends them in
`core/aggregation.py`.

---

## 1. Comparable Company Analysis (Comps)

**Goal.** Price the company off trading multiples of public peers in the same
sector.

**Steps.**

1. **Peer selection** — load the sector's peer ticker list from
   `data/fixtures/peer_sets.json`. Peer sets were hand-curated from public
   universe lists for AI-SaaS, vertical SaaS, fintech, marketplace, and consumer.
2. **Multiple fetch** — for each peer, call `providers.peer_multiples(ticker)`.
   The provider chain tries `YFinanceProvider` first (yfinance's
   `enterpriseToRevenue`, `enterpriseToEbitda`, `trailingPE`), then
   `MockProvider` which returns deterministic fixtures. Each return is tagged
   with a `Citation` naming its source.
3. **Percentile bands** — compute the 25th, 50th, and 75th percentiles of
   EV/Revenue across the valid peers.
4. **Apply to target** — multiply each percentile by the target's LTM revenue to
   get raw enterprise value bounds.
5. **Private-company illiquidity discount** — apply 25% (Damodaran convention).
   See `docs/assumptions.md`.
6. **Sort and emit range** — `Range(low, base, high)` with `low ≤ base ≤ high`.
7. **Confidence** — `min(1.0, n_valid_peers / 8.0)`. Below 8 peers the method is
   explicitly less sure.

**Weaknesses handled.** Missing or `None` multiples are filtered. A sector with no
valid multiples returns `confidence=0` and is dropped from aggregation.

---

## 2. Discounted Cash Flow (DCF)

**Goal.** Intrinsic value based on projected free cash flow.

**Assumption sources.**

- **Risk-free rate** — `providers.risk_free_rate()` → FRED DGS10 10Y UST,
  fallback 4.2% mock.
- **Equity risk premium** — sector ERP, constant 8.0% (acknowledged as blunt).
- **WACC** — `risk_free + sector_erp`. Simplified: no beta, no debt tax shield.
  A mature version would pull a sector beta and lever it.
- **Terminal growth, tax rate, target EBIT margin, capex%, ΔWC%** — from
  `assumptions.py` per sector.

**Steps.**

1. **Revenue projection** — 5 years, growth decaying linearly from input
   `revenue_growth` to 10% by year 5.
2. **Margin path** — EBIT margin decays linearly from input `ebit_margin` to the
   sector target.
3. **FCF per year** — `EBIT × (1 - tax) - capex - ΔWC`, where capex and ΔWC are
   percent-of-revenue constants.
4. **Terminal value** — Gordon growth: `FCF₅ × (1 + g) / (WACC - g)`.
5. **Discount** — each year's FCF and the terminal value are discounted back at
   WACC.
6. **Sensitivity grid** — recompute enterprise value over a 3×3 grid of
   `(WACC ± 1pp, g ± 1pp)`. `low`/`high` come from the min/max of the grid,
   `base` from the center cell.
7. **Illiquidity discount** — 25% applied to all three.
8. **Confidence** — fixed 0.6; a mature version would scale by width of the
   sensitivity envelope.

**Weaknesses handled.** `WACC - g > 0` is required for Gordon growth; the sensitivity
grid steps are sized so that the clamp doesn't fire in practice. If it ever does,
the method degenerates to the base cell and emits a warning citation.

---

## 3. Last Round Mark-to-Market

**Goal.** Anchor on the most recent priced round and mark it to current market.

**Inputs required.** `last_round_post_money` and `last_round_date`. If either is
missing, the method emits `confidence=0` and a "skipped" audit step; the engine
drops it from aggregation.

**Steps.**

1. **Anchor** — the last round post-money valuation.
2. **Sector index return** — `providers.index_return(sector_ticker, since=round_date)`.
   The ticker mapping (`ai_saas → IGV`, etc.) lives in `assumptions.py`. Provider
   chain returns yfinance total return or deterministic mock fallback.
3. **Marked value** — `anchor × (1 + index_return)`.
4. **Low/high** — `marked × (1 ± 0.15)` for ±15% uncertainty.
5. **Confidence** — 0.7 if the round is fresher than 18 months, 0.3 otherwise.
6. **Citation chain** — inputs include round date, post-money, index ticker;
   outputs include the period return and the marked range.

---

## Aggregation

`core/aggregation.py` blends method results:

1. **Drop zero-confidence or zero-base methods** — they are noise.
2. **Resolve weights** — start from defaults (Comps 0.4, DCF 0.4, Last Round 0.2),
   apply any caller overrides, multiply each by the method's confidence,
   re-normalize to sum to 1.
3. **Blend ranges** — the final `low`/`base`/`high` are each weighted sums of the
   per-method values.
4. **Per-method contribution** — stored in the audit trail so a reviewer can see
   how much each method moved the final number.

The engine's first audit step names the requested methods and weights; the last
audit step records the resolved weights and the final blended range. The
per-method steps sit in between, renumbered into a single monotonic sequence.
