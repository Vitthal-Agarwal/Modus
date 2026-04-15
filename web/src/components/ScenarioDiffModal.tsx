"use client";

import { X, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { fmtMoney, fmtPercent, type ScenarioDiff } from "@/lib/types";

interface ScenarioDiffModalProps {
  diff: ScenarioDiff;
  onClose: () => void;
}

const METHOD_HEX: Record<string, string> = {
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
  precedent_txns: "#c084fc",
};

const METHOD_LABEL: Record<string, string> = {
  comps: "COMPS",
  dcf: "DCF",
  last_round: "LAST RND",
  precedent_txns: "PREC TXN",
};

function DeltaCell({ delta, pct }: { delta: number; pct?: number | null }) {
  const pos = delta >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-mono"
      style={{ color: pos ? "var(--success)" : "var(--accent)" }}
    >
      {pos ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {fmtMoney(Math.abs(delta))}
      {pct != null && (
        <span className="ml-0.5 text-[10px]" style={{ opacity: 0.7 }}>
          ({pos ? "+" : "-"}{fmtPercent(Math.abs(pct))})
        </span>
      )}
    </span>
  );
}

function formatDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export function ScenarioDiffModal({ diff, onClose }: ScenarioDiffModalProps) {
  const { a, b, fair_value: fv, methods } = diff;

  const fvRows = [
    { label: "LOW", aVal: undefined as number | undefined, bVal: undefined as number | undefined, delta: fv.low_delta, pct: null as number | null },
    { label: "BASE", aVal: undefined, bVal: undefined, delta: fv.base_delta, pct: fv.base_delta_pct },
    { label: "HIGH", aVal: undefined, bVal: undefined, delta: fv.high_delta, pct: null },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div className="text-[12px] font-mono uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              Scenario Diff
            </div>
            <div className="text-[14px] font-mono mt-0.5" style={{ color: "var(--text)" }}>
              <span style={{ color: "#55b3ff" }}>{a.label}</span>
              <span style={{ color: "var(--text-4)" }}> vs </span>
              <span style={{ color: "#ffbc33" }}>{b.label}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--text-4)", background: "var(--surface-2)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Fair Value Delta Table */}
          <div>
            <div
              className="text-[10px] font-mono uppercase tracking-wider mb-2"
              style={{ color: "var(--text-3)" }}
            >
              Fair Value
            </div>
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              {/* Column headers */}
              <div
                className="grid grid-cols-4 px-3 py-1.5 text-[10px] font-mono uppercase"
                style={{ background: "var(--surface-2)", color: "var(--text-4)" }}
              >
                <span></span>
                <span style={{ color: "#55b3ff" }}>{a.label}</span>
                <span style={{ color: "#ffbc33" }}>{b.label}</span>
                <span>Change</span>
              </div>

              {/* LOW / BASE / HIGH — we only have deltas, not absolute values, so we derive from fair_value */}
              {(["LOW", "BASE", "HIGH"] as const).map((rowLabel, i) => {
                const delta = i === 0 ? fv.low_delta : i === 1 ? fv.base_delta : fv.high_delta;
                const pct = i === 1 ? fv.base_delta_pct : null;
                return (
                  <div
                    key={rowLabel}
                    className="grid grid-cols-4 px-3 py-2 text-[12px] font-mono items-center"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <span style={{ color: "var(--text-3)" }}>{rowLabel}</span>
                    <span style={{ color: "var(--text-4)" }}>—</span>
                    <span style={{ color: "var(--text-4)" }}>—</span>
                    <DeltaCell delta={delta} pct={pct} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-method breakdown */}
          {methods.length > 0 && (
            <div>
              <div
                className="text-[10px] font-mono uppercase tracking-wider mb-2"
                style={{ color: "var(--text-3)" }}
              >
                By Method
              </div>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--border)" }}
              >
                <div
                  className="grid grid-cols-4 px-3 py-1.5 text-[10px] font-mono uppercase"
                  style={{ background: "var(--surface-2)", color: "var(--text-4)" }}
                >
                  <span>Method</span>
                  <span>Δ Base</span>
                  <span>Δ%</span>
                  <span>Range Δ (L / B / H)</span>
                </div>
                {methods.map((m) => (
                  <div
                    key={m.method}
                    className="grid grid-cols-4 px-3 py-2 text-[11px] font-mono items-center"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <span
                      className="font-semibold"
                      style={{ color: METHOD_HEX[m.method] ?? "var(--text)" }}
                    >
                      {METHOD_LABEL[m.method] ?? m.method}
                    </span>
                    <DeltaCell delta={m.base_delta} />
                    <span
                      style={{
                        color:
                          m.base_delta_pct == null
                            ? "var(--text-4)"
                            : m.base_delta_pct >= 0
                              ? "var(--success)"
                              : "var(--accent)",
                      }}
                    >
                      {m.base_delta_pct != null
                        ? `${m.base_delta_pct >= 0 ? "+" : ""}${fmtPercent(m.base_delta_pct)}`
                        : "—"}
                    </span>
                    <span style={{ color: "var(--text-4)", fontSize: "10px" }}>
                      {fmtMoney(m.range_delta.low)} / {fmtMoney(m.range_delta.base)} / {fmtMoney(m.range_delta.high)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 text-[10px] font-mono flex gap-6"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-4)" }}
        >
          <span>
            <span style={{ color: "#55b3ff" }}>A</span> saved {formatDate(a.saved_at)}
          </span>
          <span>
            <span style={{ color: "#ffbc33" }}>B</span> saved {formatDate(b.saved_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
