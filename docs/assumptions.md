# Assumptions & data sources

Every number Modus produces eventually bottoms out in one of three things:

1. **Live provider data** — tagged with a provider name and an `as_of` date.
2. **Mock fixture data** — clearly labeled `source: mock` in the citation chain.
3. **A hardcoded assumption** — a named `Assumption` row with a rationale.

This file documents category 3: the hardcoded defaults, what they are, and why.
The defaults live in `backend/src/modus/assumptions.py`.

## Sector defaults

Each sector has the same shape of defaults (see `SectorDefaults`):

| Sector           | Terminal g | WACC  | Target EBIT | Tax  | Capex%  | ΔWC%  | Default EV/Rev | Index |
|------------------|-----------:|------:|------------:|-----:|--------:|------:|---------------:|:------|
| ai_saas          |     3.0%   | 12%   |   25%       | 21%  |   3%    |  5%   |        12.0×   | IGV   |
| vertical_saas    |     2.5%   | 11%   |   22%       | 21%  |   3%    |  4%   |         8.0×   | IGV   |
| fintech          |     2.5%   | 13%   |   20%       | 25%  |   2%    |  6%   |         6.0×   | XLF   |
| marketplace      |     2.5%   | 12%   |   18%       | 23%  |   2%    |  5%   |         5.0×   | XLY   |
| consumer         |     2.0%   | 11%   |   15%       | 23%  |   4%    |  8%   |         4.0×   | XLY   |

**Rationale for shape.**

- **Terminal growth.** Capped near long-run developed-market GDP (2–3%). Higher
  values violate the Gordon growth inequality `g < WACC` and would make the DCF
  explode.
- **WACC** (simplified: `risk_free + 8% ERP` in practice, with these values as
  fallbacks). The sector spread follows the usual narrative — fintech is riskier
  than infrastructure SaaS, consumer is less risky but lower return.
- **Target EBIT margin.** The point the 5yr margin path converges to. Mature
  public SaaS comps sit in the mid-20s; fintech and consumer are structurally
  lower. This is where the margin decays to over the projection window.
- **Tax rate.** US federal + state blend for SaaS/fintech (21–25%). Fintech
  slightly higher for mix-of-income assumptions.
- **Capex% / ΔWC%.** Capital intensity proxies. SaaS is capex-light;
  consumer/marketplaces carry more working capital.
- **Default EV/Revenue multiple.** Only used if the peer set returns nothing
  valid — a last-ditch fallback so Comps never produces zero.
- **Index ticker.** Public ETF proxy for Last Round mark-to-market. IGV for SaaS
  (iShares Expanded Tech-Software), XLF for financials, XLY for consumer
  discretionary.

These are starting points, not conviction bets. A production version would
replace them with provider-sourced values per company (sector beta for WACC,
peer-median margins for target EBIT, etc.). They're cited in every audit trail
so a reviewer can see exactly when a hardcoded assumption is doing the work.

## Cross-cutting assumptions

- **Equity risk premium: 8.0%** — applied on top of the FRED 10Y risk-free rate
  to compute DCF WACC. Constant across sectors in this version.
- **Private-company illiquidity discount: 25%** — applied to Comps and DCF
  outputs. Damodaran's rule of thumb for illiquid/pre-IPO equity. A more refined
  version would scale this with expected time to liquidity.
- **Last-round ±15% spread** — ±15% uncertainty band around the marked post-money.
- **Last-round staleness cutoff: 548 days (~18 months)** — beyond this the method
  drops confidence from 0.7 to 0.3.
- **DCF revenue growth decay** — linear from input growth to 10% by year 5.
- **DCF EBIT margin decay** — linear from input margin to sector target by year 5.
- **Comps confidence floor** — `min(1.0, n_valid_peers / 8.0)`. A thin peer set
  is automatically down-weighted.

## Data sources

- **yfinance** — `enterpriseToRevenue`, `enterpriseToEbitda`, `trailingPE` on
  public comps. Free, no key. Used by `YFinanceProvider`.
- **FRED** — `DGS10` series for the 10Y US Treasury yield. Free API key
  (optional; falls back to mock). Used by `FredProvider`.
- **Mock fixtures** — `data/fixtures/peer_multiples.json` (~20 curated
  tickers across sectors), `data/fixtures/index_returns.json` (IGV/XLF/XLY
  annual returns), `data/fixtures/peer_sets.json` (sector → ticker list),
  `data/fixtures/companies.json` (three demo portfolio companies).

Live calls are cached in a SQLite diskcache keyed on
`(provider, key, as_of_date)` so that the same demo produces the same numbers on
every run.
