# Demo scenarios

Three walkthroughs for the live review. Each one is designed to show a different
facet of the tool: Comps-dominant, DCF-dominant, and Last-Round-dominant.

## Pre-demo setup

```bash
# Terminal 1 — backend
cd backend
uv sync
uv run uvicorn modus.api:app --reload

# Terminal 2 — web
cd web
npm install
npm run dev     # http://localhost:3000
```

Fixtures already loaded: Basis AI, Loft SaaS, Trellis Fintech.

Offline demo (no internet): `export MODUS_FORCE_MOCK=1` before starting the
backend. Everything still works; citations will honestly say `source: mock`.

---

## Scenario 1 — Basis AI (AI/SaaS, the headline demo)

**Why this one.** Matches the spec's example portfolio company. Shows all three
methods firing, with Comps pulling the most weight because AI-SaaS has a rich
public peer set.

**Steps.**

1. Load `basis_ai` fixture. Point out: $10M LTM revenue, 150% growth, -10% EBIT
   margin (classic growth-at-all-cost AI-SaaS), $180M last round June 2025.
2. Click Run audit. Expected blended fair value ≈ **$128M base** ($108M–$152M).
3. Point at the range chart: three method bars plus a BLENDED row.
4. Talking points:
   - Comps sits ~$140M (12× on $10M LTM, then 25% illiquidity discount).
   - DCF sits ~$100M (high growth but negative current margins).
   - Last Round ~$192M (marked up from $180M by IGV's period return, minus the
     ±15% band).
   - Blended ~$128M because the engine down-weights the high-growth DCF envelope
     and pulls toward the public market comparable.
5. Expand the audit trail. Show that step 3 ("Selected peers") carries 8 real
   tickers with live or fixture multiples, and step 8 ("Applied sensitivity
   grid") carries WACC and g assumptions with the ERP rationale.

---

## Scenario 2 — Loft SaaS (vertical SaaS, DCF-heavy)

**Why this one.** A more mature company where DCF is meaningful because EBIT is
already near breakeven. Demonstrates the method plugin system: same code path,
different result shape.

**Steps.**

1. Load `loft_saas`. Point out: $28M LTM, 65% growth, 5% EBIT margin.
2. Run audit. DCF will pull a larger share of the blend here because confidence
   is higher (positive cash flow means the envelope is narrower).
3. Open the DCF method card. Walk through the assumptions list: terminal
   growth 2.5%, target EBIT 22%, WACC ~12%. Every assumption has a rationale.
4. Open the Comps method card. Show that the peer set is different — CRM,
   WDAY, HUBS, TEAM, etc. — and the EV/Rev percentile band is narrower than
   AI-SaaS.

---

## Scenario 3 — Trellis Fintech (fintech, shows sector dispatching)

**Why this one.** Different sector → different defaults, different peer set,
different index proxy. Good quick demo of how sector is a first-class dimension.

**Steps.**

1. Load `trellis_fintech`. $55M LTM, 85% growth.
2. Run audit.
3. Open assumptions — terminal growth 2.5%, WACC 13% (fintech risk premium),
   ERP 8% stays constant, tax 25%.
4. Open the Last Round card. The index used is **XLF**, not IGV. Point at the
   `source` field in the citation — it says exactly which ticker drove the
   mark-to-market.
5. Show Export JSON. Walk through the `citations` array — each entry names the
   provider, field, value, and `as_of`. This is the audit artifact a reviewer
   would file.

---

## Things to emphasize throughout

- **Every number has a citation.** Open any method card → open the citations
  section → show the provider chain output.
- **Mock fallback is honest.** If a provider fails, the citation says so — no
  pretending live data was used.
- **The range is monotonic by construction.** Range is a Pydantic type with a
  validator; a method that produces `high < low` fails at construction, not at
  render.
- **Methods are plugins.** Opening `methods/dcf.py` beside `methods/comps.py`
  should read as "two files with the same shape".
- **CLI exists too.** `uv run modus audit --from-fixture basis_ai` produces the
  same `ValuationOutput` as the web UI — the UI is a renderer, not the engine.

## Known issues / punt list

- ERP is constant 8% across sectors. Should be sector-differentiated.
- Illiquidity discount is a flat 25%. Should scale with time to liquidity.
- DCF uses a simplified WACC (risk-free + ERP, no beta). Production version
  needs sector betas.
- No precedent transactions method. Stretch goal.
- No PDF export — markdown + JSON only. Stretch goal.
- Peer sets are hand-curated and static. A production version would pull them
  from a maintained taxonomy service.
