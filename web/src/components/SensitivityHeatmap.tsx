"use client";

import { fmtMoney } from "@/lib/types";
import type { AuditStep } from "@/lib/types";

interface Props {
  steps: AuditStep[];
}

function extractGrid(steps: AuditStep[]): {
  waccValues: number[];
  growthValues: number[];
  grid: number[][];
  baseEv: number;
} | null {
  const step = steps.find(
    (s) =>
      s.method === "dcf" &&
      s.description.toLowerCase().includes("sensitivity") &&
      s.outputs.grid,
  );
  if (!step) return null;

  const waccValues = step.outputs.wacc_values as number[];
  const growthValues = step.outputs.growth_values as number[];
  const grid = step.outputs.grid as number[][];
  const baseEv = (step.outputs.base as number) ?? 0;

  if (!waccValues?.length || !growthValues?.length || !grid?.length) return null;
  return { waccValues, growthValues, grid, baseEv };
}

function evToColor(value: number, min: number, max: number): string {
  const range = max - min || 1;
  const t = Math.max(0, Math.min(1, (value - min) / range));
  const r = Math.round(85 + (255 - 85) * (1 - t));
  const g = Math.round(179 + (99 - 179) * (1 - t));
  const b = Math.round(255 + (99 - 255) * (1 - t));
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

export function SensitivityHeatmap({ steps }: Props) {
  const data = extractGrid(steps);
  if (!data) return null;

  const { waccValues, growthValues, grid, baseEv } = data;
  const flat = grid.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);

  const baseWaccIdx = Math.floor(waccValues.length / 2);
  const baseGrowthIdx = Math.floor(growthValues.length / 2);

  return (
    <div
      className="shadow-ring rounded-2xl p-6"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div
            className="text-[11px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--text-4)" }}
          >
            DCF SENSITIVITY
          </div>
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            WACC vs Terminal Growth
          </h3>
        </div>
        <div className="text-[12px] font-mono" style={{ color: "var(--text-3)" }}>
          base EV {fmtMoney(baseEv)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] font-mono" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                className="py-2 px-3 text-right"
                style={{ color: "var(--text-4)", fontWeight: 500 }}
              >
                WACC \ g
              </th>
              {growthValues.map((g, j) => (
                <th
                  key={j}
                  className="py-2 px-3 text-center"
                  style={{
                    color: j === baseGrowthIdx ? "var(--info)" : "var(--text-4)",
                    fontWeight: j === baseGrowthIdx ? 700 : 500,
                  }}
                >
                  {(g * 100).toFixed(1)}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {waccValues.map((w, i) => (
              <tr key={i}>
                <td
                  className="py-2 px-3 text-right"
                  style={{
                    color: i === baseWaccIdx ? "var(--info)" : "var(--text-4)",
                    fontWeight: i === baseWaccIdx ? 700 : 400,
                    borderRight: "1px solid var(--border)",
                  }}
                >
                  {(w * 100).toFixed(1)}%
                </td>
                {grid[i].map((val, j) => {
                  const isBase = i === baseWaccIdx && j === baseGrowthIdx;
                  return (
                    <td
                      key={j}
                      className="py-2 px-3 text-center"
                      style={{
                        background: evToColor(val, min, max),
                        color: isBase ? "var(--text)" : "var(--text-3)",
                        fontWeight: isBase ? 700 : 400,
                        border: isBase
                          ? "2px solid var(--info)"
                          : "1px solid var(--border)",
                        borderRadius: isBase ? 6 : 0,
                      }}
                    >
                      {fmtMoney(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-6 text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ background: evToColor(max, min, max) }} />
          higher EV
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ background: evToColor(min, min, max) }} />
          lower EV
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ border: "2px solid var(--info)" }} />
          base case
        </div>
      </div>
    </div>
  );
}
