"use client";

import { useEffect, useState } from "react";

export function TerminalClock() {
  const [t, setT] = useState("");

  useEffect(() => {
    const tick = () =>
      setT(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="text-[11px] font-mono tabular-nums"
      style={{ color: "var(--text-4)" }}
    >
      {t}
    </span>
  );
}
