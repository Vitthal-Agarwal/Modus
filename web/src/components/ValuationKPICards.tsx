"use client";

import { useRef, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, TrendingUp, BarChart3, Target, Activity } from "lucide-react";
import { fmtMoney, fmtPercent, type MethodResult, type Range } from "@/lib/types";
import { SlidingNumber } from "@/components/ui/sliding-number";

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
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

function AnimatedMoney({ value, accent }: { value: number; accent: string }) {
  const millions = value / 1_000_000;
  const rounded = Math.round(millions * 10) / 10;
  return (
    <span className="text-[24px] font-semibold font-mono leading-tight" style={{ color: accent }}>
      $<SlidingNumber value={rounded} />M
    </span>
  );
}

function SpotlightKPICard({
  card,
  index,
}: {
  card: {
    label: string;
    value: string;
    numericValue?: number;
    subtext: string;
    icon: React.ReactNode;
    accent: string;
    delta?: number | null;
    isMoneyValue?: boolean;
  };
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <motion.div
      ref={ref}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="rounded-xl p-4 relative overflow-hidden group"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "rgb(27, 28, 30) 0px 0px 0px 1px",
      }}
    >
      {/* Spotlight glow following cursor */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 rounded-xl"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, ${card.accent}12, transparent 40%)`,
        }}
      />

      {/* Top gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${card.accent} 0%, transparent 70%)` }}
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

      {/* Value — animated for money values */}
      <div className="relative mb-1.5">
        {card.isMoneyValue && card.numericValue != null ? (
          <AnimatedMoney value={card.numericValue} accent={card.accent} />
        ) : (
          <div
            className="text-[24px] font-semibold font-mono leading-tight"
            style={{ color: card.accent }}
          >
            {card.value}
          </div>
        )}
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
  );
}

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

  const cards = [
    {
      label: "Fair Value · Base",
      value: fmtMoney(fairValue.base),
      numericValue: fairValue.base,
      isMoneyValue: true,
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
        <SpotlightKPICard key={card.label} card={card} index={i} />
      ))}
    </div>
  );
}
