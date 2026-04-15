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

interface Bar {
  label: string;
  contribution: number;
  cumulativeFrom: number;
  cumulativeTo: number;
  fill: string;
  isTotal: boolean;
  weight?: number;
  methodBase?: number;
}

export function WaterfallChart({ fairValue, methods }: Props) {
  const contributing = methods.filter((m) => m.range.base > 0 && m.weight > 0);

  const bars: Bar[] = [];
  let running = 0;
  for (const m of contributing) {
    const contribution = m.range.base * m.weight;
    bars.push({
      label: m.method,
      contribution,
      cumulativeFrom: running,
      cumulativeTo: running + contribution,
      fill: METHOD_FILL[m.method] ?? "#9c9c9d",
      isTotal: false,
      weight: m.weight,
      methodBase: m.range.base,
    });
    running += contribution;
  }

  bars.push({
    label: "BLENDED",
    contribution: fairValue.base,
    cumulativeFrom: 0,
    cumulativeTo: fairValue.base,
    fill: "#ffffff",
    isTotal: true,
  });

  const scaleMax = Math.max(running, fairValue.base) * 1.1 || 1;
  const pct = (v: number) => (v / scaleMax) * 100;

  return (
    <div>
      <div
        className="relative flex items-end gap-2"
        style={{ height: 220 }}
      >
        {/* baseline */}
        <div
          className="absolute left-0 right-0 bottom-0 border-t"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        />

        {bars.map((bar, i) => {
          const topPct = 100 - pct(bar.cumulativeTo);
          const bottomPct = 100 - pct(bar.cumulativeFrom);
          const heightPct = bottomPct - topPct;

          return (
            <div
              key={`${bar.label}-${i}`}
              className="flex-1 relative h-full flex flex-col items-center"
            >
              {/* connector tick from previous running total */}
              {!bar.isTotal && i > 0 && (
                <div
                  className="absolute left-0 h-px"
                  style={{
                    top: `${bottomPct}%`,
                    width: "50%",
                    background: "rgba(255,255,255,0.25)",
                    borderTop: "1px dashed rgba(255,255,255,0.25)",
                  }}
                />
              )}

              {/* bar */}
              <div
                className="absolute rounded-sm"
                style={{
                  top: `${topPct}%`,
                  height: `${Math.max(heightPct, 0.5)}%`,
                  left: "18%",
                  right: "18%",
                  background: bar.fill,
                  opacity: bar.isTotal ? 0.95 : 0.7,
                  border: bar.isTotal
                    ? "1px solid rgba(255,255,255,0.4)"
                    : "none",
                }}
                title={
                  bar.isTotal
                    ? `Blended base ${fmtMoney(bar.contribution)}`
                    : `${bar.label}: ${fmtMoney(
                        bar.methodBase ?? 0,
                      )} × ${((bar.weight ?? 0) * 100).toFixed(0)}% = ${fmtMoney(
                        bar.contribution,
                      )}`
                }
              />

              {/* top label — contribution */}
              <div
                className="absolute text-[10px] font-mono"
                style={{
                  top: `calc(${topPct}% - 14px)`,
                  color: bar.isTotal ? "var(--text)" : bar.fill,
                  fontWeight: bar.isTotal ? 600 : 500,
                }}
              >
                {fmtMoney(bar.contribution)}
              </div>
            </div>
          );
        })}
      </div>

      {/* x-axis labels */}
      <div className="flex gap-2 mt-2">
        {bars.map((bar, i) => (
          <div
            key={`lbl-${bar.label}-${i}`}
            className="flex-1 text-center text-[10px] font-mono"
            style={{
              color: bar.isTotal ? "var(--text)" : "var(--text-3)",
              fontWeight: bar.isTotal ? 600 : 400,
            }}
          >
            {bar.label}
            {!bar.isTotal && bar.weight !== undefined && (
              <div
                className="text-[9px]"
                style={{ color: "var(--text-4)" }}
              >
                w={(bar.weight * 100).toFixed(0)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        className="mt-3 text-[10px]"
        style={{ color: "var(--text-4)" }}
      >
        Each bar is <code>method.base × method.weight</code>. Bars stack
        left-to-right; the blended total is the running sum.
      </div>
    </div>
  );
}
