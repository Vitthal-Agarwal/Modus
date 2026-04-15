"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, BarChart2, BookMarked, Brain, Check, CreditCard, Database, Download, FileText, Layers, Loader2, Palette, Play, Rocket, Search, X } from "lucide-react";

import { AuditTrailTimeline } from "@/components/AuditTrailTimeline";
import { CommandPalette } from "@/components/CommandPalette";
import { CrossCheckPanel } from "@/components/CrossCheckPanel";
import { MethodBreakdown } from "@/components/MethodBreakdown";
import { PortfolioNAVDashboard } from "@/components/PortfolioNAVDashboard";
import { ResearchStreamVisualizer, type StreamEvent } from "@/components/ResearchStreamVisualizer";
import { ScenarioDiffModal } from "@/components/ScenarioDiffModal";
import { ScenarioList } from "@/components/ScenarioList";
import { ScenarioSaveBar } from "@/components/ScenarioSaveBar";
import { SensitivityHeatmap } from "@/components/SensitivityHeatmap";
import { TerminalClock } from "@/components/TerminalClock";
import { ValuationKPICards } from "@/components/ValuationKPICards";
import { ValuationRangeChart } from "@/components/ValuationRangeChart";
import { WaterfallChart } from "@/components/WaterfallChart";
import { BentoGrid, type BentoItem } from "@/components/ui/bento-grid";
import { TimelineRail, type RailStep } from "@/components/ui/timeline";
import {
  type Citation,
  type CompanyFixture,
  type PortfolioNAVResponse,
  type ResearchResult,
  type ScenarioDiff,
  type ScenarioMeta,
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
  const [pipelinePhase, setPipelinePhase] = useState<"idle" | "researching" | "research_done" | "auditing" | "done">("idle");
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const phaseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"audit" | "portfolio">("audit");

  // Scenario persistence
  const [currentScenarioId, setCurrentScenarioId] = useState<number | null>(null);
  const [diffCandidateId, setDiffCandidateId] = useState<number | null>(null);
  const [activeDiff, setActiveDiff] = useState<ScenarioDiff | null>(null);

  // Portfolio NAV
  const [portfolioData, setPortfolioData] = useState<PortfolioNAVResponse | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

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
    setSelectedKey("");
    setPipelinePhase("idle");

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

  const researchAndValue = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchPhase(0);
    setLoading(false);
    setError(null);
    setResult(null);
    setPendingResearch(null);
    setActiveResearch(null);
    setSelectedKey("");
    setPipelinePhase("researching");
    setStreamEvents([]);

    // Close any previous SSE stream
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    if (phaseTimer.current) clearInterval(phaseTimer.current);
    phaseTimer.current = setInterval(() => {
      setSearchPhase((p) => Math.min(p + 1, SEARCH_PHASES.length - 1));
    }, 2000);

    let researchData: ResearchResult | null = null;

    // Use SSE streaming endpoint
    await new Promise<void>((resolve) => {
      const es = new EventSource(`/api/research/stream?q=${encodeURIComponent(query)}`);
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data) as StreamEvent;
          setStreamEvents((prev) => [...prev, event]);

          if (event.type === "done") {
            researchData = event.result as ResearchResult;
            es.close();
            esRef.current = null;
            resolve();
          } else if (event.type === "error") {
            setError((event as { type: "error"; message: string }).message || "Research failed");
            es.close();
            esRef.current = null;
            resolve();
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        setError("Research stream disconnected");
        es.close();
        esRef.current = null;
        resolve();
      };
    });

    if (phaseTimer.current) clearInterval(phaseTimer.current);
    phaseTimer.current = null;
    setSearching(false);
    setSearchPhase(0);

    if (!researchData) { setPipelinePhase("idle"); return; }

    setForm((researchData as ResearchResult).input);
    setActiveResearch(researchData as ResearchResult);
    setPipelinePhase("research_done");

    await new Promise((r) => setTimeout(r, 600));

    setPipelinePhase("auditing");
    setLoading(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify((researchData as ResearchResult).input),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.hint || data.error || "Audit failed");
      } else {
        setResult(data);
        setPipelinePhase("done");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const dismissResearch = useCallback(() => {
    setPendingResearch(null);
    setActiveResearch(null);
  }, []);

  const clearResearch = useCallback(() => {
    setActiveResearch(null);
    setSearchQuery("");
    setPipelinePhase("idle");
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
    setPipelinePhase("idle");
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

  // Scenario persistence callbacks
  const onScenarioSaved = useCallback((meta: ScenarioMeta) => {
    setCurrentScenarioId(meta.id);
  }, []);

  const loadScenario = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/scenarios/id/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setResult(data as ValuationOutput);
        setCurrentScenarioId(id);
      }
    } catch {
      // ignore
    }
  }, []);

  const requestDiff = useCallback(async (idA: number, idB: number) => {
    try {
      const res = await fetch(`/api/scenarios/diff/${idA}/${idB}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setActiveDiff(data as ScenarioDiff);
    } catch {
      // ignore
    }
  }, []);

  // Portfolio NAV callbacks
  const loadPortfolioNAV = useCallback(async () => {
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const res = await fetch("/api/portfolio/nav", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setPortfolioData(data as PortfolioNAVResponse);
      } else {
        setPortfolioError(data.detail || data.error || "Portfolio load failed");
      }
    } catch (e) {
      setPortfolioError(String(e));
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  const selectPortfolioCompany = useCallback((key: string, valuation: ValuationOutput) => {
    setResult(valuation);
    setSelectedKey(key);
    setCurrentScenarioId(null);
    setViewMode("audit");
  }, []);

  // Load portfolio data when switching to portfolio view
  useEffect(() => {
    if (viewMode === "portfolio" && !portfolioData) {
      loadPortfolioNAV();
    }
  }, [viewMode, portfolioData, loadPortfolioNAV]);

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
      {activeDiff && (
        <ScenarioDiffModal
          diff={activeDiff}
          onClose={() => {
            setActiveDiff(null);
            setDiffCandidateId(null);
          }}
        />
      )}

      <div className="flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
        {/* Header — full width, compact */}
        <header
          className="shrink-0 z-40"
          style={{
            background: "rgba(7, 8, 10, 0.95)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="px-6 h-12 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div
                className="hidden sm:flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest"
                style={{ color: "var(--text-4)" }}
              >
                <span>VC AUDIT TERMINAL</span>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span>COMPS</span>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span>DCF</span>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span>LAST ROUND</span>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span>PREC. TXNS</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {result ? (
                <div
                  className="hidden sm:flex items-center gap-2 mr-1 text-[12px] font-semibold"
                  style={{ color: "var(--text)" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--terminal-green)" }} />
                  {result.company}
                </div>
              ) : (
                <span className="hidden sm:inline text-[11px] font-mono" style={{ color: "var(--text-4)" }}>
                  — READY —
                </span>
              )}
              {/* View toggle */}
              <div
                className="flex items-center gap-0.5 rounded-lg p-0.5"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
              >
                <button
                  onClick={() => setViewMode("audit")}
                  className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors"
                  style={{
                    background: viewMode === "audit" ? "var(--surface-2)" : "transparent",
                    color: viewMode === "audit" ? "var(--text)" : "var(--text-4)",
                  }}
                >
                  <BarChart2 size={10} /> Audit
                </button>
                <button
                  onClick={() => setViewMode("portfolio")}
                  className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors"
                  style={{
                    background: viewMode === "portfolio" ? "var(--surface-2)" : "transparent",
                    color: viewMode === "portfolio" ? "var(--text)" : "var(--text-4)",
                  }}
                >
                  <BookMarked size={10} /> Portfolio
                </button>
              </div>
              <TerminalClock />
              <button
                onClick={() => {
                  const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true });
                  window.dispatchEvent(ev);
                }}
                className="flex items-center gap-2 px-3 h-8 rounded-md transition-opacity hover:opacity-80"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-3)" }}
              >
                <Search size={12} />
                <span className="text-[12px]">Search…</span>
                <kbd className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono shadow-key" style={{ color: "var(--text-3)" }}>⌘K</kbd>
              </button>
              {result && (
                <button
                  onClick={downloadJson}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-md transition-opacity hover:opacity-80"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-2)" }}
                >
                  <Download size={12} />
                  <span className="text-[12px]">JSON</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
          {/* Sidebar */}
          <aside
            className="shrink-0 overflow-y-auto"
            style={{
              width: 360,
              borderRight: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div className="p-6 space-y-6">
              <div
                className="text-[13px] font-bold uppercase tracking-widest"
                style={{ color: "var(--text)" }}
              >
                PORTFOLIO COMPANY
              </div>

              <div className="mb-4">
                <Label>Research any company</Label>
                <CompanySearchInput
                  value={searchQuery}
                  onChange={(v) => {
                    setSearchQuery(v);
                    if (pendingResearch) setPendingResearch(null);
                  }}
                  onSearch={searchCompany}
                  onResearchAndValue={researchAndValue}
                  fixtureNames={Object.values(fixtures).map((f) => f.name)}
                  searching={searching}
                  loading={loading}
                  pendingResearch={!!pendingResearch}
                />
                {!searching && !pendingResearch && searchQuery.trim() && (
                  <button
                    disabled={loading}
                    onClick={() => researchAndValue(searchQuery)}
                    className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-mono transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{
                      background: "rgba(95,201,146,0.08)",
                      border: "1px solid rgba(95,201,146,0.2)",
                      color: "var(--success)",
                    }}
                  >
                    <Play size={10} />
                    Research & Value in one click
                    <kbd className="ml-1 px-1 py-0.5 rounded text-[8px] shadow-key" style={{ color: "var(--text-4)" }}>
                      Shift+Enter
                    </kbd>
                  </button>
                )}

                {searching && streamEvents.length === 0 && (
                  <SearchingIndicator query={searchQuery} phase={searchPhase} />
                )}
                {searching && streamEvents.length > 0 && (
                  <div
                    className="mt-2 rounded-lg px-3 py-2 flex items-center gap-2"
                    style={{ background: "rgba(0,232,120,0.06)", border: "1px solid rgba(0,232,120,0.12)" }}
                  >
                    <div className="w-1 h-1 rounded-full pulse-dot shrink-0" style={{ background: "var(--terminal-green)" }} />
                    <span className="text-[10px] font-mono" style={{ color: "var(--terminal-green)" }}>
                      {streamEvents.filter(e => e.type === "provider_hit").length > 0
                        ? `${streamEvents.filter(e => e.type === "provider_hit")[0].provider} · researching`
                        : "live · " + streamEvents.length + " events"}
                    </span>
                  </div>
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

              <div
                className="space-y-4 transition-opacity duration-200"
                style={{ opacity: pendingResearch || searching ? 0.3 : 1, pointerEvents: pendingResearch || searching ? "none" : "auto" }}
              >
                {pendingResearch && (
                  <div
                    className="text-[10px] font-mono px-2 py-1.5 rounded-md mb-1"
                    style={{ background: "rgba(85,179,255,0.06)", color: "var(--info)", border: "1px solid rgba(85,179,255,0.12)" }}
                  >
                    Accept research to update these fields
                  </div>
                )}
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
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg h-10 text-[14px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed shadow-btn"
                style={{ background: "hsla(0,0%,100%,0.9)", color: "#18191a" }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />}
                {loading ? "Running audit…" : "Run audit"}
              </button>

              {error && (
                <div
                  className="rounded-lg p-4 text-[13px] flex items-start gap-2"
                  style={{ background: "rgba(255,99,99,0.06)", border: "1px solid rgba(255,99,99,0.2)", color: "var(--text-2)" }}
                >
                  <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                  <div>
                    <div className="font-semibold mb-1" style={{ color: "var(--text)" }}>Audit failed</div>
                    <div className="font-mono text-[12px]">{error}</div>
                  </div>
                </div>
              )}

              {result && (
                <>
                  <ScenarioSaveBar result={result} onSaved={onScenarioSaved} />
                  <ScenarioList
                    company={result.company}
                    currentScenarioId={currentScenarioId}
                    onLoad={loadScenario}
                    onSelectForDiff={setDiffCandidateId}
                    diffCandidateId={diffCandidateId}
                    onRequestDiff={requestDiff}
                  />
                </>
              )}

              <div className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>
                <kbd className="px-1.5 py-0.5 rounded shadow-key" style={{ color: "var(--text-3)" }}>⌘K</kbd>
                {" "}jump · load · run · export
              </div>
            </div>
          </aside>

          {/* Main content */}
          <section className="flex-1 flex flex-col overflow-y-auto p-6" style={{ minWidth: 0, gap: "1.25rem" }}>
            {viewMode === "portfolio" ? (
              portfolioLoading ? (
                <LoadingState />
              ) : portfolioError ? (
                <div
                  className="rounded-lg p-4 text-[13px] flex items-start gap-2"
                  style={{ background: "rgba(255,99,99,0.06)", border: "1px solid rgba(255,99,99,0.2)", color: "var(--text-2)" }}
                >
                  <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                  <div>
                    <div className="font-semibold mb-1" style={{ color: "var(--text)" }}>Portfolio load failed</div>
                    <div className="font-mono text-[12px]">{portfolioError}</div>
                  </div>
                </div>
              ) : portfolioData ? (
                <PortfolioNAVDashboard data={portfolioData} onSelectCompany={selectPortfolioCompany} />
              ) : null
            ) : (
              <>
            {!result && !loading && !searching && !pendingResearch && pipelinePhase === "idle" && (
              <EmptyState
                onSearch={(name) => {
                  setSearchQuery(name);
                  searchCompany(name);
                }}
                onResearchAndValue={(name) => {
                  setSearchQuery(name);
                  researchAndValue(name);
                }}
              />
            )}
            {!result && !loading && searching && (
              <ResearchStreamVisualizer query={searchQuery} events={streamEvents} />
            )}
            {!result && !loading && !searching && pendingResearch && (
              <ResearchProfileCard
                result={pendingResearch}
                query={searchQuery}
                onAccept={acceptResearch}
                onDismiss={dismissResearch}
              />
            )}

            {pipelinePhase !== "idle" && pipelinePhase !== "researching" && (
              <PipelineStepper phase={pipelinePhase} research={activeResearch} />
            )}

            {loading && <LoadingState />}

            {result && (
              <div className="space-y-5">
                {activeResearch && activeResearch.confidence > 0 && (
                  <ResearchSummaryBanner research={activeResearch} />
                )}

                <div
                  id="summary"
                  className="hero-fade-in rounded-lg relative overflow-hidden"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {/* terminal grid background */}
                  <div className="terminal-grid absolute inset-0 pointer-events-none opacity-40" />

                  {/* header bar — Bloomberg style */}
                  <div
                    className="relative flex items-center justify-between px-5 py-2.5"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--terminal-green)" }} />
                      <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "var(--text-4)" }}>
                        {result.sector.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {form.last_round_post_money != null && (
                        <LastRoundDelta
                          base={result.fair_value.base}
                          lastRound={form.last_round_post_money}
                        />
                      )}
                      <span className="text-[9px] font-mono" style={{ color: "var(--text-4)" }}>
                        as of {result.as_of}
                      </span>
                    </div>
                  </div>

                  <div className="relative p-5 pb-4">
                    {/* company name */}
                    <div
                      className="text-[12px] font-mono uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-3)" }}
                    >
                      VALUATION AUDIT
                    </div>
                    <h2
                      className="text-[22px] font-semibold tracking-tight mb-4"
                      style={{ color: "var(--text)" }}
                    >
                      {result.company}
                    </h2>

                    {/* price ticker row */}
                    <div
                      className="grid grid-cols-3 gap-px mb-4 rounded overflow-hidden"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <TickerCell label="LOW" value={fmtMoney(result.fair_value.low)} dim />
                      <TickerCell label="FAIR VALUE · BASE" value={fmtMoney(result.fair_value.base)} highlight />
                      <TickerCell label="HIGH" value={fmtMoney(result.fair_value.high)} dim />
                    </div>

                    <ValuationRangeChart
                      fairValue={result.fair_value}
                      methods={result.methods}
                    />
                  </div>
                </div>

                <ValuationKPICards
                  fairValue={result.fair_value}
                  methods={result.methods}
                  company={result.company}
                  lastRound={form.last_round_post_money}
                />

                <div
                  id="methods"
                  className={`grid grid-cols-1 gap-4 ${
                    result.methods.filter((m) => m.range.base > 0).length <= 2
                      ? "md:grid-cols-2"
                      : result.methods.filter((m) => m.range.base > 0).length === 3
                        ? "md:grid-cols-3"
                        : "md:grid-cols-2 lg:grid-cols-4"
                  }`}
                >
                  {result.methods
                    .filter((m) => m.range.base > 0)
                    .map((m) => (
                      <MethodBreakdown key={m.method} method={m} />
                    ))}
                </div>

                <div
                  className="shadow-ring rounded-2xl p-6"
                  style={{ background: "var(--surface)" }}
                >
                  <div
                    className="text-[11px] font-mono uppercase tracking-wider mb-4"
                    style={{ color: "var(--text-3)" }}
                  >
                    Aggregation waterfall
                  </div>
                  <WaterfallChart
                    fairValue={result.fair_value}
                    methods={result.methods}
                  />
                </div>

                <SensitivityHeatmap steps={result.audit_trail} />

                <CrossCheckPanel form={form} />

                <div
                  className="shadow-ring rounded-2xl p-6"
                  style={{ background: "var(--surface)" }}
                >
                  <AuditTrailTimeline steps={result.audit_trail} />
                </div>
              </div>
            )}
              </>
            )}
          </section>
        </main>
      </div>
    </>
  );
}

function fmtCitationValue(field: string, value: number | string): string {
  if (typeof value === "string") return value;
  const f = field.toLowerCase();
  if (f.includes("revenue") && !f.includes("growth")) return fmtMoney(value);
  if (f.includes("post_money") || f.includes("valuation") || f.includes("round")) return fmtMoney(value);
  if (f.includes("growth") || f.includes("margin")) return fmtPercent(value);
  if (Math.abs(value) >= 1e6) return fmtMoney(value);
  return String(value);
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--text)",
  padding: "9px 12px",
  fontSize: 14,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase tracking-widest mb-2"
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

const BENTO_COMPANIES: BentoItem[] = [
  {
    title: "OpenAI",
    meta: "~$157B",
    description: "Leading AI lab behind GPT-4, DALL-E, and Sora",
    icon: <Brain className="w-4 h-4 text-emerald-400" />,
    status: "AI / SaaS",
    tags: ["LLM", "API"],
    colSpan: 2,
    hasPersistentHover: true,
    cta: "Research & Audit →",
  },
  {
    title: "Stripe",
    meta: "~$65B",
    description: "Global payments infrastructure for the internet",
    icon: <CreditCard className="w-4 h-4 text-violet-400" />,
    status: "Fintech",
    tags: ["Payments", "API"],
    cta: "Research & Audit →",
  },
  {
    title: "Databricks",
    meta: "~$62B",
    description: "Unified data & AI platform on the lakehouse",
    icon: <Database className="w-4 h-4 text-red-400" />,
    status: "AI / Data",
    tags: ["Spark", "ML"],
    colSpan: 2,
    cta: "Research & Audit →",
  },
  {
    title: "Snowflake",
    meta: "~$14B",
    description: "Cloud data warehouse and collaboration platform",
    icon: <Layers className="w-4 h-4 text-sky-400" />,
    status: "Cloud Data",
    tags: ["SQL", "Cloud"],
    cta: "Research & Audit →",
  },
  {
    title: "SpaceX",
    meta: "~$350B",
    description: "Reusable rockets, Starlink, and Mars ambitions",
    icon: <Rocket className="w-4 h-4 text-slate-300" />,
    status: "Deep Tech",
    tags: ["Aerospace"],
    cta: "Research & Audit →",
  },
  {
    title: "Canva",
    meta: "~$26B",
    description: "Design platform empowering 190M+ creators",
    icon: <Palette className="w-4 h-4 text-purple-400" />,
    status: "SaaS",
    tags: ["Design", "PLG"],
    cta: "Research & Audit →",
  },
  {
    title: "Notion",
    meta: "~$10B",
    description: "Workspace platform blending docs, wikis, and project planning",
    icon: <FileText className="w-4 h-4 text-stone-300" />,
    status: "SaaS",
    tags: ["Collab", "Productivity"],
    cta: "Research & Audit →",
  },
];

function EmptyState({ onSearch, onResearchAndValue }: { onSearch: (name: string) => void; onResearchAndValue: (name: string) => void }) {
  const bentoItems = BENTO_COMPANIES.map((item) => ({
    ...item,
    onSelect: () => onResearchAndValue(item.title),
  }));

  return (
    <div
      className="flex-1 flex flex-col shadow-ring rounded-2xl relative overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div
        className="stripes absolute inset-0 pointer-events-none opacity-30"
        style={{
          maskImage: "radial-gradient(ellipse at top, black 0%, transparent 60%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 0%, transparent 60%)",
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
          className="text-[24px] font-semibold tracking-tight mb-1"
          style={{ color: "var(--text)" }}
        >
          Research any company
        </h2>
        <p className="text-[13px] mb-1" style={{ color: "var(--text-3)" }}>
          Type a name in the sidebar or pick one below to get started.
        </p>
        <p className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>
          press{" "}
          <kbd className="px-1.5 py-0.5 rounded shadow-key" style={{ color: "var(--text-3)" }}>
            ⌘K
          </kbd>{" "}
          to jump anywhere
        </p>
      </div>

      <div className="relative flex-1 px-6 pb-4 flex flex-col justify-center min-h-0">
        <div
          className="text-[9px] font-mono uppercase tracking-widest mb-3"
          style={{ color: "var(--text-4)" }}
        >
          quick start
        </div>
        <BentoGrid items={bentoItems} />
      </div>

      <div
        className="relative shrink-0 px-6 py-4 flex items-center gap-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex gap-5">
          {[
            { label: "Comps", color: "#55b3ff" },
            { label: "DCF", color: "#5fc992" },
            { label: "Last Round", color: "#ffbc33" },
            { label: "Precedent Txns", color: "#c084fc" },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: m.color, opacity: 0.7 }} />
              <span className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
        <div className="ml-auto text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
          4 valuation methods blended
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
            running comps · dcf · last round · precedent txns
          </div>
        </div>
        <SkeletonBar width="60%" height={28} />
        <div className="h-5" />
        <SkeletonBar width="40%" height={34} />
        <div className="h-6" />
        <SkeletonBar width="100%" height={160} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
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

function ResearchProfileCard({
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
  const noData = conf === 0;
  const isLow = conf < 0.5;
  const confColor = noData
    ? "var(--text-4)"
    : isLow
      ? "var(--warning)"
      : "var(--success)";

  const defaulted = new Set(
    result.sources
      .filter((c) => c.source === "default")
      .map((c) => c.field),
  );
  const hasDefaults = defaulted.size > 0;

  const metrics = [
    { label: "LTM Revenue", value: fmtMoney(inp.ltm_revenue), icon: "💰", field: "ltm_revenue" },
    { label: "Revenue Growth", value: fmtPercent(inp.revenue_growth), icon: "📈", field: "revenue_growth" },
    { label: "EBIT Margin", value: fmtPercent(inp.ebit_margin), icon: "📊", field: "ebit_margin" },
    { label: "Sector", value: inp.sector.replace(/_/g, " "), icon: "🏷", field: "sector" },
  ];
  if (inp.last_round_post_money != null) {
    metrics.push({
      label: "Last Round",
      value: fmtMoney(inp.last_round_post_money),
      icon: "🏦",
      field: "last_round_post_money",
    });
  }

  return (
    <div
      className="hero-fade-in shadow-ring rounded-2xl relative overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div
        className="stripes absolute inset-0 pointer-events-none opacity-20"
        style={{
          maskImage: "radial-gradient(ellipse at top right, black 0%, transparent 50%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at top right, black 0%, transparent 50%)",
        }}
      />

      <div className="relative p-7">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-1"
              style={{ color: "var(--info)" }}
            >
              research result
            </div>
            <h2
              className="text-[28px] font-semibold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              {inp.name}
            </h2>
            {inp.name.toLowerCase() !== query.toLowerCase() && (
              <div
                className="text-[11px] font-mono mt-0.5"
                style={{ color: "var(--text-4)" }}
              >
                matched from "{query}"
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: confColor }}
              />
              <span
                className="text-[11px] font-mono"
                style={{ color: confColor }}
              >
                {noData ? "no data" : `${(conf * 100).toFixed(0)}% confidence`}
              </span>
            </div>
            <div
              className="text-[10px] font-mono"
              style={{ color: "var(--text-4)" }}
            >
              via {result.provider}
            </div>
          </div>
        </div>

        {noData ? (
          <div
            className="rounded-xl p-6 text-center mb-6"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed var(--border)",
            }}
          >
            <div className="text-[14px] mb-1" style={{ color: "var(--text-3)" }}>
              No financial data found for this company
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
              You can still accept to use the name and fill in values manually, or try a different search.
            </div>
          </div>
        ) : (
          <>
            {hasDefaults && (
              <div
                className="mb-5 rounded-xl p-4 flex items-start gap-3"
                style={{
                  background: "rgba(255,188,51,0.06)",
                  border: "1px solid rgba(255,188,51,0.25)",
                }}
              >
                <AlertCircle
                  size={16}
                  className="shrink-0 mt-0.5"
                  style={{ color: "var(--warning)" }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[12px] font-semibold mb-1"
                    style={{ color: "var(--warning)" }}
                  >
                    {defaulted.size} field{defaulted.size !== 1 ? "s" : ""} using placeholder values
                  </div>
                  <div
                    className="text-[11px] leading-relaxed"
                    style={{ color: "var(--text-3)" }}
                  >
                    Research did not find{" "}
                    {[...defaulted]
                      .map((f) => f.replace(/_/g, " "))
                      .join(", ")}
                    . Placeholders are shown below — review and edit them in the sidebar before running the audit, or try a more specific search term (e.g. a company name, not a URL).
                  </div>
                </div>
              </div>
            )}

            {/* Metrics grid */}
            <div
              className={`grid gap-3 mb-6 ${metrics.length > 4 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}
            >
              {metrics.map((m) => {
                const isDefault = defaulted.has(m.field);
                return (
                  <div
                    key={m.label}
                    className="rounded-xl p-4 relative"
                    style={{
                      background: isDefault
                        ? "rgba(255,188,51,0.04)"
                        : "rgba(255,255,255,0.02)",
                      border: isDefault
                        ? "1px dashed rgba(255,188,51,0.35)"
                        : "1px solid var(--border)",
                    }}
                    title={isDefault ? "Placeholder value — not found in research" : undefined}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[11px]">{m.icon}</span>
                      <span
                        className="text-[9px] font-mono uppercase tracking-widest"
                        style={{ color: "var(--text-4)" }}
                      >
                        {m.label}
                      </span>
                      {isDefault && (
                        <span
                          className="text-[8px] font-mono uppercase tracking-widest ml-auto"
                          style={{ color: "var(--warning)" }}
                        >
                          default
                        </span>
                      )}
                    </div>
                    <div
                      className="text-[18px] font-semibold font-mono truncate"
                      style={{
                        color: isDefault ? "var(--text-3)" : "var(--text)",
                      }}
                      title={m.value}
                    >
                      {m.value}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Citations */}
            {result.sources.length > 0 && (
              <div className="mb-6">
                <div
                  className="text-[9px] font-mono uppercase tracking-widest mb-2"
                  style={{ color: "var(--text-4)" }}
                >
                  {result.sources.length} data source{result.sources.length !== 1 ? "s" : ""}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.sources.map((c, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ color: "var(--text-4)" }}>
                        {c.field.replace(/_/g, " ")}
                      </span>
                      <span style={{ color: "var(--text-2)" }}>
                        {fmtCitationValue(c.field, c.value)}
                      </span>
                      <span
                        className="px-1 py-0.5 rounded text-[9px]"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          color: c.source === "mock" ? "var(--warning)" : "var(--success)",
                        }}
                      >
                        {c.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div
          className="flex gap-3 pt-5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg h-10 text-[13px] font-semibold transition-opacity hover:opacity-80 shadow-btn"
            style={{
              background: "hsla(0,0%,100%,0.9)",
              color: "#18191a",
            }}
          >
            <Check size={14} />
            {noData ? "Use company name" : "Accept & load into form"}
          </button>
          <button
            onClick={onDismiss}
            className="px-5 flex items-center justify-center gap-2 rounded-lg h-10 text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-3)",
            }}
          >
            <X size={14} />
            Dismiss
          </button>
        </div>
      </div>
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

function PipelineStepper({
  phase,
  research,
}: {
  phase: "research_done" | "auditing" | "done";
  research: ResearchResult | null;
}) {
  const isResearchDone = phase === "research_done" || phase === "auditing" || phase === "done";
  const isAuditActive = phase === "auditing";
  const isAuditDone = phase === "done";

  const provider = research?.provider ?? "";
  const isClaudeAgent = provider === "claude-agent";
  const providerColor = isClaudeAgent ? "#c084fc" : "var(--success)";

  const steps: RailStep[] = [
    {
      label: "Research",
      sublabel: isResearchDone && provider
        ? (isClaudeAgent ? "▲ claude-agent" : provider)
        : undefined,
      status: isResearchDone ? "completed" : "active",
      color: isResearchDone ? "var(--success)" : "var(--info)",
    },
    {
      label: isAuditActive ? "Auditing…" : "Audit",
      sublabel: isAuditActive || isAuditDone ? "comps · dcf · last_round · prec_txns" : undefined,
      status: isAuditDone ? "completed" : isAuditActive ? "active" : "pending",
    },
    {
      label: "Complete",
      status: isAuditDone ? "completed" : "pending",
      color: isAuditDone ? "var(--terminal-green)" : undefined,
    },
  ];

  return (
    <div
      className="hero-fade-in rounded-lg px-5 py-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <TimelineRail steps={steps} />
    </div>
  );
}

function ResearchSummaryBanner({ research }: { research: ResearchResult }) {
  const inp = research.input;
  const conf = research.confidence;
  const isLow = conf < 0.5;
  const isClaudeAgent = research.provider === "claude-agent";
  const confColor = isLow ? "var(--warning)" : "var(--success)";
  const providerColor = isClaudeAgent ? "#c084fc" : confColor;

  return (
    <div
      id="research-summary"
      className="hero-fade-in rounded-lg p-4 relative overflow-hidden"
      style={{
        background: "var(--surface)",
        border: `1px solid ${providerColor}28`,
        borderLeft: `3px solid ${providerColor}`,
      }}
    >
      {/* subtle glow behind left border */}
      <div
        className="absolute inset-y-0 left-0 w-12 pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${providerColor}0a 0%, transparent 100%)` }}
      />

      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: providerColor }} />
          <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: providerColor }}>
            {isClaudeAgent ? "deep research via claude-agent-sdk" : "auto-researched profile"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{
              color: confColor,
              background: `${confColor}10`,
              border: `1px solid ${confColor}28`,
            }}
          >
            {(conf * 100).toFixed(0)}% conf
          </span>
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{
              color: providerColor,
              background: `${providerColor}10`,
              border: `1px solid ${providerColor}28`,
            }}
          >
            {research.provider}
          </span>
          <span className="text-[9px] font-mono" style={{ color: "var(--text-4)" }}>
            {research.sources.length}c
          </span>
        </div>
      </div>

      <div className="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2">
        <ResearchStat label="Revenue" value={fmtMoney(inp.ltm_revenue)} />
        <ResearchStat label="Growth" value={fmtPercent(inp.revenue_growth)} />
        <ResearchStat label="EBIT" value={fmtPercent(inp.ebit_margin)} />
        <ResearchStat label="Sector" value={inp.sector.replace(/_/g, " ")} />
        {inp.last_round_post_money != null && (
          <ResearchStat label="Last Round" value={fmtMoney(inp.last_round_post_money)} />
        )}
        {inp.last_round_date && (
          <ResearchStat label="Round Date" value={inp.last_round_date} />
        )}
      </div>

      {/* citation source badges */}
      {research.sources.length > 0 && (
        <div className="relative flex flex-wrap gap-1 mt-3 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          {research.sources.slice(0, 6).map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: c.source === "mock"
                  ? "var(--warning)"
                  : c.source === "claude-agent"
                    ? "#c084fc"
                    : "var(--success)",
              }}
            >
              {c.source}
              <span style={{ color: "var(--text-4)" }}>/{c.field.replace(/_/g, "_")}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ResearchStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
        {label}
      </div>
      <div className="text-[14px] font-semibold font-mono" style={{ color: "var(--text-2)" }}>
        {value}
      </div>
    </div>
  );
}

// ── Company autocomplete search input ────────────────────────────────────────

const KNOWN_COMPANIES = [
  // AI / LLMs
  "OpenAI", "Anthropic", "Cohere", "Mistral", "Perplexity", "Character.AI",
  "Stability AI", "Inflection AI", "xAI", "Scale AI", "Hugging Face",
  // Cloud / Data / Dev
  "Databricks", "Snowflake", "HashiCorp", "Grafana", "Vercel", "Netlify",
  "PlanetScale", "Neon", "Supabase", "Railway", "Render", "Fly.io",
  // Fintech
  "Stripe", "Brex", "Ramp", "Chime", "Revolut", "Klarna", "Plaid",
  "Checkout.com", "Nubank", "Affirm", "Marqeta", "Adyen",
  // SaaS / Productivity
  "Notion", "Linear", "Figma", "Canva", "Airtable", "Monday.com",
  "Coda", "Loom", "Miro", "Intercom", "Zendesk", "Freshdesk",
  // Sales / Marketing
  "HubSpot", "Salesforce", "Outreach", "Gong", "Apollo", "Clay",
  // Infra / Security
  "Cloudflare", "Fastly", "Wiz", "Lacework", "Snyk", "1Password",
  // Consumer / Social
  "Discord", "Reddit", "Pinterest", "Substack", "Beehiiv",
  // Deep Tech / Other
  "SpaceX", "Anduril", "Palantir", "Rippling", "Lattice", "Deel",
  "Gusto", "Rippling", "Remote", "Omnipresent",
  // Notable exits / late stage
  "Instacart", "Duolingo", "UiPath", "Asana", "Squarespace",
];

function CompanySearchInput({
  value,
  onChange,
  onSearch,
  onResearchAndValue,
  fixtureNames,
  searching,
  loading,
  pendingResearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (q: string) => void;
  onResearchAndValue: (q: string) => void;
  fixtureNames: string[];
  searching: boolean;
  loading: boolean;
  pendingResearch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allSuggestions = [...new Set([...fixtureNames, ...KNOWN_COMPANIES])];

  const suggestions =
    value.trim().length === 0
      ? []
      : allSuggestions
          .filter((n) => n.toLowerCase().includes(value.toLowerCase()))
          .sort((a, b) => {
            const al = a.toLowerCase().startsWith(value.toLowerCase()) ? 0 : 1;
            const bl = b.toLowerCase().startsWith(value.toLowerCase()) ? 0 : 1;
            return al - bl || a.localeCompare(b);
          })
          .slice(0, 7);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setCursor(-1);
    inputRef.current?.focus();
  };

  return (
    <div className="flex gap-1.5 relative">
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          type="text"
          placeholder="e.g. Stripe, Snowflake, OpenAI…"
          value={value}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            if (pendingResearch) onChange(e.target.value); // keep in sync
            setOpen(true);
            setCursor(-1);
          }}
          onFocus={() => { if (value.trim()) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (open && suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, suggestions.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, -1));
                return;
              }
              if (e.key === "Escape") {
                setOpen(false);
                setCursor(-1);
                return;
              }
              if (e.key === "Tab" && cursor >= 0) {
                e.preventDefault();
                pick(suggestions[cursor]);
                return;
              }
            }
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              const q = cursor >= 0 && open ? suggestions[cursor] : value;
              if (cursor >= 0 && open) onChange(q);
              onResearchAndValue(q);
            } else if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              const q = cursor >= 0 && open ? suggestions[cursor] : value;
              if (cursor >= 0 && open) onChange(q);
              else onSearch(q);
            }
          }}
          className="w-full text-[12px]"
          style={inputStyle}
        />

        {open && suggestions.length > 0 && (
          <ul
            ref={listRef}
            className="absolute left-0 right-0 top-full mt-0.5 rounded-lg overflow-hidden z-50"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {suggestions.map((name, i) => {
              const active = i === cursor;
              const q = value.toLowerCase();
              const idx = name.toLowerCase().indexOf(q);
              const before = idx >= 0 ? name.slice(0, idx) : name;
              const match = idx >= 0 ? name.slice(idx, idx + q.length) : "";
              const after = idx >= 0 ? name.slice(idx + q.length) : "";

              return (
                <li
                  key={name}
                  onMouseDown={() => pick(name)}
                  onMouseEnter={() => setCursor(i)}
                  className="px-3 py-2 cursor-pointer flex items-center gap-2 transition-colors"
                  style={{
                    background: active ? "rgba(255,255,255,0.05)" : "transparent",
                  }}
                >
                  <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
                    {before}
                    <span style={{ color: "var(--info)" }}>{match}</span>
                    {after}
                  </span>
                  {active && (
                    <span
                      className="ml-auto text-[8px] font-mono opacity-50"
                      style={{ color: "var(--text-4)" }}
                    >
                      ↵ research
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        disabled={searching || !value.trim()}
        onClick={() => { setOpen(false); onSearch(value); }}
        className="px-3 rounded-lg flex items-center gap-1.5 text-[11px] font-mono transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-2)",
        }}
        title="Research only (Enter)"
      >
        {searching ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Search size={11} />
        )}
      </button>
    </div>
  );
}

function TickerCell({
  label,
  value,
  dim,
  highlight,
}: {
  label: string;
  value: string;
  dim?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-3 px-2"
      style={{
        background: highlight ? "rgba(255,255,255,0.025)" : "transparent",
      }}
    >
      <div
        className="text-[8px] font-mono uppercase tracking-widest mb-1"
        style={{ color: highlight ? "var(--terminal-amber)" : "var(--text-4)" }}
      >
        {label}
      </div>
      <div
        className={`font-mono font-semibold ${highlight ? "text-[22px] value-flash" : "text-[16px]"}`}
        style={{
          color: highlight ? "var(--text)" : dim ? "var(--text-3)" : "var(--text-2)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
