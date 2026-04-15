"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, TrendingUp, BarChart3, Target, Activity } from "lucide-react";
import { fmtMoney, fmtPercent, type MethodResult, type Range } from "@/lib/types";

interface ValuationKPICardsProps {
  fairValue: Range;
  methods: MethodResult[];
  company: string;
  lastRound?: number | null;
}

const METHOD_HEX: Record<string, string> = {
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
  precedent_txns: "#c084fc",
};

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, delay: i * 0.06, ease: "easeOut" as const },
  }),
};

export function ValuationKPICards({ fairValue, methods, company, lastRound }: ValuationKPICardsProps) {
  const activeMethods = methods.filter((m) => m.range.base > 0);
  const avgConfidence = activeMethods.length
    ? activeMethods.reduce((sum, m) => sum + m.confidence, 0) / activeMethods.length
    : 0;
  const spread = fairValue.high - fairValue.low;
  const spreadPct = fairValue.base > 0 ? spread / fairValue.base : 0;
  const lastRoundDelta =
    lastRound != null && lastRound > 0
      ? (fairValue.base - lastRound) / lastRound
      : null;

  const cards: {
    label: string;
    value: string;
    subtext: string;
    subtextColor?: string;
    icon: React.ReactNode;
    accent: string;
    delta?: number | null;
  }[] = [
    {
      label: "Fair Value · Base",
      value: fmtMoney(fairValue.base),
      subtext: `${fmtMoney(fairValue.low)} — ${fmtMoney(fairValue.high)}`,
      icon: <Target size={14} />,
      accent: "var(--terminal-green)",
      delta: lastRoundDelta,
    },
    {
      label: "Valuation Spread",
      value: fmtPercent(spreadPct),
      subtext: `± ${fmtMoney(spread / 2)} from base`,
      icon: <BarChart3 size={14} />,
      accent: "var(--info)",
    },
    {
      label: "Avg. Confidence",
      value: fmtPercent(avgConfidence),
      subtext: `across ${activeMethods.length} method${activeMethods.length !== 1 ? "s" : ""}`,
      icon: <Activity size={14} />,
      accent: avgConfidence >= 0.7 ? "var(--success)" : avgConfidence >= 0.4 ? "var(--warning)" : "var(--accent)",
    },
    {
      label: "Method Consensus",
      value: activeMethods.length > 0
        ? (() => {
            const sorted = [...activeMethods].sort((a, b) => b.weight - a.weight);
            return sorted[0]?.method.replace(/_/g, " ").toUpperCase() ?? "—";
          })()
        : "—",
      subtext: activeMethods.length > 0
        ? `highest weight · ${fmtPercent(Math.max(...activeMethods.map((m) => m.weight)))}`
        : "no data",
      icon: <TrendingUp size={14} />,
      accent: METHOD_HEX[activeMethods.sort((a, b) => b.weight - a.weight)[0]?.method ?? ""] ?? "var(--text-4)",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          custom={i}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="rounded-xl p-4 relative overflow-hidden group"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "rgb(27, 28, 30) 0px 0px 0px 1px",
          }}
        >
          {/* Top gradient accent */}
          <div
            className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
            style={{ background: `linear-gradient(90deg, ${card.accent} 0%, transparent 70%)` }}
          />

          {/* Hover glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
            style={{ background: `radial-gradient(ellipse at top left, ${card.accent}08 0%, transparent 60%)` }}
          />

          {/* Icon + Label */}
          <div className="flex items-center justify-between mb-3 relative">
            <span
              className="text-[11px] font-mono uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              {card.label}
            </span>
            <span style={{ color: card.accent, opacity: 0.8 }}>{card.icon}</span>
          </div>

          {/* Value */}
          <div
            className="text-[24px] font-semibold font-mono leading-tight relative mb-1.5"
            style={{ color: card.accent }}
          >
            {card.value}
          </div>

          {/* Subtext + delta */}
          <div className="flex items-center gap-1.5 relative">
            <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
              {card.subtext}
            </span>
            {card.delta != null && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1 rounded"
                style={{
                  color: card.delta >= 0 ? "var(--success)" : "var(--accent)",
                  background: card.delta >= 0 ? "rgba(95,201,146,0.08)" : "rgba(255,99,99,0.08)",
                }}
              >
                {card.delta >= 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                {Math.abs(card.delta * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
