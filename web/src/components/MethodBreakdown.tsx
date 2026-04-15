"use client";

import { fmtMoney, fmtPercent, type MethodResult } from "@/lib/types";

const METHOD_LABELS: Record<string, string> = {
  comps: "Comparable Company Analysis",
  dcf: "Discounted Cash Flow",
  last_round: "Last Round Mark-to-Market",
};

export function MethodBreakdown({ method }: { method: MethodResult }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-semibold">
          {METHOD_LABELS[method.method] ?? method.method}
        </h3>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>weight {fmtPercent(method.weight)}</span>
          <span>conf {fmtPercent(method.confidence)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Low", value: method.range.low },
          { label: "Base", value: method.range.base, emphasis: true },
          { label: "High", value: method.range.high },
        ].map((c) => (
          <div
            key={c.label}
            className={`rounded-lg px-3 py-2 ${
              c.emphasis
                ? "bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900"
                : "bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{c.label}</div>
            <div className={`text-sm font-semibold ${c.emphasis ? "text-sky-700 dark:text-sky-300" : ""}`}>
              {fmtMoney(c.value)}
            </div>
          </div>
        ))}
      </div>

      {method.summary && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3 leading-relaxed">
          {method.summary}
        </p>
      )}

      {method.assumptions.length > 0 && (
        <details className="text-xs mb-2">
          <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200">
            {method.assumptions.length} assumptions
          </summary>
          <ul className="mt-2 space-y-1 pl-3 border-l border-neutral-200 dark:border-neutral-800">
            {method.assumptions.slice(0, 8).map((a, i) => (
              <li key={i}>
                <span className="font-mono text-[11px] text-sky-700 dark:text-sky-400">{a.name}</span>
                <span className="text-neutral-500"> = </span>
                <span className="font-mono text-[11px]">{String(a.value)}</span>
                <div className="text-neutral-500 text-[11px] pl-1">{a.rationale}</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {method.citations.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200">
            {method.citations.length} citations
          </summary>
          <ul className="mt-2 space-y-1 pl-3 border-l border-neutral-200 dark:border-neutral-800">
            {method.citations.slice(0, 10).map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="inline-block rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono">
                  {c.source}
                </span>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {c.field} = <span className="font-mono">{String(c.value)}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
