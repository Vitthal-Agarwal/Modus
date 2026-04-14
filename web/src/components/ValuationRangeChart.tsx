"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmtMoney, type MethodResult, type Range } from "@/lib/types";

interface Props {
  fairValue: Range;
  methods: MethodResult[];
}

const METHOD_FILL: Record<string, string> = {
  comps: "#55b3ff",
  dcf: "#5fc992",
  last_round: "#ffbc33",
};

export function ValuationRangeChart({ fairValue, methods }: Props) {
  const rows = [
    ...methods.map((m) => ({
      label: m.method,
      low: m.range.low,
      base: m.range.base,
      high: m.range.high,
      width: m.range.high - m.range.low,
      fill: METHOD_FILL[m.method] ?? "#9c9c9d",
    })),
    {
      label: "BLENDED",
      low: fairValue.low,
      base: fairValue.base,
      high: fairValue.high,
      width: fairValue.high - fairValue.low,
      fill: "#ffffff",
    },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 6, right: 56, left: 8, bottom: 6 }}
          stackOffset="sign"
          barSize={22}
        >
          <XAxis
            type="number"
            tickFormatter={(v) => fmtMoney(v)}
            stroke="#6a6b6c"
            tick={{ fontSize: 11, fill: "#9c9c9d" }}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke="#9c9c9d"
            tick={{ fontSize: 11, fill: "#cecece", fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={88}
          />
          <Tooltip
            cursor={{ fill: "rgba(85, 179, 255, 0.06)" }}
            formatter={(value, name) => [
              fmtMoney(Number(value)),
              String(name) === "width" ? "range" : String(name),
            ]}
            contentStyle={{
              background: "#101111",
              color: "#f9f9f9",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              boxShadow: "rgba(0,0,0,0.5) 0 8px 24px",
            }}
            labelStyle={{ color: "#f9f9f9", fontWeight: 600 }}
          />
          <Bar dataKey="low" stackId="a" fill="transparent" />
          <Bar dataKey="width" stackId="a" radius={[4, 4, 4, 4]}>
            {rows.map((r, i) => (
              <Cell
                key={i}
                fill={r.fill}
                fillOpacity={r.label === "BLENDED" ? 0.95 : 0.7}
              />
            ))}
            <LabelList
              dataKey="base"
              position="right"
              formatter={(v) => fmtMoney(Number(v))}
              style={{ fontSize: 11, fill: "#f9f9f9", fontFamily: "var(--font-geist-mono)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
