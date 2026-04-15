"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";

interface ProviderMultiple {
  ticker: string;
  ev_revenue: number;
  source: string;
}

interface CrossCheckData {
  providers: Record<string, ProviderMultiple[]>;
  tickers: string[];
  spread: Record<string, Record<string, number>>;
}

interface Props {
  form: { sector: string; name: string; ltm_revenue: number; revenue_growth: number; ebit_margin: number };
}

const PROVIDER_COLORS: Record<string, string> = {
  yfinance: "#55b3ff",
  octagon: "#c084fc",
  firecrawl: "#ff9f43",
  mock: "#9c9c9d",
};

export function CrossCheckPanel({ form }: Props) {
  const [data, setData] = useState<CrossCheckData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cross-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.detail || d.error || "Cross-check failed");
      } else {
        setData(d);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [form]);

  const providerNames = data ? Object.keys(data.providers) : [];

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
            SOURCE TRIANGULATION
          </div>
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Provider Cross-Check
          </h3>
        </div>
        <button
          disabled={loading}
          onClick={runCheck}
          className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] font-mono transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-2)",
          }}
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : null}
          {loading ? "Checking…" : "Run cross-check"}
        </button>
      </div>

      {error && (
        <div className="text-[11px] font-mono" style={{ color: "var(--accent)" }}>
          {error}
        </div>
      )}

      {data && providerNames.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] font-mono" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th
                  className="text-left py-2 pr-3"
                  style={{ color: "var(--text-4)", fontWeight: 500 }}
                >
                  Ticker
                </th>
                {providerNames.map((p) => (
                  <th
                    key={p}
                    className="text-right py-2 px-2"
                    style={{ color: PROVIDER_COLORS[p] ?? "var(--text-3)", fontWeight: 500 }}
                  >
                    {p}
                  </th>
                ))}
                <th
                  className="text-right py-2 pl-3"
                  style={{ color: "var(--text-4)", fontWeight: 500 }}
                >
                  Spread
                </th>
              </tr>
            </thead>
            <tbody>
              {data.tickers.map((ticker) => {
                const tickerSpread = data.spread[ticker] ?? {};
                const spreadVal = tickerSpread._spread;
                const meanVal = tickerSpread._mean;
                const hasMultiple = Object.keys(tickerSpread).filter((k) => !k.startsWith("_")).length >= 2;

                return (
                  <tr
                    key={ticker}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td className="py-2 pr-3" style={{ color: "var(--text-2)" }}>
                      {ticker}
                    </td>
                    {providerNames.map((p) => {
                      const val = tickerSpread[p];
                      const isFar = meanVal && val && Math.abs(val - meanVal) > (meanVal * 0.3);
                      return (
                        <td
                          key={p}
                          className="text-right py-2 px-2"
                          style={{
                            color: val != null
                              ? isFar ? "var(--warning)" : "var(--text-2)"
                              : "var(--text-4)",
                          }}
                        >
                          {val != null ? `${val.toFixed(1)}x` : "—"}
                        </td>
                      );
                    })}
                    <td
                      className="text-right py-2 pl-3"
                      style={{
                        color: hasMultiple
                          ? spreadVal != null && spreadVal > 3
                            ? "var(--warning)"
                            : "var(--success)"
                          : "var(--text-4)",
                      }}
                    >
                      {hasMultiple && spreadVal != null ? `${spreadVal.toFixed(1)}x` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 flex items-center gap-4">
            {providerNames.map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: PROVIDER_COLORS[p] ?? "#9c9c9d" }}
                />
                <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
                  {p}
                </span>
              </div>
            ))}
            <div className="ml-auto text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
              {providerNames.length} sources compared
            </div>
          </div>
        </div>
      )}

      {data && providerNames.length === 0 && (
        <div className="text-[13px]" style={{ color: "var(--text-3)" }}>
          No provider returned multiples for this sector.
        </div>
      )}

      {!data && !loading && (
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          Compare EV/Revenue multiples across all data providers to identify disagreement
          and validate source reliability.
        </p>
      )}
    </div>
  );
}
