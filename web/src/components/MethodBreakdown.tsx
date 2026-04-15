"use client";

import { fmtMoney, fmtPercent, type MethodResult } from "@/lib/types";

function humanizeSummary(text: string): string {
  return text.replace(/\$[\d,]+(?:\.\d+)?[MBK]?/g, (match) => {
    const raw = match.replace(/[$,]/g, "");
    const suffix = raw.slice(-1);
    let multiplier = 1;
    let numStr = raw;
    if (suffix === "M") { multiplier = 1e6; numStr = raw.slice(0, -1); }
    else if (suffix === "B") { multiplier = 1e9; numStr = raw.slice(0, -1); }
    else if (suffix === "K") { multiplier = 1e3; numStr = raw.slice(0, -1); }
    const n = parseFloat(numStr) * multiplier;
    if (!Number.isFinite(n)) return match;
    return fmtMoney(n);
  });
}

const METHOD_LABELS: Record<string, string> = {
  comps: "Comparable Company Analysis",
  dcf: "Discounted Cash Flow",
  last_round: "Last Round Mark-to-Market",
  precedent_txns: "Precedent Transactions",
};

const METHOD_HEX: Record<string, string> = {
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
  precedent_txns: "#c084fc",
};

export function MethodBreakdown({ method }: { method: MethodResult }) {
  const hex = METHOD_HEX[method.method] ?? "#9c9c9d";
  return (
    <div className="group relative">
      <div
        id={`method-${method.method}`}
        className="method-card-terminal p-5 relative overflow-hidden"
        style={{
          background: "var(--surface)",
          borderLeftColor: hex,
          boxShadow: "rgb(27, 28, 30) 0px 0px 0px 1px",
        }}
      >
        {/* Brand top-line gradient */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{
            background: `linear-gradient(90deg, ${hex} 0%, transparent 60%)`,
          }}
        />

        {/* Gradient hover overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)" }}
        />

        {/* Subtle tint behind left border */}
        <div
          className="absolute inset-y-0 left-0 w-8 pointer-events-none"
          style={{ background: `linear-gradient(90deg, ${hex}0a 0%, transparent 100%)` }}
        />

        <div className="relative flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-1.5 h-1.5 rounded-full pulse-dot"
                style={{ background: hex }}
              />
              <span
                className="text-[10px] uppercase tracking-wider font-mono font-semibold"
                style={{ color: hex }}
              >
                {method.method}
              </span>
            </div>
            <h3 className="text-[13px] font-semibold leading-tight" style={{ color: "var(--text-2)" }}>
              {METHOD_LABELS[method.method] ?? method.method}
            </h3>
          </div>
          <div
            className="text-[11px] font-mono text-right"
            style={{ color: "var(--text-3)" }}
          >
            wt={fmtPercent(method.weight)} · conf={fmtPercent(method.confidence)}
          </div>
        </div>

        <div className="relative mb-4 font-mono">
          <div
            className="text-[30px] font-semibold leading-tight value-flash"
            style={{ color: hex }}
          >
            {fmtMoney(method.range.base)}
          </div>
          {method.range.low !== method.range.high && (
            <div className="flex items-center gap-1 text-[12px] mt-1" style={{ color: "var(--text-3)" }}>
              <span>{fmtMoney(method.range.low)}</span>
              <span style={{ color: "var(--border-strong)" }}>—</span>
              <span>{fmtMoney(method.range.high)}</span>
            </div>
          )}
        </div>

        {method.summary && (
          <p
            className="relative text-[13px] leading-relaxed mb-3"
            style={{ color: "var(--text-2)" }}
          >
            {humanizeSummary(method.summary)}
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
                      color:
                        c.source === "mock"
                          ? "var(--warning)"
                          : c.source === "claude-agent"
                            ? "#c084fc"
                            : "var(--success)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {c.source}
                  </span>
                  <span style={{ color: "var(--text-3)" }}>
                    {c.field.replace(/_/g, " ")} ={" "}
                    <span className="font-mono" style={{ color: "var(--text-2)" }}>
                      {typeof c.value === "number" && Math.abs(c.value) >= 1e6
                        ? fmtMoney(c.value)
                        : typeof c.value === "number" && Math.abs(c.value) < 1
                          ? fmtPercent(c.value)
                          : String(c.value)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Details>
        )}
      </div>
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
    <details className="group/details mt-2">
      <summary
        className="cursor-pointer text-[11px] font-mono uppercase tracking-wider py-1 transition-opacity hover:opacity-60 list-none flex items-center gap-1"
        style={{ color: "var(--text-3)" }}
      >
        <span className="inline-block transition-transform group-open/details:rotate-90 text-[8px]">▶</span>
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
