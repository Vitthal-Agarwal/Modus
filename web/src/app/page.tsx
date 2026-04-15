"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, Play } from "lucide-react";

import { AuditTrailTimeline } from "@/components/AuditTrailTimeline";
import { MethodBreakdown } from "@/components/MethodBreakdown";
import { ValuationRangeChart } from "@/components/ValuationRangeChart";
import {
  type CompanyFixture,
  type ValuationOutput,
  fmtMoney,
  fmtPercent,
} from "@/lib/types";

const SECTORS: CompanyFixture["sector"][] = [
  "ai_saas",
  "vertical_saas",
  "fintech",
  "marketplace",
  "consumer",
];

const EMPTY_FORM: CompanyFixture = {
  name: "",
  sector: "ai_saas",
  ltm_revenue: 10_000_000,
  revenue_growth: 1.0,
  ebit_margin: -0.1,
};

export default function HomePage() {
  const [fixtures, setFixtures] = useState<Record<string, CompanyFixture>>({});
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [form, setForm] = useState<CompanyFixture>(EMPTY_FORM);
  const [result, setResult] = useState<ValuationOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setFixtures(data);
          const firstKey = Object.keys(data)[0];
          if (firstKey) {
            setSelectedKey(firstKey);
            setForm({ ...data[firstKey] });
          }
        }
      })
      .catch(() => {});
  }, []);

  function loadFixture(key: string) {
    setSelectedKey(key);
    if (fixtures[key]) setForm({ ...fixtures[key] });
  }

  async function runAudit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.hint || data.error || "Audit failed");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.company.toLowerCase().replace(/\s+/g, "_")}_audit.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Modus <span className="text-neutral-400 font-normal">— VC Audit Tool</span>
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Independent portfolio valuation via Comps · DCF · Last Round
            </p>
          </div>
          {result && (
            <button
              onClick={downloadJson}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <Download size={14} /> Export JSON
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
        <aside className="space-y-5">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold mb-3">Portfolio company</h2>

            {Object.keys(fixtures).length > 0 && (
              <div className="mb-4">
                <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
                  Quick-load fixture
                </label>
                <select
                  value={selectedKey}
                  onChange={(e) => loadFixture(e.target.value)}
                  className="w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 py-1.5 text-sm"
                >
                  {Object.entries(fixtures).map(([key, c]) => (
                    <option key={key} value={key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-3">
              <Field label="Company name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                />
              </Field>

              <Field label="Sector">
                <select
                  value={form.sector}
                  onChange={(e) =>
                    setForm({ ...form, sector: e.target.value as CompanyFixture["sector"] })
                  }
                  className={inputClass}
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={`LTM revenue ($) — ${fmtMoney(form.ltm_revenue)}`}>
                <input
                  type="number"
                  value={form.ltm_revenue}
                  onChange={(e) =>
                    setForm({ ...form, ltm_revenue: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </Field>

              <Field label={`Revenue growth — ${fmtPercent(form.revenue_growth)}`}>
                <input
                  type="number"
                  step="0.05"
                  value={form.revenue_growth}
                  onChange={(e) =>
                    setForm({ ...form, revenue_growth: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </Field>

              <Field label={`EBIT margin — ${fmtPercent(form.ebit_margin)}`}>
                <input
                  type="number"
                  step="0.05"
                  value={form.ebit_margin}
                  onChange={(e) =>
                    setForm({ ...form, ebit_margin: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </Field>

              {form.last_round_post_money != null && (
                <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  Last round:{" "}
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    {fmtMoney(form.last_round_post_money)}
                  </span>
                  {form.last_round_date && <span> · {form.last_round_date}</span>}
                </div>
              )}
            </div>

            <button
              disabled={loading || !form.name}
              onClick={runAudit}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {loading ? "Running audit..." : "Run audit"}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold mb-1">Audit failed</div>
                <div className="font-mono">{error}</div>
              </div>
            </div>
          )}
        </aside>

        <section className="space-y-6">
          {!result && !loading && (
            <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 p-12 text-center">
              <div className="text-sm text-neutral-500">
                Load a fixture company and click <span className="font-semibold">Run audit</span>{" "}
                to see a valuation breakdown, method-level detail, and the full audit trail.
              </div>
            </div>
          )}

          {result && (
            <>
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
                <div className="flex items-baseline justify-between mb-1">
                  <h2 className="text-lg font-bold">{result.company}</h2>
                  <div className="text-xs text-neutral-500">as of {result.as_of}</div>
                </div>
                <div className="text-xs text-neutral-500 mb-6">{result.sector}</div>

                <div className="flex items-baseline gap-6 mb-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500">Low</div>
                    <div className="text-xl font-semibold text-neutral-400">
                      {fmtMoney(result.fair_value.low)}
                    </div>
                  </div>
                  <div className="text-neutral-300">→</div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-sky-600 dark:text-sky-400">
                      Base fair value
                    </div>
                    <div className="text-3xl font-bold text-sky-600 dark:text-sky-400">
                      {fmtMoney(result.fair_value.base)}
                    </div>
                  </div>
                  <div className="text-neutral-300">→</div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                      High
                    </div>
                    <div className="text-xl font-semibold text-neutral-400">
                      {fmtMoney(result.fair_value.high)}
                    </div>
                  </div>
                </div>

                <ValuationRangeChart fairValue={result.fair_value} methods={result.methods} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {result.methods.map((m) => (
                  <MethodBreakdown key={m.method} method={m} />
                ))}
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
                <AuditTrailTimeline steps={result.audit_trail} />
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-4 text-center text-[11px] text-neutral-500">
        Modus VC Audit Tool · Deterministic mock fallback when live data providers unavailable
      </footer>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
