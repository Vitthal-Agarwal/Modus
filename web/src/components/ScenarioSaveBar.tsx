"use client";

import { useState } from "react";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import type { ScenarioMeta, ValuationOutput } from "@/lib/types";

interface ScenarioSaveBarProps {
  result: ValuationOutput;
  onSaved: (meta: ScenarioMeta) => void;
}

export function ScenarioSaveBar({ result, onSaved }: ScenarioSaveBarProps) {
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ output: result, label: trimmed }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || data.error || "Save failed");
        setStatus("error");
        return;
      }
      onSaved(data as ScenarioMeta);
      setStatus("saved");
      setLabel("");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  }

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        marginTop: "0.75rem",
      }}
    >
      <div
        className="text-[10px] font-mono uppercase tracking-wider mb-2"
        style={{ color: "var(--text-3)" }}
      >
        Save Scenario
      </div>
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          placeholder="e.g. Q1 2026 draft"
          className="flex-1 rounded-md px-2.5 h-8 text-[12px] font-mono outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
        <button
          onClick={handleSave}
          disabled={status === "saving" || !label.trim()}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md text-[11px] font-mono transition-colors disabled:opacity-40"
          style={{
            background: status === "saved" ? "rgba(95,201,146,0.15)" : "rgba(95,201,146,0.1)",
            color: "var(--success)",
            border: "1px solid rgba(95,201,146,0.25)",
          }}
        >
          {status === "saving" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : status === "saved" ? (
            <Check size={11} />
          ) : (
            <BookmarkPlus size={11} />
          )}
          {status === "saved" ? "Saved" : "Save"}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-1.5 text-[10px] font-mono" style={{ color: "var(--accent)" }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}
