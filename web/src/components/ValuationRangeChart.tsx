"use client";

import { fmtMoney, type MethodResult, type Range } from "@/lib/types";

interface Props {
  fairValue: Range;
  methods: MethodResult[];
}

const METHOD_FILL: Record<string, string> = {
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
  precedent_txns: "#c084fc",
};

interface Row {
  label: string;
  low: number;
  base: number;
  high: number;
  fill: string;
  isBlended: boolean;
}

export function ValuationRangeChart({ fairValue, methods }: Props) {
  const rows: Row[] = [
    ...methods
      .filter((m) => m.range.high > 0)
      .map((m) => ({
        label: m.method,
        low: m.range.low,
        base: m.range.base,
        high: m.range.high,
        fill: METHOD_FILL[m.method] ?? "#9c9c9d",
        isBlended: false,
      })),
    {
      label: "BLENDED",
      low: fairValue.low,
      base: fairValue.base,
      high: fairValue.high,
      fill: "#ffffff",
      isBlended: true,
    },
  ];

  const globalMin = Math.min(...rows.map((r) => r.low));
  const globalMax = Math.max(...rows.map((r) => r.high));
  const pad = (globalMax - globalMin) * 0.08;
  const scaleMin = Math.max(0, globalMin - pad);
  const scaleMax = globalMax + pad;
  const range = scaleMax - scaleMin || 1;

  const pct = (v: number) => ((v - scaleMin) / range) * 100;

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const leftPct = pct(row.low);
        const widthPct = pct(row.high) - leftPct;
        const basePct = pct(row.base);

        return (
          <div key={row.label} className="flex items-center gap-3">
            <div
              className="w-20 shrink-0 text-right text-[11px] font-mono"
              style={{
                color: row.isBlended ? "var(--text)" : "var(--text-3)",
                fontWeight: row.isBlended ? 600 : 400,
              }}
            >
              {row.label}
            </div>

            <div className="flex-1 relative" style={{ height: 28 }}>
              {/* track */}
              <div
                className="absolute inset-0 rounded"
                style={{ background: "rgba(255,255,255,0.03)" }}
              />

              {/* range bar */}
              <div
                className="absolute top-1 bottom-1 rounded"
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 0.5)}%`,
                  background: row.fill,
                  opacity: row.isBlended ? 0.9 : 0.55,
                }}
              />

              {/* base marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5"
                style={{
                  left: `${basePct}%`,
                  background: row.fill,
                  opacity: 1,
                  boxShadow: `0 0 6px ${row.fill}40`,
                }}
              />
            </div>

            <div className="w-20 shrink-0 flex flex-col items-start">
              <span
                className="text-[13px] font-mono font-semibold leading-tight"
                style={{ color: row.isBlended ? "var(--text)" : row.fill }}
              >
                {fmtMoney(row.base)}
              </span>
              <span
                className="text-[9px] font-mono leading-tight"
                style={{ color: "var(--text-4)" }}
              >
                {fmtMoney(row.low)}–{fmtMoney(row.high)}
              </span>
            </div>
          </div>
        );
      })}

      {/* Scale labels */}
      <div className="flex items-center gap-3">
        <div className="w-20 shrink-0" />
        <div className="flex-1 flex justify-between">
          <span
            className="text-[9px] font-mono"
            style={{ color: "var(--text-4)" }}
          >
            {fmtMoney(scaleMin)}
          </span>
          <span
            className="text-[9px] font-mono"
            style={{ color: "var(--text-4)" }}
          >
            {fmtMoney(scaleMax)}
          </span>
        </div>
        <div className="w-20 shrink-0" />
      </div>
    </div>
  );
}
