"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineStatus = "completed" | "active" | "pending" | "error";

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp?: string | Date;
  status?: TimelineStatus;
  /** Optional hex color — overrides the default status color */
  color?: string;
  icon?: React.ReactNode;
  /** Arbitrary content rendered below description */
  content?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  className?: string;
  /** Whether to animate items on mount */
  animate?: boolean;
}

const STATUS_COLORS: Record<TimelineStatus, string> = {
  completed: "var(--success)",
  active: "var(--info)",
  pending: "var(--text-4)",
  error: "var(--accent)",
};

function StatusIcon({ status }: { status: TimelineStatus }) {
  switch (status) {
    case "completed":
      return <Check size={9} />;
    case "active":
      return (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Clock size={9} />
        </motion.div>
      );
    case "error":
      return <X size={9} />;
    case "pending":
    default:
      return <div className="w-1.5 h-1.5 rounded-full bg-current" />;
  }
}

function formatTimestamp(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, delay: i * 0.03, ease: "easeOut" as const },
  }),
};

export function Timeline({ items, className, animate = true }: TimelineProps) {
  return (
    <div className={cn("relative", className)}>
      <AnimatePresence initial={false}>
        {items.map((item, idx) => {
          const status = item.status ?? "pending";
          const color = item.color ?? STATUS_COLORS[status];
          const isLast = idx === items.length - 1;

          return (
            <motion.div
              key={item.id}
              custom={idx}
              variants={animate ? itemVariants : undefined}
              initial={animate ? "hidden" : false}
              animate={animate ? "visible" : false}
              className="relative flex gap-3 pb-3"
            >
              {/* Connector line */}
              {!isLast && (
                <div
                  className="absolute left-[9px] top-5 w-px"
                  style={{
                    bottom: 0,
                    background: `linear-gradient(to bottom, ${color}40 0%, var(--border) 100%)`,
                  }}
                />
              )}

              {/* Icon */}
              <div
                className="relative z-10 w-[18px] h-[18px] shrink-0 mt-0.5 rounded-full flex items-center justify-center"
                style={{
                  background: `${color}18`,
                  border: `1px solid ${color}50`,
                  color,
                }}
              >
                {item.icon ?? <StatusIcon status={status} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="text-[12px] font-medium leading-tight"
                    style={{ color: status === "pending" ? "var(--text-3)" : "var(--text-2)" }}
                  >
                    {item.title}
                  </span>
                  {item.timestamp && (
                    <time
                      className="shrink-0 text-[10px] font-mono"
                      style={{ color: "var(--text-3)" }}
                    >
                      {formatTimestamp(item.timestamp)}
                    </time>
                  )}
                </div>

                {item.description && (
                  <p
                    className="text-[11px] mt-0.5 leading-relaxed"
                    style={{ color: "var(--text-3)" }}
                  >
                    {item.description}
                  </p>
                )}

                {item.content && (
                  <div className="mt-1.5">{item.content}</div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Timeline Rail ────────────────────────────────────────────────────────────
// Horizontal progress rail for pipeline stages

export interface RailStep {
  label: string;
  sublabel?: string;
  status: TimelineStatus;
  color?: string;
}

export interface TimelineRailProps {
  steps: RailStep[];
  className?: string;
}

export function TimelineRail({ steps, className }: TimelineRailProps) {
  const lastDoneIdx = steps.reduce((acc, s, i) => (s.status === "completed" ? i : acc), -1);

  return (
    <div className={cn("relative flex items-center gap-0", className)}>
      {steps.map((step, i) => {
        const color = step.color ?? STATUS_COLORS[step.status];
        const isLast = i === steps.length - 1;

        return (
          <React.Fragment key={i}>
            {/* Step */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              {/* Dot */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  background: `${color}20`,
                  border: `2px solid ${color}`,
                  color,
                }}
              >
                {step.status === "completed" && <Check size={12} />}
                {step.status === "active" && (
                  <motion.div
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: color }}
                  />
                )}
                {(step.status === "pending" || step.status === "error") && (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: color, opacity: step.status === "pending" ? 0.35 : 1 }}
                  />
                )}
              </div>

              {/* Label */}
              <div className="text-center min-w-[64px]">
                <div
                  className="text-[11px] font-semibold font-mono uppercase tracking-wide leading-tight"
                  style={{
                    color: step.status === "pending" ? "var(--text-3)" : "var(--text)",
                  }}
                >
                  {step.label}
                </div>
                {step.sublabel && (
                  <div
                    className="text-[10px] font-mono leading-tight mt-0.5 truncate max-w-[120px]"
                    style={{ color }}
                  >
                    {step.sublabel}
                  </div>
                )}
              </div>
            </div>

            {/* Connector */}
            {!isLast && (
              <div
                className="flex-1 h-[2px] mx-3 mb-6 transition-all duration-500 rounded-full"
                style={{
                  background: i < lastDoneIdx + 1
                    ? "var(--success)"
                    : "rgba(255,255,255,0.08)",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
