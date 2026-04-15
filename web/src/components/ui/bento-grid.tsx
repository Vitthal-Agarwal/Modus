"use client";

import { cn } from "@/lib/utils";

export interface BentoItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  status?: string;
  tags?: string[];
  meta?: string;
  cta?: string;
  colSpan?: number;
  hasPersistentHover?: boolean;
  onSelect?: () => void;
}

interface BentoGridProps {
  items: BentoItem[];
}

function BentoGrid({ items = [] }: BentoGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
      {items.map((item, index) => (
        <div
          key={index}
          onClick={item.onSelect}
          className={cn(
            "group relative p-4 rounded-xl overflow-hidden transition-all duration-300",
            "border border-white/10 bg-black/30",
            "hover:shadow-[0_2px_20px_rgba(255,255,255,0.04)]",
            "hover:-translate-y-0.5 will-change-transform cursor-pointer",
            "flex flex-col",
            item.colSpan === 2 ? "md:col-span-2" : "col-span-1",
            {
              "shadow-[0_2px_12px_rgba(255,255,255,0.03)] -translate-y-0.5":
                item.hasPersistentHover,
            }
          )}
        >
          {/* dot grid background */}
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-300",
              item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:4px_4px]" />
          </div>

          {/* gradient border shine on hover */}
          <div
            className={cn(
              "absolute inset-0 -z-10 rounded-xl p-px bg-gradient-to-br from-transparent via-white/10 to-transparent",
              item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              "transition-opacity duration-300"
            )}
          />

          <div className="relative flex flex-col flex-1 space-y-3">
            {/* icon + status row */}
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 group-hover:bg-white/15 transition-all duration-300">
                {item.icon}
              </div>
              <span
                className={cn(
                  "text-[10px] font-mono font-medium px-2 py-0.5 rounded-lg",
                  "bg-white/10 text-zinc-400",
                  "transition-colors duration-300 group-hover:bg-white/15"
                )}
              >
                {item.status || "Active"}
              </span>
            </div>

            {/* title + description */}
            <div className="space-y-1 flex-1">
              <h3 className="font-medium text-zinc-100 tracking-tight text-[14px]">
                {item.title}
                <span className="ml-2 text-[11px] text-zinc-500 font-mono font-normal">
                  {item.meta}
                </span>
              </h3>
              <p className="text-[12px] text-zinc-400 leading-snug">
                {item.description}
              </p>
            </div>

            {/* tags + cta */}
            <div className="flex items-center justify-between mt-auto pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {item.tags?.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/8 text-zinc-500 hover:bg-white/15 transition-colors duration-200"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              <span className="text-[11px] font-mono text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ml-2">
                {item.cta || "Explore →"}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export { BentoGrid };
