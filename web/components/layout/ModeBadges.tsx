"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

// Honesty rule 1: the header always says where the data comes from and whether agents are live.
const DATA = {
  stub: {
    cls: "m-sample",
    label: "Sample data",
    text: "Invented cases with no contract behind them. Nothing on this site moves money.",
    more: 'Numbers show a "sample" tag instead of a transaction link.',
  },
  testnet: {
    cls: "m-testnet",
    label: "Testnet",
    text: "A relief contract on NEAR testnet, paid in a test token that has no value.",
    more: "Every amount links to its testnet transaction or account.",
  },
  mainnet: {
    cls: "m-mainnet",
    label: "Mainnet",
    text: "The relief contract on NEAR mainnet with real funds. Spending is capped per case, per day and as a share of the pool.",
    more: "Every amount links to its mainnet transaction or account.",
  },
} as const;

const AGENTS = {
  replay: {
    cls: "m-replay",
    label: "Replay",
    text: "Agent votes come from recorded runs, replayed in the order they happened.",
    more: "Each vote still links to the transaction it was signed in.",
  },
  live: {
    cls: "m-live",
    label: "Live",
    text: "Agents call live models and outside data sources.",
    more: "New votes appear on case pages within about 5 seconds.",
  },
} as const;

export function ModeBadges({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState<"data" | "agents" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dm = DATA[config.chainMode];
  // The replay note about vote transactions is only true when votes were signed on a real chain.
  const am =
    config.dataMode === "replay" && config.chainMode === "stub"
      ? { ...AGENTS.replay, more: "On sample data the votes have no transactions behind them." }
      : AGENTS[config.dataMode];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pop = open === "data" ? { ...dm, k: "Data", title: "Data source" } : open === "agents" ? { ...am, k: "Agents", title: "Agent mode" } : null;

  return (
    <div className={`modes ${className}`} ref={ref}>
      <button type="button" className={`mode ${dm.cls}`} aria-expanded={open === "data"} onClick={() => setOpen(open === "data" ? null : "data")}>
        <span className="mode-k">Data</span>
        {dm.label}
      </button>
      <button type="button" className={`mode ${am.cls}`} aria-expanded={open === "agents"} onClick={() => setOpen(open === "agents" ? null : "agents")}>
        <span className="mode-k">Agents</span>
        {am.label}
      </button>
      {pop && (
        <div className="popover" role="dialog" aria-label={pop.title}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className={`mode ${pop.cls}`} style={{ cursor: "default" }}>
              <span className="mode-k">{pop.k}</span>
              {pop.label}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <p className="body-s" style={{ color: "var(--ink)" }}>
            {pop.text}
          </p>
          <p className="cap" style={{ marginTop: 8 }}>
            {pop.more}
          </p>
        </div>
      )}
    </div>
  );
}
