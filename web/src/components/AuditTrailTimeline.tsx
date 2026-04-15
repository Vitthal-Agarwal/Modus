"use client";

import { useState } from "react";

import type { AuditStep } from "@/lib/types";

const METHOD_COLORS: Record<string, string> = {
  engine: "bg-neutral-900 dark:bg-neutral-100",
  comps: "bg-blue-500",
  dcf: "bg-emerald-500",
  last_round: "bg-amber-500",
};

export function AuditTrailTimeline({ steps }: { steps: AuditStep[] }) {
  const [openAll, setOpenAll] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">Audit trail · {steps.length} steps</h3>
        <button
          onClick={() => setOpenAll((v) => !v)}
          className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
        >
          {openAll ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <ol className="relative border-l border-neutral-200 dark:border-neutral-800 pl-5 space-y-3">
        {steps.map((s) => (
          <li key={s.step} className="relative">
            <span
              className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-neutral-50 dark:ring-neutral-950 ${
                METHOD_COLORS[s.method] ?? "bg-neutral-500"
              }`}
            />
            <details open={openAll}>
              <summary className="cursor-pointer text-sm text-neutral-900 dark:text-neutral-100 hover:text-sky-600 dark:hover:text-sky-400">
                <span className="inline-block mr-2 text-[10px] uppercase tracking-wide font-mono text-neutral-500">
                  step {s.step}
                </span>
                <span className="inline-block mr-2 text-[10px] uppercase tracking-wide font-mono text-neutral-500">
                  {s.method}
                </span>
                <span>{s.description}</span>
              </summary>
              <div className="mt-2 space-y-1 text-xs font-mono text-neutral-600 dark:text-neutral-400">
                {Object.keys(s.inputs).length > 0 && (
                  <div>
                    <span className="text-neutral-500">inputs:</span>{" "}
                    <pre className="inline whitespace-pre-wrap">{JSON.stringify(s.inputs, null, 0)}</pre>
                  </div>
                )}
                {Object.keys(s.outputs).length > 0 && (
                  <div>
                    <span className="text-neutral-500">outputs:</span>{" "}
                    <pre className="inline whitespace-pre-wrap">{JSON.stringify(s.outputs, null, 0)}</pre>
                  </div>
                )}
                {s.citations.length > 0 && (
                  <div>
                    <span className="text-neutral-500">citations:</span>{" "}
                    {s.citations.map((c, i) => (
                      <span key={i} className="mr-2">
                        <span className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">{c.source}</span>/{c.field}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
