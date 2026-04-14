"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Download, Loader2, Play, Search, X } from "lucide-react";

import { AuditTrailTimeline } from "@/components/AuditTrailTimeline";
import { CommandPalette } from "@/components/CommandPalette";
import { MethodBreakdown } from "@/components/MethodBreakdown";
import { ValuationRangeChart } from "@/components/ValuationRangeChart";
import {
  type Citation,
  type CompanyFixture,
  type ResearchResult,
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

const SEARCH_PHASES = [
  { label: "Looking up company…", icon: "🔍" },
  { label: "Querying market data…", icon: "📊" },
  { label: "Checking private market sources…", icon: "🏦" },
  { label: "Parsing financials…", icon: "📈" },
  { label: "Building company profile…", icon: "✨" },
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchPhase, setSearchPhase] = useState(0);
  const [pendingResearch, setPendingResearch] = useState<ResearchResult | null>(null);
  const [activeResearch, setActiveResearch] = useState<ResearchResult | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const loadFixture = useCallback(
    (key: string) => {
      setSelectedKey(key);
      if (fixtures[key]) setForm({ ...fixtures[key] });
    },
    [fixtures],
  );

  const searchCompany = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchPhase(0);
    setError(null);
    setPendingResearch(null);

    if (phaseTimer.current) clearInterval(phaseTimer.current);
    phaseTimer.current = setInterval(() => {
      setSearchPhase((p) => Math.min(p + 1, SEARCH_PHASES.length - 1));
    }, 1800);

    try {
      const res = await fetch(`/api/research?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || "Research failed");
      } else {
        setPendingResearch(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (phaseTimer.current) clearInterval(phaseTimer.current);
      phaseTimer.current = null;
      setSearching(false);
      setSearchPhase(0);
    }
  }, []);

  const acceptResearch = useCallback(() => {
    if (!pendingResearch) return;
    setForm(pendingResearch.input);
    setActiveResearch(pendingResearch);
    setPendingResearch(null);
    setSelectedKey("");
  }, [pendingResearch]);

  const dismissResearch = useCallback(() => {
    setPendingResearch(null);
    setActiveResearch(null);
  }, []);

  const clearResearch = useCallback(() => {
    setActiveResearch(null);
    setSearchQuery("");
    const firstKey = Object.keys(fixtures)[0];
    if (firstKey) {
      setSelectedKey(firstKey);
      setForm({ ...fixtures[firstKey] });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [fixtures]);

  const runAudit = useCallback(async () => {
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
  }, [form]);

  const downloadJson = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.company.toLowerCase().replace(/\s+/g, "_")}_audit.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const inTextarea = target?.tagName === "TEXTAREA";
      const inPalette = target?.closest?.("[cmdk-root]");
      if ((e.key === "e" || e.key === "E") && (e.metaKey || e.ctrlKey)) {
        if (result) {
          e.preventDefault();
          downloadJson();
        }
        return;
      }
      if (e.key === "Enter" && !inTextarea && !inPalette && !loading && form.name) {
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "SELECT" || target === document.body) {
          e.preventDefault();
          (target as HTMLElement | null)?.blur?.();
          runAudit();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, loading, form.name, downloadJson, runAudit]);

  return (
    <>
      <CommandPalette
        fixtures={fixtures}
        result={result}
        onLoadFixture={loadFixture}
        onRunAudit={runAudit}
        onScrollTo={scrollTo}
        onExport={downloadJson}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header
          className="sticky top-0 z-40"
          style={{
            background: "rgba(7, 8, 10, 0.85)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo />
              <div
                className="hidden sm:block text-[11px] font-mono uppercase tracking-widest"
                style={{ color: "var(--text-4)" }}
              >
                vc audit · comps · dcf · last round
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const ev = new KeyboardEvent("keydown", {
                    key: "k",
                    metaKey: true,
                  });
                  window.dispatchEvent(ev);
                }}
                className="flex items-center gap-2 px-3 h-8 rounded-md transition-opacity hover:opacity-80"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-3)",
                }}
              >
                <Search size={12} />
                <span className="text-[12px]">Search…</span>
                <kbd
                  className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono shadow-key"
                  style={{ color: "var(--text-3)" }}
                >
                  ⌘K
                </kbd>
              </button>
              {result && (
                <button
                  onClick={downloadJson}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-md transition-opacity hover:opacity-80"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-2)",
                  }}
                >
                  <Download size={12} />
                  <span className="text-[12px]">JSON</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
          {/* Sidebar: portfolio company form */}
          <aside className="space-y-4">
            <div
              className="shadow-ring rounded-2xl p-5"
              style={{ background: "var(--surface)" }}
            >
              <div
                className="text-[10px] font-mono uppercase tracking-widest mb-3"
                style={{ color: "var(--text-4)" }}
              >
                portfolio company
              </div>

              <div className="mb-4">
                <Label>Research any company</Label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. Stripe, Snowflake, OpenAI…"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (pendingResearch) setPendingResearch(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        searchCompany(searchQuery);
                      }
                    }}
                    className="flex-1 text-[12px]"
                    style={inputStyle}
                  />
                  <button
                    disabled={searching || !searchQuery.trim()}
                    onClick={() => searchCompany(searchQuery)}
                    className="px-3 rounded-lg flex items-center gap-1.5 text-[11px] font-mono transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text-2)",
                    }}
                  >
                    {searching ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Search size={11} />
                    )}
                  </button>
                </div>

                {searching && (
                  <SearchingIndicator query={searchQuery} phase={searchPhase} />
                )}

                {!searching && pendingResearch && (
                  <ResearchPreview
                    result={pendingResearch}
                    query={searchQuery}
                    onAccept={acceptResearch}
                    onDismiss={dismissResearch}
                  />
                )}

                {!searching && activeResearch && !pendingResearch && (
                  <ActiveResearchBadge
                    result={activeResearch}
                    onClear={clearResearch}
                  />
                )}
              </div>

              {Object.keys(fixtures).length > 0 && (
                <div className="mb-4">
                  <Label>Or load fixture</Label>
                  <select
                    value={selectedKey}
                    onChange={(e) => {
                      loadFixture(e.target.value);
                      setActiveResearch(null);
                      setPendingResearch(null);
                      setSearchQuery("");
                    }}
                    className="w-full font-mono text-[12px]"
                    style={inputStyle}
                  >
                    {!selectedKey && (
                      <option value="" style={{ background: "#101111" }}>
                        — select fixture —
                      </option>
                    )}
                    {Object.entries(fixtures).map(([key, c]) => (
                      <option key={key} value={key} style={{ background: "#101111" }}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-3">
                <Field label="Name">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full text-[13px]"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Sector">
                  <select
                    value={form.sector}
                    onChange={(e) =>
                      setForm({ ...form, sector: e.target.value as CompanyFixture["sector"] })
                    }
                    className="w-full font-mono text-[12px]"
                    style={inputStyle}
                  >
                    {SECTORS.map((s) => (
                      <option key={s} value={s} style={{ background: "#101111" }}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={`LTM revenue · ${fmtMoney(form.ltm_revenue)}`}>
                  <input
                    type="number"
                    value={form.ltm_revenue}
                    onChange={(e) =>
                      setForm({ ...form, ltm_revenue: Number(e.target.value) })
                    }
                    className="w-full font-mono text-[12px]"
                    style={inputStyle}
                  />
                </Field>

                <Field label={`Revenue growth · ${fmtPercent(form.revenue_growth)}`}>
                  <input
                    type="number"
                    step="0.05"
                    value={form.revenue_growth}
                    onChange={(e) =>
                      setForm({ ...form, revenue_growth: Number(e.target.value) })
                    }
                    className="w-full font-mono text-[12px]"
                    style={inputStyle}
                  />
                </Field>

                <Field label={`EBIT margin · ${fmtPercent(form.ebit_margin)}`}>
                  <input
                    type="number"
                    step="0.05"
                    value={form.ebit_margin}
                    onChange={(e) =>
                      setForm({ ...form, ebit_margin: Number(e.target.value) })
                    }
                    className="w-full font-mono text-[12px]"
                    style={inputStyle}
                  />
                </Field>

                {form.last_round_post_money != null && (
                  <div
                    className="text-[11px] font-mono pt-2 mt-2"
                    style={{
                      color: "var(--text-4)",
                      borderTop: "1px dashed var(--border)",
                    }}
                  >
                    last round{" "}
                    <span style={{ color: "var(--text-2)" }}>
                      {fmtMoney(form.last_round_post_money)}
                    </span>
                    {form.last_round_date && (
                      <span> · {form.last_round_date}</span>
                    )}
                  </div>
                )}
              </div>

              <button
                disabled={loading || !form.name}
                onClick={runAudit}
                className="mt-5 w-full flex items-center justify-center gap-2 rounded-lg h-9 text-[13px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed shadow-btn"
                style={{
                  background: "hsla(0,0%,100%,0.9)",
                  color: "#18191a",
                }}
              >
                {loading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                {loading ? "Running audit…" : "Run audit"}
              </button>
            </div>

            {error && (
              <div
                className="rounded-2xl p-4 text-[12px] flex items-start gap-2 glow-accent"
                style={{
                  background: "var(--surface)",
                  border: "1px solid rgba(255,99,99,0.2)",
                  color: "var(--text-2)",
                }}
              >
                <AlertCircle
                  size={14}
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--accent)" }}
                />
                <div>
                  <div className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                    Audit failed
                  </div>
                  <div className="font-mono text-[11px]">{error}</div>
                </div>
              </div>
            )}

            <div
              className="text-[10px] font-mono leading-relaxed px-1"
              style={{ color: "var(--text-4)" }}
            >
              press{" "}
              <kbd
                className="px-1.5 py-0.5 rounded shadow-key text-[10px]"
                style={{ color: "var(--text-3)" }}
              >
                ⌘K
              </kbd>{" "}
              to jump, load, run, or export
            </div>
          </aside>

          {/* Results */}
          <section className="space-y-5 min-w-0">
            {!result && !loading && !searching && (
              <EmptyState
                onSearch={(name) => {
                  setSearchQuery(name);
                  searchCompany(name);
                }}
              />
            )}
            {!result && !loading && searching && (
              <SearchingHero query={searchQuery} phase={searchPhase} />
            )}
            {loading && <LoadingState />}

            {result && (
              <>
                <div
                  id="summary"
                  className="hero-fade-in shadow-ring rounded-2xl p-7 relative overflow-hidden"
                  style={{ background: "var(--surface)" }}
                >
                  {/* subtle diagonal stripe accent in the corner */}
                  <div
                    className="stripes absolute top-0 right-0 w-32 h-32 opacity-60 pointer-events-none"
                    style={{
                      maskImage:
                        "linear-gradient(225deg, black 0%, transparent 70%)",
                      WebkitMaskImage:
                        "linear-gradient(225deg, black 0%, transparent 70%)",
                    }}
                  />

                  <div className="flex items-baseline justify-between mb-1 relative">
                    <div
                      className="text-[10px] font-mono uppercase tracking-widest"
                      style={{ color: "var(--text-4)" }}
                    >
                      {result.sector}
                    </div>
                    <div
                      className="text-[10px] font-mono"
                      style={{ color: "var(--text-4)" }}
                    >
                      as of {result.as_of}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <h2
                      className="text-[28px] font-semibold tracking-tight"
                      style={{ color: "var(--text)" }}
                    >
                      {result.company}
                    </h2>
                    {form.last_round_post_money != null && (
                      <LastRoundDelta
                        base={result.fair_value.base}
                        lastRound={form.last_round_post_money}
                      />
                    )}
                  </div>

                  <div className="flex items-baseline gap-5 mb-6 font-mono">
                    <Stat label="LOW" value={fmtMoney(result.fair_value.low)} dim />
                    <span style={{ color: "var(--text-4)" }}>→</span>
                    <div>
                      <div
                        className="text-[9px] uppercase tracking-widest"
                        style={{ color: "var(--info)" }}
                      >
                        FAIR VALUE · BASE
                      </div>
                      <div
                        className="text-[34px] font-semibold leading-tight"
                        style={{ color: "var(--text)" }}
                      >
                        {fmtMoney(result.fair_value.base)}
                      </div>
                    </div>
                    <span style={{ color: "var(--text-4)" }}>→</span>
                    <Stat label="HIGH" value={fmtMoney(result.fair_value.high)} dim />
                  </div>

                  <div
                    className="pt-4"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <ValuationRangeChart
                      fairValue={result.fair_value}
                      methods={result.methods}
                    />
                  </div>
                </div>

                <div id="methods" className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {result.methods.map((m) => (
                    <MethodBreakdown key={m.method} method={m} />
                  ))}
                </div>

                <div
                  className="shadow-ring rounded-2xl p-6"
                  style={{ background: "var(--surface)" }}
                >
                  <AuditTrailTimeline steps={result.audit_trail} />
                </div>
              </>
            )}
          </section>
        </main>

        <footer
          className="py-5 text-center text-[10px] font-mono uppercase tracking-widest"
          style={{ color: "var(--text-4)", borderTop: "1px solid var(--border)" }}
        >
          Modus · deterministic mock fallback when live providers unavailable
        </footer>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#07080a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  color: "#f9f9f9",
  padding: "7px 10px",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9px] font-mono uppercase tracking-widest mb-1"
      style={{ color: "var(--text-4)" }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[9px] uppercase tracking-widest"
        style={{ color: "var(--text-4)" }}
      >
        {label}
      </div>
      <div
        className="text-[16px] font-semibold"
        style={{ color: dim ? "var(--text-3)" : "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function LastRoundDelta({
  base,
  lastRound,
}: {
  base: number;
  lastRound: number;
}) {
  const delta = (base - lastRound) / lastRound;
  const up = delta >= 0;
  const color = up ? "var(--success)" : "var(--accent)";
  const sign = up ? "▲" : "▼";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color,
      }}
      title={`Base fair value vs last round post-money (${fmtMoney(lastRound)})`}
    >
      <span>{sign}</span>
      <span>{(delta * 100).toFixed(1)}%</span>
      <span style={{ color: "var(--text-4)" }}>vs last round</span>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center shadow-btn"
        style={{ background: "#18191a" }}
      >
        <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
          M
        </span>
      </div>
      <span
        className="text-[15px] font-semibold tracking-tight"
        style={{ color: "var(--text)" }}
      >
        Modus
      </span>
    </div>
  );
}

const QUICK_START: { name: string; sector: string; icon: string }[] = [
  { name: "OpenAI", sector: "AI / SaaS", icon: "AI" },
  { name: "Stripe", sector: "Fintech", icon: "FN" },
  { name: "Snowflake", sector: "Cloud / SaaS", icon: "SF" },
  { name: "SpaceX", sector: "Deep Tech", icon: "SX" },
  { name: "Databricks", sector: "AI / Data", icon: "DB" },
  { name: "Canva", sector: "Consumer", icon: "CV" },
];

function EmptyState({ onSearch }: { onSearch: (name: string) => void }) {
  return (
    <div
      className="shadow-ring rounded-2xl relative overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div
        className="stripes absolute inset-0 pointer-events-none opacity-30"
        style={{
          maskImage: "radial-gradient(ellipse at top, black 0%, transparent 60%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at top, black 0%, transparent 60%)",
        }}
      />

      <div className="relative p-8 pb-4 text-center">
        <div
          className="text-[10px] font-mono uppercase tracking-widest mb-2"
          style={{ color: "var(--text-4)" }}
        >
          ready to audit
        </div>
        <h2
          className="text-[20px] font-semibold tracking-tight mb-1"
          style={{ color: "var(--text)" }}
        >
          Research any company
        </h2>
        <p className="text-[12px] mb-1" style={{ color: "var(--text-3)" }}>
          Type a name in the sidebar or pick one below to get started.
        </p>
        <p
          className="text-[10px] font-mono"
          style={{ color: "var(--text-4)" }}
        >
          press{" "}
          <kbd
            className="px-1.5 py-0.5 rounded shadow-key"
            style={{ color: "var(--text-3)" }}
          >
            ⌘K
          </kbd>{" "}
          to jump anywhere
        </p>
      </div>

      <div className="relative px-6 pb-6">
        <div
          className="text-[9px] font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--text-4)" }}
        >
          quick start
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {QUICK_START.map((co) => (
            <button
              key={co.name}
              onClick={() => onSearch(co.name)}
              className="group rounded-xl p-3 text-left transition-all hover:scale-[1.02]"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold font-mono"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--border)",
                    color: "var(--text-3)",
                  }}
                >
                  {co.icon}
                </div>
                <div
                  className="text-[13px] font-semibold group-hover:opacity-80 transition-opacity"
                  style={{ color: "var(--text)" }}
                >
                  {co.name}
                </div>
              </div>
              <div
                className="text-[10px] font-mono"
                style={{ color: "var(--text-4)" }}
              >
                {co.sector}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative px-6 py-4 flex items-center gap-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex gap-5">
          {[
            { label: "Comps", color: "#55b3ff" },
            { label: "DCF", color: "#5fc992" },
            { label: "Last Round", color: "#ffbc33" },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: m.color, opacity: 0.7 }}
              />
              <span
                className="text-[10px] font-mono"
                style={{ color: "var(--text-4)" }}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>
        <div
          className="ml-auto text-[10px] font-mono"
          style={{ color: "var(--text-4)" }}
        >
          3 valuation methods blended
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div
        className="shadow-ring rounded-2xl p-7 relative overflow-hidden"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Loader2
            size={12}
            className="animate-spin"
            style={{ color: "var(--info)" }}
          />
          <div
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: "var(--info)" }}
          >
            running comps · dcf · last round
          </div>
        </div>
        <SkeletonBar width="60%" height={28} />
        <div className="h-5" />
        <SkeletonBar width="40%" height={34} />
        <div className="h-6" />
        <SkeletonBar width="100%" height={160} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="shadow-ring rounded-2xl p-5"
            style={{ background: "var(--surface)" }}
          >
            <SkeletonBar width="55%" height={10} />
            <div className="h-3" />
            <SkeletonBar width="80%" height={16} />
            <div className="h-5" />
            <div className="grid grid-cols-3 gap-2">
              <SkeletonBar height={38} />
              <SkeletonBar height={38} />
              <SkeletonBar height={38} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBar({
  width = "100%",
  height = 12,
}: {
  width?: string | number;
  height?: number;
}) {
  return (
    <div
      className="skeleton-shimmer rounded"
      style={{
        width,
        height,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 100%)",
        backgroundSize: "200% 100%",
      }}
    />
  );
}

function ResearchPreview({
  result,
  query,
  onAccept,
  onDismiss,
}: {
  result: ResearchResult;
  query: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const inp = result.input;
  const conf = result.confidence;
  const isLow = conf < 0.5;
  const noData = conf === 0;

  return (
    <div
      className="mt-2 rounded-lg overflow-hidden"
      style={{
        background: "var(--surface-2)",
        border: `1px solid ${noData ? "var(--border)" : isLow ? "rgba(255,188,51,0.25)" : "rgba(95,201,146,0.25)"}`,
      }}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
              {inp.name}
            </div>
            {inp.name.toLowerCase() !== query.toLowerCase() && (
              <div className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
                searched "{query}"
              </div>
            )}
          </div>
          <div
            className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
            style={{
              color: noData ? "var(--text-4)" : isLow ? "var(--warning)" : "var(--success)",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
            }}
          >
            {noData ? "no data" : `${(conf * 100).toFixed(0)}%`}
          </div>
        </div>

        {!noData && (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
              <PreviewField label="Revenue" value={fmtMoney(inp.ltm_revenue)} />
              <PreviewField label="Growth" value={fmtPercent(inp.revenue_growth)} />
              <PreviewField label="EBIT" value={fmtPercent(inp.ebit_margin)} />
              <PreviewField label="Sector" value={inp.sector} />
              {inp.last_round_post_money != null && (
                <PreviewField label="Last round" value={fmtMoney(inp.last_round_post_money)} />
              )}
            </div>
            <div className="text-[9px] font-mono" style={{ color: "var(--text-4)" }}>
              via {result.provider} · {result.sources.length} citation{result.sources.length !== 1 ? "s" : ""}
            </div>
          </>
        )}

        {noData && (
          <div className="text-[10px]" style={{ color: "var(--text-4)" }}>
            No live data found. You can accept to use the name with default values, or dismiss.
          </div>
        )}
      </div>

      <div
        className="flex"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-opacity hover:opacity-80"
          style={{ color: "var(--success)" }}
        >
          <Check size={12} />
          {noData ? "Use name" : "Use these values"}
        </button>
        <div style={{ width: 1, background: "var(--border)" }} />
        <button
          onClick={onDismiss}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-opacity hover:opacity-80"
          style={{ color: "var(--text-4)" }}
        >
          <X size={12} />
          Dismiss
        </button>
      </div>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--text-4)" }}>{label} </span>
      <span style={{ color: "var(--text-2)" }}>{value}</span>
    </div>
  );
}

function ActiveResearchBadge({
  result,
  onClear,
}: {
  result: ResearchResult;
  onClear: () => void;
}) {
  const conf = result.confidence;
  const isLow = conf < 0.5;
  const color = isLow ? "var(--warning)" : "var(--success)";

  return (
    <div
      className="mt-2 rounded-lg p-2.5 flex items-center gap-2"
      style={{
        background: "var(--surface-2)",
        border: `1px solid ${isLow ? "rgba(255,188,51,0.15)" : "rgba(95,201,146,0.15)"}`,
      }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate" style={{ color: "var(--text-2)" }}>
          {result.input.name}
        </div>
        <div className="text-[9px] font-mono" style={{ color: "var(--text-4)" }}>
          {isLow ? "unverified" : "researched"} · {result.provider} · {(conf * 100).toFixed(0)}%
        </div>
      </div>
      <button
        onClick={onClear}
        className="shrink-0 p-1 rounded hover:opacity-60 transition-opacity"
        style={{ color: "var(--text-4)" }}
        title="Clear research and revert to fixture"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function SearchingHero({ query, phase }: { query: string; phase: number }) {
  const current = SEARCH_PHASES[phase] ?? SEARCH_PHASES[0];
  const progress = ((phase + 1) / SEARCH_PHASES.length) * 100;

  return (
    <div
      className="shadow-ring rounded-2xl relative overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div
        className="stripes absolute inset-0 pointer-events-none opacity-20"
        style={{
          maskImage: "radial-gradient(ellipse at top, black 0%, transparent 60%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at top, black 0%, transparent 60%)",
        }}
      />

      <div className="relative p-10 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: "var(--info)" }}
          />
          <div
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: "var(--info)" }}
          >
            researching
          </div>
        </div>

        <h2
          className="text-[24px] font-semibold tracking-tight mb-2"
          style={{ color: "var(--text)" }}
        >
          {query}
        </h2>

        <div
          className="text-[13px] mb-8"
          style={{ color: "var(--text-3)" }}
        >
          <span className="inline-block animate-pulse">{current.icon}</span>{" "}
          {current.label}
        </div>

        <div className="max-w-xs mx-auto space-y-3">
          {SEARCH_PHASES.map((p, i) => {
            const done = i < phase;
            const active = i === phase;
            return (
              <div
                key={i}
                className="flex items-center gap-3 transition-all duration-300"
                style={{ opacity: done ? 0.35 : active ? 1 : 0.12 }}
              >
                <div className="w-5 text-center">
                  {done ? (
                    <Check size={12} style={{ color: "var(--success)" }} />
                  ) : active ? (
                    <Loader2
                      size={12}
                      className="animate-spin"
                      style={{ color: "var(--info)" }}
                    />
                  ) : (
                    <div
                      className="w-1.5 h-1.5 rounded-full mx-auto"
                      style={{ background: "var(--text-4)" }}
                    />
                  )}
                </div>
                <span
                  className="text-[12px] font-mono"
                  style={{
                    color: active ? "var(--text)" : "var(--text-4)",
                  }}
                >
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>

        <div
          className="mt-8 h-1 rounded-full overflow-hidden max-w-xs mx-auto"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${progress}%`,
              background: "var(--info)",
              opacity: 0.6,
            }}
          />
        </div>

        <div
          className="mt-3 text-[10px] font-mono"
          style={{ color: "var(--text-4)" }}
        >
          checking yfinance · octagon · firecrawl
        </div>
      </div>
    </div>
  );
}

function SearchingIndicator({ query, phase }: { query: string; phase: number }) {
  const current = SEARCH_PHASES[phase] ?? SEARCH_PHASES[0];
  return (
    <div
      className="mt-2 rounded-lg p-3 space-y-2.5"
      style={{
        background: "var(--surface-2)",
        border: "1px solid rgba(85,179,255,0.15)",
      }}
    >
      <div className="flex items-center gap-2">
        <Loader2
          size={12}
          className="animate-spin shrink-0"
          style={{ color: "var(--info)" }}
        />
        <div
          className="text-[12px] font-medium truncate"
          style={{ color: "var(--text)" }}
        >
          Researching{" "}
          <span style={{ color: "var(--info)" }}>{query}</span>
        </div>
      </div>

      <div className="space-y-1">
        {SEARCH_PHASES.map((p, i) => {
          const done = i < phase;
          const active = i === phase;
          return (
            <div
              key={i}
              className="flex items-center gap-2 transition-opacity duration-300"
              style={{ opacity: done ? 0.4 : active ? 1 : 0.15 }}
            >
              <div className="w-4 text-center text-[10px]">
                {done ? (
                  <Check size={10} style={{ color: "var(--success)" }} />
                ) : active ? (
                  <span className="inline-block animate-pulse">{p.icon}</span>
                ) : (
                  <span style={{ color: "var(--text-4)" }}>·</span>
                )}
              </div>
              <span
                className="text-[10px] font-mono"
                style={{
                  color: active ? "var(--text-2)" : "var(--text-4)",
                }}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${((phase + 1) / SEARCH_PHASES.length) * 100}%`,
            background: "var(--info)",
            opacity: 0.6,
          }}
        />
      </div>
    </div>
  );
}
