"use client";

import { useState } from "react";

import type { AuditStep } from "@/lib/types";

const METHOD_HEX: Record<string, string> = {
  engine: "#ff6363",
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
};

export function AuditTrailTimeline({ steps }: { steps: AuditStep[] }) {
  const [openAll, setOpenAll] = useState(false);

  return (
    <div id="trail">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div
            className="text-[10px] uppercase font-mono tracking-widest mb-0.5"
            style={{ color: "var(--text-4)" }}
          >
            traceability
          </div>
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Audit trail
            <span className="ml-2 font-mono text-[12px]" style={{ color: "var(--text-3)" }}>
              {steps.length} steps
            </span>
          </h3>
        </div>
        <button
          onClick={() => setOpenAll((v) => !v)}
          className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded transition-opacity hover:opacity-60"
          style={{
            color: "var(--info)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          {openAll ? "collapse all" : "expand all"}
        </button>
      </div>

      <ol
        className="relative pl-6 space-y-2"
        style={{ borderLeft: "1px solid var(--border)" }}
      >
        {steps.map((s) => {
          const hex = METHOD_HEX[s.method] ?? "#9c9c9d";
          return (
            <li key={s.step} className="relative">
              <span
                className="absolute -left-[27px] top-[9px] w-2 h-2 rounded-full"
                style={{
                  background: hex,
                  boxShadow: `0 0 0 4px var(--bg), 0 0 0 5px ${hex}33`,
                }}
              />
              <details open={openAll} className="group">
                <summary
                  className="cursor-pointer py-1.5 flex items-baseline gap-3 list-none transition-opacity hover:opacity-80"
                  style={{ color: "var(--text)" }}
                >
                  <span
                    className="inline-block transition-transform group-open:rotate-90 text-[10px]"
                    style={{ color: "var(--text-4)" }}
                  >
                    ▸
                  </span>
                  <span
                    className="font-mono text-[10px] w-8"
                    style={{ color: "var(--text-4)" }}
                  >
                    {String(s.step).padStart(2, "0")}
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      color: hex,
                      background: `${hex}14`,
                      border: `1px solid ${hex}33`,
                    }}
                  >
                    {s.method}
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
                    {s.description}
                  </span>
                </summary>

                <div className="mt-2 ml-10 mb-2 space-y-1.5 text-[11px]">
                  {Object.keys(s.inputs).length > 0 && (
                    <KvRow label="inputs" data={s.inputs} />
                  )}
                  {Object.keys(s.outputs).length > 0 && (
                    <KvRow label="outputs" data={s.outputs} />
                  )}
                  {s.citations.length > 0 && (
                    <div>
                      <span
                        className="font-mono uppercase text-[9px] tracking-wider mr-2"
                        style={{ color: "var(--text-4)" }}
                      >
                        citations
                      </span>
                      {s.citations.map((c, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 mr-2 font-mono"
                          style={{ color: "var(--text-3)" }}
                        >
                          <span
                            className="px-1 rounded"
                            style={{
                              background: "var(--surface-2)",
                              color:
                                c.source === "mock"
                                  ? "var(--warning)"
                                  : "var(--success)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {c.source}
                          </span>
                          /{c.field}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.assumptions.length > 0 && (
                    <div>
                      <span
                        className="font-mono uppercase text-[9px] tracking-wider mr-2"
                        style={{ color: "var(--text-4)" }}
                      >
                        assumptions
                      </span>
                      {s.assumptions.map((a, i) => (
                        <span
                          key={i}
                          className="mr-2 font-mono"
                          style={{ color: "var(--info)" }}
                        >
                          {a.name}
                          <span style={{ color: "var(--text-4)" }}>=</span>
                          <span style={{ color: "var(--text-2)" }}>
                            {String(a.value)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function KvRow({ label, data }: { label: string; data: Record<string, unknown> }) {
  return (
    <div className="font-mono">
      <span
        className="uppercase text-[9px] tracking-wider mr-2"
        style={{ color: "var(--text-4)" }}
      >
        {label}
      </span>
      <span style={{ color: "var(--text-3)" }}>
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
