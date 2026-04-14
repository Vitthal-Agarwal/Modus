"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";

import type { CompanyFixture, ValuationOutput } from "@/lib/types";

interface Props {
  fixtures: Record<string, CompanyFixture>;
  result: ValuationOutput | null;
  onLoadFixture: (key: string) => void;
  onRunAudit: () => void;
  onScrollTo: (anchor: string) => void;
  onExport: () => void;
}

export function CommandPalette({
  fixtures,
  result,
  onLoadFixture,
  onRunAudit,
  onScrollTo,
  onExport,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function run(fn: () => void) {
    setOpen(false);
    // let the dialog unmount before firing scroll/state work
    setTimeout(fn, 0);
  }

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl shadow-float"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <Command label="Command Palette">
          <div style={{ borderBottom: "1px solid var(--border)" }}>
            <Command.Input placeholder="Type a command or search..." autoFocus />
          </div>
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>

            <Command.Group heading="Actions">
              <Command.Item onSelect={() => run(onRunAudit)}>
                <span>▶</span> Run audit
                <kbd>⏎</kbd>
              </Command.Item>
              {result && (
                <Command.Item onSelect={() => run(onExport)}>
                  <span>↓</span> Export JSON
                  <kbd>⌘E</kbd>
                </Command.Item>
              )}
            </Command.Group>

            {Object.keys(fixtures).length > 0 && (
              <Command.Group heading="Load fixture">
                {Object.entries(fixtures).map(([key, c]) => (
                  <Command.Item
                    key={key}
                    value={`fixture ${c.name} ${c.sector} ${key}`}
                    onSelect={() => run(() => onLoadFixture(key))}
                  >
                    <span style={{ color: "var(--text-4)" }}>◆</span>
                    <span>{c.name}</span>
                    <span style={{ color: "var(--text-4)", fontSize: 12 }}>
                      {c.sector}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {result && (
              <Command.Group heading="Jump to">
                <Command.Item onSelect={() => run(() => onScrollTo("summary"))}>
                  <span>#</span> Fair value summary
                </Command.Item>
                <Command.Item onSelect={() => run(() => onScrollTo("methods"))}>
                  <span>#</span> Method breakdown
                </Command.Item>
                <Command.Item onSelect={() => run(() => onScrollTo("trail"))}>
                  <span>#</span> Audit trail
                </Command.Item>
                {result.methods.map((m) => (
                  <Command.Item
                    key={m.method}
                    value={`method ${m.method}`}
                    onSelect={() => run(() => onScrollTo(`method-${m.method}`))}
                  >
                    <span style={{ color: "var(--text-4)" }}>→</span>
                    <span>{m.method}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
