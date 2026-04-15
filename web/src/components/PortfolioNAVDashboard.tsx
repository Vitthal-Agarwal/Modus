"use client";

import { useRef, useState, type MouseEvent } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Building2, DollarSign, Layers, Calendar } from "lucide-react";
import { fmtMoney, type PortfolioNAVResponse, type PortfolioCompanyResult, type ValuationOutput } from "@/lib/types";
import { SlidingNumber } from "@/components/ui/sliding-number";

interface PortfolioNAVDashboardProps {
  data: PortfolioNAVResponse;
  onSelectCompany: (key: string, valuation: ValuationOutput) => void;
}

const SECTOR_COLORS: Record<string, string> = {
  ai_saas: "#55b3ff",
  vertical_saas: "#5fc992",
  fintech: "#ffbc33",
  marketplace: "#c084fc",
  consumer: "#9c9c9d",
};

const SECTOR_LABEL: Record<string, string> = {
  ai_saas: "AI SaaS",
  vertical_saas: "Vertical SaaS",
  fintech: "Fintech",
  marketplace: "Marketplace",
  consumer: "Consumer",
};

function MiniRangeBar({
  valuation,
  globalMin,
  globalMax,
}: {
  valuation: ValuationOutput;
  globalMin: number;
  globalMax: number;
}) {
  const span = globalMax - globalMin || 1;
  const lowPct = ((valuation.fair_value.low - globalMin) / span) * 100;
  const highPct = ((valuation.fair_value.high - globalMin) / span) * 100;
  const basePct = ((valuation.fair_value.base - globalMin) / span) * 100;
  const sector = valuation.sector;
  const color = SECTOR_COLORS[sector] ?? "#9c9c9d";

  return (
    <div className="relative h-5 w-full flex items-center" style={{ minWidth: 80 }}>
      {/* Track */}
      <div
        className="absolute inset-y-0 my-auto rounded-full"
        style={{ height: 4, left: 0, right: 0, background: "var(--surface-2)" }}
      />
      {/* Range bar */}
      <div
        className="absolute rounded-full"
        style={{
          height: 4,
          left: `${lowPct}%`,
          width: `${highPct - lowPct}%`,
          background: `${color}55`,
          top: "50%",
          transform: "translateY(-50%)",
        }}
      />
      {/* Base marker */}
      <div
        className="absolute rounded-full"
        style={{
          width: 8,
          height: 8,
          background: color,
          left: `calc(${basePct}% - 4px)`,
          top: "50%",
          transform: "translateY(-50%)",
          boxShadow: `0 0 6px ${color}88`,
        }}
      />
    </div>
  );
}

const customTooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontFamily: "monospace",
  fontSize: 11,
  color: "var(--text)",
};

function SectorTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { sector: string; nav_base: number; nav_low: number; nav_high: number; company_count: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ ...customTooltipStyle, padding: "10px 14px" }}>
      <div className="font-semibold mb-1" style={{ color: SECTOR_COLORS[d.sector] ?? "#9c9c9d" }}>
        {SECTOR_LABEL[d.sector] ?? d.sector}
      </div>
      <div style={{ color: "var(--text-3)" }}>NAV Base: <span style={{ color: "var(--text)" }}>{fmtMoney(d.nav_base)}</span></div>
      <div style={{ color: "var(--text-3)" }}>Range: <span style={{ color: "var(--text)" }}>{fmtMoney(d.nav_low)} – {fmtMoney(d.nav_high)}</span></div>
      <div style={{ color: "var(--text-3)" }}>Companies: <span style={{ color: "var(--text)" }}>{d.company_count}</span></div>
    </div>
  );
}

function PortfolioKPICard({ kpi }: { kpi: { label: string; value: string; sub: string; icon: React.ReactNode; accent: string; numericValue?: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="rounded-xl p-4 relative overflow-hidden group"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Spotlight */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 rounded-xl"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(350px circle at ${mousePos.x}px ${mousePos.y}px, ${kpi.accent}15, transparent 40%)`,
        }}
      />
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px]"
        style={{ background: `linear-gradient(90deg, ${kpi.accent} 0%, transparent 70%)` }}
      />
      <div className="flex items-center justify-between mb-3 relative">
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          {kpi.label}
        </span>
        <span style={{ color: kpi.accent, opacity: 0.8 }}>{kpi.icon}</span>
      </div>
      <div className="text-[22px] font-semibold font-mono leading-tight mb-1 relative" style={{ color: kpi.accent }}>
        {kpi.numericValue != null ? (
          <span>$<SlidingNumber value={Math.round(kpi.numericValue / 100_000) / 10} />M</span>
        ) : (
          kpi.value
        )}
      </div>
      <div className="text-[10px] font-mono truncate relative" style={{ color: "var(--text-4)" }}>
        {kpi.sub}
      </div>
    </div>
  );
}

export function PortfolioNAVDashboard({ data, onSelectCompany }: PortfolioNAVDashboardProps) {
  const good = data.companies.filter((c): c is PortfolioCompanyResult & { valuation: ValuationOutput } => c.error === null && c.valuation !== null);

  // Global min/max for range bar scaling
  const allLows = good.map((c) => c.valuation.fair_value.low);
  const allHighs = good.map((c) => c.valuation.fair_value.high);
  const globalMin = Math.min(...allLows);
  const globalMax = Math.max(...allHighs);

  const kpis = [
    {
      label: "Total NAV · Base",
      value: fmtMoney(data.total_nav),
      numericValue: data.total_nav,
      sub: `${fmtMoney(data.nav_range.low)} — ${fmtMoney(data.nav_range.high)}`,
      icon: <DollarSign size={13} />,
      accent: "var(--terminal-green)",
    },
    {
      label: "Companies",
      value: String(good.length),
      sub: data.companies.length !== good.length ? `${data.companies.length - good.length} failed` : "all valued",
      icon: <Building2 size={13} />,
      accent: "var(--info)",
    },
    {
      label: "Sectors",
      value: String(data.by_sector.length),
      sub: data.by_sector.map((s) => SECTOR_LABEL[s.sector] ?? s.sector).join(", "),
      icon: <Layers size={13} />,
      accent: "#c084fc",
    },
    {
      label: "As of",
      value: data.as_of,
      sub: "valuation date",
      icon: <Calendar size={13} />,
      accent: "var(--text-3)",
    },
  ];

  const sectorChartData = data.by_sector.map((s) => ({
    ...s,
    name: SECTOR_LABEL[s.sector] ?? s.sector,
    fill: SECTOR_COLORS[s.sector] ?? "#9c9c9d",
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Section header */}
      <div>
        <h2 className="text-[13px] font-mono uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
          Portfolio NAV
        </h2>
        <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--text-4)" }}>
          All fixture companies valued as of {data.as_of}
        </p>
      </div>

      {/* KPI cards with spotlight effect */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <PortfolioKPICard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Company table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div
          className="px-4 py-3 text-[10px] font-mono uppercase tracking-wider"
          style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}
        >
          Portfolio Companies
        </div>

        {/* Table header */}
        <div
          className="grid px-4 py-2 text-[10px] font-mono uppercase"
          style={{
            gridTemplateColumns: "1.5fr 0.8fr 0.9fr 1.5fr 0.7fr 0.7fr",
            background: "var(--surface-2)",
            color: "var(--text-4)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span>Company</span>
          <span>Sector</span>
          <span>Base</span>
          <span>Range</span>
          <span>Low</span>
          <span>High</span>
        </div>

        {/* Rows */}
        {data.companies.map((c) => {
          if (c.error || !c.valuation) {
            return (
              <div
                key={c.key}
                className="grid px-4 py-3 text-[11px] font-mono items-center"
                style={{
                  gridTemplateColumns: "1.5fr 0.8fr 0.9fr 1.5fr 0.7fr 0.7fr",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-4)",
                }}
              >
                <span>{c.key}</span>
                <span>—</span>
                <span style={{ color: "var(--accent)" }}>Error</span>
                <span className="text-[10px]" style={{ color: "var(--accent)" }}>{c.error}</span>
                <span>—</span>
                <span>—</span>
              </div>
            );
          }

          const v = c.valuation;
          const color = SECTOR_COLORS[v.sector] ?? "#9c9c9d";

          return (
            <button
              key={c.key}
              onClick={() => onSelectCompany(c.key, v)}
              className="grid w-full px-4 py-3 text-left text-[11px] font-mono items-center transition-colors group"
              style={{
                gridTemplateColumns: "1.5fr 0.8fr 0.9fr 1.5fr 0.7fr 0.7fr",
                borderBottom: "1px solid var(--border)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--surface-2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <span style={{ color: "var(--text)" }}>{v.company}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full w-fit"
                style={{ background: `${color}18`, color }}
              >
                {SECTOR_LABEL[v.sector] ?? v.sector}
              </span>
              <span style={{ color: "var(--terminal-green)" }}>{fmtMoney(v.fair_value.base)}</span>
              <MiniRangeBar valuation={v} globalMin={globalMin} globalMax={globalMax} />
              <span style={{ color: "var(--text-3)" }}>{fmtMoney(v.fair_value.low)}</span>
              <span style={{ color: "var(--text-3)" }}>{fmtMoney(v.fair_value.high)}</span>
            </button>
          );
        })}
      </div>

      {/* Sector breakdown bar chart */}
      {sectorChartData.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div
            className="text-[10px] font-mono uppercase tracking-wider mb-4"
            style={{ color: "var(--text-3)" }}
          >
            NAV by Sector
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sectorChartData} barCategoryGap="30%">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--text-4)", fontSize: 10, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => fmtMoney(v)}
                tick={{ fill: "var(--text-4)", fontSize: 10, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                content={<SectorTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar dataKey="nav_base" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {sectorChartData.map((entry) => (
                  <Cell key={entry.sector} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
