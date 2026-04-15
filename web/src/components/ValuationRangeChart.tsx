"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

export function ValuationRangeChart({ fairValue, methods }: Props) {
  const rows = [
    ...methods.map((m) => ({
      label: m.method,
      low: m.range.low,
      base: m.range.base,
      high: m.range.high,
      width: m.range.high - m.range.low,
    })),
    {
      label: "BLENDED",
      low: fairValue.low,
      base: fairValue.base,
      high: fairValue.high,
      width: fairValue.high - fairValue.low,
    },
  ];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 10, right: 40, left: 50, bottom: 10 }}
          stackOffset="sign"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => fmtMoney(v)}
            stroke="#737373"
            fontSize={12}
          />
          <YAxis type="category" dataKey="label" stroke="#525252" fontSize={12} width={90} />
          <Tooltip
            cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
            formatter={(value, name) => [fmtMoney(Number(value)), String(name) === "low" ? "Low" : String(name) === "width" ? "Range" : String(name)]}
            contentStyle={{ background: "#0a0a0a", color: "#fafafa", border: "none", borderRadius: 6 }}
          />
          <Bar dataKey="low" stackId="a" fill="transparent" />
          <Bar dataKey="width" stackId="a" radius={[4, 4, 4, 4]}>
            {rows.map((r, i) => (
              <Cell
                key={i}
                fill={r.label === "BLENDED" ? "#0ea5e9" : "#60a5fa"}
                fillOpacity={r.label === "BLENDED" ? 0.95 : 0.65}
              />
            ))}
            <LabelList
              dataKey="base"
              position="right"
              formatter={(v) => fmtMoney(Number(v))}
              fontSize={12}
              fill="#0f172a"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
