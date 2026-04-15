"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "provider_try"; provider: string }
  | { type: "provider_hit"; provider: string; confidence: number }
  | { type: "provider_miss"; provider: string; reason: string }
  | { type: "agent_thinking"; text: string; turn: number }
  | { type: "agent_tool_call"; tool: string; summary: string; turn: number }
  | { type: "agent_done"; fields: string[] }
  | { type: "done"; result: unknown }
  | { type: "error"; message: string };

const PROVIDERS = ["yfinance", "fred", "octagon", "firecrawl", "claude-agent", "mock"] as const;

const PROVIDER_META: Record<string, { color: string; label: string }> = {
  yfinance:       { color: "#55b3ff", label: "Yahoo Finance" },
  fred:           { color: "#5fc992", label: "FRED / Fed" },
  octagon:        { color: "#ffbc33", label: "Octagon" },
  firecrawl:      { color: "#ff6363", label: "Firecrawl" },
  "claude-agent": { color: "#c084fc", label: "Claude Agent" },
  mock:           { color: "#6b7280", label: "Mock" },
};

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  WebSearch:        { icon: "⌕", label: "WEB SEARCH",  color: "#55b3ff" },
  firecrawl_scrape: { icon: "◈", label: "SCRAPE URL",  color: "#ffbc33" },
  submit_research:  { icon: "✓", label: "SUBMIT",       color: "#00e878" },
};

type ProviderState = "pending" | "trying" | "hit" | "miss";

type FeedItem =
  | { kind: "tool";        tool: string; summary: string; idx: number }
  | { kind: "thinking";    text: string;                  idx: number }
  | { kind: "done_fields"; fields: string[];              idx: number };

export function ResearchStreamVisualizer({
  query,
  events,
}: {
  query: string;
  events: StreamEvent[];
}) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Derive provider states
  const providerStates: Record<string, ProviderState> = {};
  for (const e of events) {
    if (e.type === "provider_try")  providerStates[e.provider] = "trying";
    else if (e.type === "provider_hit")  providerStates[e.provider] = "hit";
    else if (e.type === "provider_miss") providerStates[e.provider] = "miss";
  }

  // Derive feed items
  const feedItems: FeedItem[] = [];
  let idx = 0;
  for (const e of events) {
    if (e.type === "agent_tool_call") {
      feedItems.push({ kind: "tool", tool: e.tool, summary: e.summary, idx: idx++ });
    } else if (e.type === "agent_thinking" && e.text.length > 15) {
      feedItems.push({ kind: "thinking", text: e.text, idx: idx++ });
    } else if (e.type === "agent_done") {
      feedItems.push({ kind: "done_fields", fields: e.fields, idx: idx++ });
    }
  }

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feedItems.length]);

  const isAgentActive =
    providerStates["claude-agent"] === "trying" ||
    events.some((e) => e.type === "agent_tool_call");
  const activeProvider = Object.entries(providerStates).find(([, s]) => s === "trying")?.[0];
  const isDone = events.some((e) => e.type === "done");
  const hitProvider = Object.entries(providerStates).find(([, s]) => s === "hit")?.[0];

  return (
    <motion.div
      className="flex-1 flex flex-col rounded-xl overflow-hidden relative"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        minHeight: 0,
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* KineticLogStream-style grid background */}
      <div className="absolute inset-0 pointer-events-none opacity-100"
        style={{
          background: "linear-gradient(to right, rgba(128,128,128,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* ── macOS terminal bar ─────────────────────────────── */}
      <div
        className="relative shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.3)" }}
      >
        {/* macOS dots */}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-80" />
          <div className="w-3 h-3 rounded-full bg-green-500 opacity-80" />
        </div>

        <span className="text-[12px] font-mono" style={{ color: "var(--text-3)" }}>
          research://provider-chain
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--terminal-green)" }} />
          <span className="text-[11px] font-mono font-semibold" style={{ color: "var(--terminal-green)" }}>
            LIVE
          </span>
          <span
            className="text-[11px] font-mono px-2 py-0.5 rounded"
            style={{
              background: "rgba(0,232,120,0.07)",
              border: "1px solid rgba(0,232,120,0.2)",
              color: "var(--terminal-green)",
            }}
          >
            {events.length} events
          </span>
        </div>

        <span className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          {query}
        </span>
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="relative flex-1 flex overflow-hidden min-h-0">

        {/* LEFT — Provider chain */}
        <div
          className="shrink-0 flex flex-col p-4 gap-2 overflow-y-auto"
          style={{ width: 240, borderRight: "1px solid var(--border)" }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>
            PROVIDER CHAIN
          </div>

          {PROVIDERS.map((p) => {
            const state: ProviderState = providerStates[p] ?? "pending";
            const meta = PROVIDER_META[p];
            const isTrying  = state === "trying";
            const isHit     = state === "hit";
            const isMiss    = state === "miss";
            const isPending = state === "pending";

            return (
              <motion.div
                key={p}
                layout
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
                style={{
                  background: isTrying ? `${meta.color}12` : isHit ? `${meta.color}08` : "transparent",
                  border: `1px solid ${isTrying || isHit ? `${meta.color}22` : "transparent"}`,
                  opacity: isPending ? 0.3 : 1,
                }}
              >
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${isTrying ? "pulse-dot" : ""}`}
                  style={{ background: isPending ? "var(--text-4)" : meta.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-mono font-semibold flex items-center gap-1.5" style={{ color: isPending ? "var(--text-3)" : meta.color }}>
                    {p}
                    {p === "claude-agent" && (isTrying || isHit) && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}40` }}
                      >
                        AI
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>{meta.label}</div>
                </div>
                <div className="shrink-0">
                  {isHit && <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ color: "var(--success)", background: "rgba(95,201,146,0.12)" }}>HIT</span>}
                  {isMiss && <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>MISS</span>}
                  {isTrying && <span className="text-[11px] font-mono blink-cursor" style={{ color: meta.color }}>RUN</span>}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* RIGHT — Agent feed */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* subheader */}
          <div className="shrink-0 px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
            {isAgentActive ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full pulse-dot shrink-0" style={{ background: "#c084fc" }} />
                <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#c084fc" }}>
                  CLAUDE AGENT · DEEP RESEARCH
                </span>
              </>
            ) : (
              <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                AGENT ACTIVITY
              </span>
            )}
            <span className="ml-auto text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
              {feedItems.length} actions
            </span>
          </div>

          {/* feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-2">
            {feedItems.length === 0 ? (
              <div className="flex items-center gap-2.5 py-3">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${isDone ? "" : "pulse-dot"}`}
                  style={{ background: isDone ? "var(--success)" : "var(--text-4)" }}
                />
                <span className="text-[12px] font-mono" style={{ color: isDone ? "var(--text-3)" : "var(--text-4)" }}>
                  {events.length === 0
                    ? "Connecting to provider chain…"
                    : isDone && hitProvider && hitProvider !== "claude-agent"
                    ? `Resolved via ${PROVIDER_META[hitProvider]?.label ?? hitProvider} — no agent needed`
                    : isDone
                    ? "Research complete"
                    : "Querying data providers…"}
                </span>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {feedItems.map((item) => (
                  <motion.div
                    key={item.idx}
                    layout
                    variants={{
                      initial: { opacity: 0, x: -30, scale: 0.92 },
                      animate: {
                        opacity: 1, x: 0, scale: 1,
                        transition: { type: "spring", stiffness: 300, damping: 20 },
                      },
                      exit: { opacity: 0, x: 30, transition: { duration: 0.2 } },
                    }}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <FeedRow item={item} />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer: active provider status ───────────────── */}
      {activeProvider && (
        <div
          className="relative shrink-0 px-4 py-2.5 flex items-center gap-2"
          style={{ borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.2)" }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full pulse-dot shrink-0"
            style={{ background: PROVIDER_META[activeProvider]?.color ?? "var(--text-4)" }}
          />
          <span className="text-[11px] font-mono" style={{ color: PROVIDER_META[activeProvider]?.color ?? "var(--text-3)" }}>
            {activeProvider === "claude-agent"
              ? "Spawning Claude agent · deep research via claude-agent-sdk"
              : `Querying ${PROVIDER_META[activeProvider]?.label ?? activeProvider}…`}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === "tool") {
    const meta = TOOL_META[item.tool] ?? { icon: "⚙", label: item.tool.toUpperCase(), color: "var(--text-3)" };
    const isSubmit = item.tool === "submit_research";
    return (
      <div
        className="flex items-start gap-3 rounded-lg p-3"
        style={{
          background: isSubmit ? "rgba(0,232,120,0.05)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${isSubmit ? "rgba(0,232,120,0.12)" : "var(--border)"}`,
        }}
      >
        <span className="shrink-0 text-[15px] mt-0.5 w-5 text-center" style={{ color: meta.color }}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: meta.color }}>{meta.label}</div>
          <div className="text-[13px] font-mono break-all" style={{ color: "var(--text-2)" }} title={item.summary}>
            {item.summary.length > 90 ? item.summary.slice(0, 90) + "…" : item.summary}
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === "thinking") {
    return (
      <div
        className="px-3 py-2 rounded text-[12px] font-mono leading-relaxed"
        style={{
          color: "var(--text-3)",
          borderLeft: "2px solid rgba(192,132,252,0.35)",
          background: "rgba(192,132,252,0.05)",
        }}
      >
        {item.text.slice(0, 140)}{item.text.length > 140 ? "…" : ""}
      </div>
    );
  }

  if (item.kind === "done_fields") {
    return (
      <div
        className="rounded-lg p-3"
        style={{ background: "rgba(0,232,120,0.06)", border: "1px solid rgba(0,232,120,0.15)" }}
      >
        <div className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--terminal-green)" }}>
          ✓ Research complete — {item.fields.length} fields
        </div>
        <div className="flex flex-wrap gap-1">
          {item.fields.map((f) => (
            <span
              key={f}
              className="text-[11px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: "rgba(0,232,120,0.08)", border: "1px solid rgba(0,232,120,0.2)", color: "var(--terminal-green)" }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
