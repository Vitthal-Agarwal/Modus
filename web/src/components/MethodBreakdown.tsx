"use client";

import { fmtMoney, fmtPercent, type MethodResult } from "@/lib/types";

const METHOD_LABELS: Record<string, string> = {
  comps: "Comparable Company Analysis",
  dcf: "Discounted Cash Flow",
  last_round: "Last Round Mark-to-Market",
};

const METHOD_HEX: Record<string, string> = {
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
};

export function MethodBreakdown({ method }: { method: MethodResult }) {
  const hex = METHOD_HEX[method.method] ?? "#9c9c9d";
  return (
    <div
      id={`method-${method.method}`}
      className="shadow-ring rounded-2xl p-5 relative"
      style={{ background: "var(--surface)" }}
    >
      {/* top accent bar */}
      <div
        className="absolute top-0 left-4 right-4 h-px"
        style={{ background: hex, opacity: 0.6 }}
      />

      <div className="flex items-start justify-between mb-4">
        <div>
          <div
            className="text-[10px] uppercase tracking-widest font-mono mb-1"
            style={{ color: hex }}
          >
            {method.method}
          </div>
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {METHOD_LABELS[method.method] ?? method.method}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1 text-[11px]">
          <Chip label="weight" value={fmtPercent(method.weight)} />
          <Chip label="conf" value={fmtPercent(method.confidence)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "LOW", value: method.range.low, dim: true },
          { label: "BASE", value: method.range.base, dim: false },
          { label: "HIGH", value: method.range.high, dim: true },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg px-3 py-2"
            style={{
              background: c.dim ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="text-[9px] font-mono tracking-widest"
              style={{ color: "var(--text-4)" }}
            >
              {c.label}
            </div>
            <div
              className="font-mono text-[13px] font-semibold"
              style={{ color: c.dim ? "var(--text-2)" : hex }}
            >
              {fmtMoney(c.value)}
            </div>
          </div>
        ))}
      </div>

      {method.summary && (
        <p
          className="text-[12px] leading-relaxed mb-3"
          style={{ color: "var(--text-3)" }}
        >
          {method.summary}
        </p>
      )}

      {method.assumptions.length > 0 && (
        <Details label={`${method.assumptions.length} assumptions`}>
          <ul className="space-y-2 pl-3" style={{ borderLeft: "1px solid var(--border)" }}>
            {method.assumptions.slice(0, 8).map((a, i) => (
              <li key={i} className="text-[11px]">
                <div className="font-mono" style={{ color: "var(--info)" }}>
                  {a.name}
                  <span style={{ color: "var(--text-4)" }}> = </span>
                  <span style={{ color: "var(--text-2)" }}>{String(a.value)}</span>
                </div>
                <div className="pl-1 mt-0.5" style={{ color: "var(--text-4)" }}>
                  {a.rationale}
                </div>
              </li>
            ))}
          </ul>
        </Details>
      )}

      {method.citations.length > 0 && (
        <Details label={`${method.citations.length} citations`}>
          <ul className="space-y-1.5 pl-3" style={{ borderLeft: "1px solid var(--border)" }}>
            {method.citations.slice(0, 10).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span
                  className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    background: "var(--surface-2)",
                    color: c.source === "mock" ? "var(--warning)" : "var(--success)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {c.source}
                </span>
                <span style={{ color: "var(--text-3)" }}>
                  {c.field} ={" "}
                  <span className="font-mono" style={{ color: "var(--text-2)" }}>
                    {String(c.value)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Details>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: "var(--text-3)",
      }}
    >
      <span style={{ color: "var(--text-4)" }}>{label}</span>
      <span style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function Details({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group mt-2">
      <summary
        className="cursor-pointer text-[11px] font-mono uppercase tracking-wider py-1.5 transition-opacity hover:opacity-60 list-none"
        style={{ color: "var(--text-3)" }}
      >
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
