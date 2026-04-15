"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import type { AuditStep } from "@/lib/types";
import { Timeline, type TimelineItem, type TimelineStatus } from "@/components/ui/timeline";

const METHOD_HEX: Record<string, string> = {
  engine: "#ff6363",
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
  precedent_txns: "#c084fc",
};

function stepToTimelineItem(s: AuditStep, isOpen: boolean, onToggle: () => void): TimelineItem {
  const hex = METHOD_HEX[s.method] ?? "#9c9c9d";

  return {
    id: String(s.step),
    title: s.description,
    status: "completed" as TimelineStatus,
    color: hex,
    icon: (
      <span
        className="font-mono text-[8px] font-semibold"
        style={{ color: hex }}
      >
        {String(s.step).padStart(2, "0")}
      </span>
    ),
    content: (
      <AuditStepDetail
        step={s}
        hex={hex}
        isOpen={isOpen}
        onToggle={onToggle}
      />
    ),
  };
}

function AuditStepDetail({
  step: s,
  hex,
  isOpen,
  onToggle,
}: {
  step: AuditStep;
  hex: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const hasCitations = s.citations.length > 0;
  const hasAssumptions = s.assumptions.length > 0;
  const hasInputs = Object.keys(s.inputs).length > 0;
  const hasOutputs = Object.keys(s.outputs).length > 0;
  const hasDetails = hasCitations || hasAssumptions || hasInputs || hasOutputs;

  return (
    <div>
      {/* Method badge row */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            color: hex,
            background: `${hex}14`,
            border: `1px solid ${hex}35`,
          }}
        >
          {s.method}
        </span>
        {hasCitations && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ color: "var(--success)", background: "rgba(95,201,146,0.1)" }}
          >
            {s.citations.length}c
          </span>
        )}
        {hasAssumptions && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ color: "var(--info)", background: "rgba(85,179,255,0.1)" }}
          >
            {s.assumptions.length}a
          </span>
        )}
        {hasDetails && (
          <button
            onClick={onToggle}
            className="text-[9px] font-mono transition-opacity hover:opacity-60 ml-auto"
            style={{ color: "var(--text-4)" }}
          >
            <motion.span
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={{ duration: 0.15 }}
              className="inline-block"
            >
              ▶
            </motion.span>
          </button>
        )}
      </div>

      {/* Expandable detail panel */}
      <AnimatePresence initial={false}>
        {isOpen && hasDetails && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div
              className="p-2.5 rounded space-y-1.5 text-[10px] mt-1"
              style={{
                background: "rgba(255,255,255,0.015)",
                borderLeft: `1px solid ${hex}30`,
              }}
            >
              {hasInputs && <KvRow label="in" data={s.inputs} />}
              {hasOutputs && <KvRow label="out" data={s.outputs} />}
              {hasCitations && (
                <div className="flex flex-wrap gap-1">
                  <span
                    className="font-mono text-[10px] uppercase tracking-wide mr-1 self-center font-semibold"
                    style={{ color: "var(--text-3)" }}
                  >
                    cit
                  </span>
                  {s.citations.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-strong)",
                        color:
                          c.source === "mock"
                            ? "var(--warning)"
                            : c.source === "claude-agent"
                              ? "#c084fc"
                              : "var(--success)",
                      }}
                    >
                      {c.source}
                      <span style={{ color: "var(--text-3)" }}>/{c.field}</span>
                    </span>
                  ))}
                </div>
              )}
              {hasAssumptions && (
                <div className="flex flex-wrap gap-1">
                  <span
                    className="font-mono text-[10px] uppercase tracking-wide mr-1 self-center font-semibold"
                    style={{ color: "var(--text-3)" }}
                  >
                    asm
                  </span>
                  {s.assumptions.map((a, i) => (
                    <span
                      key={i}
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(85,179,255,0.08)",
                        color: "var(--info)",
                      }}
                    >
                      {a.name}=<span style={{ color: "var(--text-2)" }}>{String(a.value)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KvRow({ label, data }: { label: string; data: Record<string, unknown> }) {
  return (
    <div className="font-mono">
      <span
        className="uppercase text-[10px] tracking-wide mr-2 font-semibold"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
      <span style={{ color: "var(--text-2)" }}>
        {Object.entries(data).map(([k, v], i) => (
          <span key={i} className="mr-2">
            {k}
            <span style={{ color: "var(--text-4)" }}>=</span>
            <span style={{ color: "var(--text-2)" }}>
              {typeof v === "number" ? v.toLocaleString() : JSON.stringify(v)}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}

export function AuditTrailTimeline({ steps }: { steps: AuditStep[] }) {
  const [openAll, setOpenAll] = useState(false);
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new steps arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [steps.length]);

  const toggleItem = (step: number) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  const handleExpandAll = () => {
    if (openAll) {
      setOpenItems(new Set());
      setOpenAll(false);
    } else {
      setOpenItems(new Set(steps.map((s) => s.step)));
      setOpenAll(true);
    }
  };

  const items: TimelineItem[] = steps.map((s) =>
    stepToTimelineItem(s, openItems.has(s.step), () => toggleItem(s.step))
  );

  return (
    <div id="trail">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full pulse-dot"
            style={{ background: "var(--terminal-green)" }}
          />
          <div
            className="text-[11px] uppercase font-mono tracking-wider font-semibold"
            style={{ color: "var(--text-2)" }}
          >
            AUDIT TRAIL
          </div>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(0,232,120,0.08)",
              color: "var(--terminal-green)",
              border: "1px solid rgba(0,232,120,0.15)",
            }}
          >
            {steps.length} entries
          </span>
        </div>
        <button
          onClick={handleExpandAll}
          className="text-[11px] font-mono uppercase tracking-wide px-2 py-1 rounded transition-opacity hover:opacity-60"
          style={{
            color: "var(--text-3)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
          }}
        >
          {openAll ? "collapse" : "expand all"}
        </button>
      </div>

      {/* Timeline */}
      <div ref={containerRef} className="max-h-[600px] overflow-y-auto pr-1">
        <Timeline items={items} animate />
      </div>
    </div>
  );
}
