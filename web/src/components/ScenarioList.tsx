"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, GitCompare, Trash2, Loader2 } from "lucide-react";
import type { ScenarioMeta } from "@/lib/types";

interface ScenarioListProps {
  company: string;
  currentScenarioId: number | null;
  onLoad: (id: number) => void;
  onSelectForDiff: (id: number) => void;
  diffCandidateId: number | null;
  onRequestDiff: (idA: number, idB: number) => void;
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ScenarioList({
  company,
  currentScenarioId,
  onLoad,
  onSelectForDiff,
  diffCandidateId,
  onRequestDiff,
}: ScenarioListProps) {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchScenarios = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(company)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setScenarios(data.scenarios ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/scenarios/id/${id}`, { method: "DELETE", cache: "no-store" });
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  function handleCompare(id: number) {
    if (diffCandidateId === null) {
      onSelectForDiff(id);
    } else if (diffCandidateId === id) {
      onSelectForDiff(-1); // deselect
    } else {
      onRequestDiff(diffCandidateId, id);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3" style={{ color: "var(--text-4)" }}>
        <Loader2 size={11} className="animate-spin" />
        <span className="text-[11px] font-mono">Loading scenarios…</span>
      </div>
    );
  }

  if (scenarios.length === 0) return null;

  return (
    <div className="mt-2" style={{ borderTop: "1px solid var(--border)" }}>
      <div
        className="text-[10px] font-mono uppercase tracking-wider py-2"
        style={{ color: "var(--text-3)" }}
      >
        Saved Scenarios
      </div>
      <div className="flex flex-col gap-1">
        {scenarios.map((s) => {
          const isActive = s.id === currentScenarioId;
          const isDiffCandidate = s.id === diffCandidateId;
          return (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 group"
              style={{
                background: isActive
                  ? "rgba(85,179,255,0.08)"
                  : isDiffCandidate
                    ? "rgba(255,188,51,0.08)"
                    : "transparent",
                border: `1px solid ${
                  isActive
                    ? "rgba(85,179,255,0.2)"
                    : isDiffCandidate
                      ? "rgba(255,188,51,0.2)"
                      : "transparent"
                }`,
              }}
            >
              {/* Label + time */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-[11px] font-mono truncate"
                  style={{ color: isActive ? "#55b3ff" : "var(--text)" }}
                >
                  {s.label}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
                  {relativeTime(s.saved_at)}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onLoad(s.id)}
                  title="Load this scenario"
                  className="p-1 rounded"
                  style={{ color: "var(--text-3)" }}
                >
                  <ArrowRight size={11} />
                </button>
                <button
                  onClick={() => handleCompare(s.id)}
                  title={
                    diffCandidateId === null
                      ? "Select for compare"
                      : diffCandidateId === s.id
                        ? "Deselect"
                        : "Compare with selected"
                  }
                  className="p-1 rounded"
                  style={{
                    color: isDiffCandidate ? "#ffbc33" : "var(--text-3)",
                  }}
                >
                  <GitCompare size={11} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  title="Delete"
                  className="p-1 rounded"
                  style={{ color: "var(--text-4)" }}
                  disabled={deletingId === s.id}
                >
                  {deletingId === s.id ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Trash2 size={11} />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {diffCandidateId !== null && (
        <p className="mt-1.5 text-[10px] font-mono" style={{ color: "#ffbc33" }}>
          1 scenario selected — click another to compare
        </p>
      )}
    </div>
  );
}
