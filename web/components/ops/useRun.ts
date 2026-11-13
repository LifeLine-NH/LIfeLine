"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type RunScript, SCENARIOS } from "@/lib/scenarios";

// Step 0 case, 1 all thinking, 2 to 5 one vote each, 6 decision, 7+ events after the decision.
export function totalSteps(s: RunScript) {
  return 7 + s.events.length;
}

export interface RunInfo {
  chainMode: "stub" | "testnet" | "mainnet";
  mode: "replay" | "live";
  caseId: string;
  onChain: boolean;
}

function placeholder(key: string): RunScript {
  const s = SCENARIOS.find((x) => x.key === key);
  return {
    key,
    name: s?.name ?? key,
    caseId: "",
    title: "Submitting the case…",
    meta: "Clustering reports and building the evidence bundle",
    reports: [],
    votes: [],
    decision: { word: "Counting", tone: "progress", sub: "0 of 4 voted", line: "", funded: false },
    events: [],
  };
}

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

// Drives the run view. `start` runs a scenario through the agent runner; `replay` steps through a recorded case.
export function useRun(recorded: RunScript[], everyMs: number) {
  const [script, setScript] = useState<RunScript | null>(recorded[0] ?? null);
  const [step, setStep] = useState(recorded[0] ? totalSteps(recorded[0]) - 1 : 0);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RunInfo | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const token = useRef(0);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const animate = useCallback(
    (s: RunScript, from: number) => {
      stop();
      const total = totalSteps(s);
      if (reducedMotion()) {
        setStep(total - 1);
        setRunning(false);
        return;
      }
      setStep(from);
      setRunning(true);
      let n = from;
      timer.current = setInterval(() => {
        n += 1;
        if (n >= total) {
          stop();
          setRunning(false);
          return;
        }
        setStep(n);
      }, everyMs);
    },
    [everyMs],
  );

  const replay = useCallback(
    (key: string) => {
      const s = recorded.find((x) => x.key === key);
      if (!s) return;
      token.current += 1;
      setError(null);
      setInfo(null);
      setPending(false);
      setScript(s);
      animate(s, 0);
    },
    [recorded, animate],
  );

  const start = useCallback(
    async (key: string) => {
      const my = ++token.current;
      stop();
      setError(null);
      setInfo(null);
      setScript(placeholder(key));
      setPending(true);
      setRunning(true);
      setStep(1);
      try {
        const res = await fetch("/api/swarm/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: key }) });
        const body = await res.json().catch(() => null);
        if (my !== token.current) return;
        if (!res.ok || !body?.script) throw new Error(body?.error ?? `The run route answered ${res.status}.`);
        setPending(false);
        setInfo(body.run);
        setScript(body.script);
        animate(body.script, 1);
      } catch (err) {
        if (my !== token.current) return;
        setPending(false);
        setRunning(false);
        setError(err instanceof Error ? err.message : String(err));
        const fallback = recorded.find((x) => x.key === key) ?? null;
        setScript(fallback);
        setStep(fallback ? totalSteps(fallback) - 1 : 0);
      }
    },
    [recorded, animate],
  );

  const pick = useCallback(
    (key: string) => {
      token.current += 1;
      stop();
      setRunning(false);
      setPending(false);
      setError(null);
      setInfo(null);
      const s = recorded.find((x) => x.key === key) ?? placeholder(key);
      setScript(s);
      setStep(recorded.some((x) => x.key === key) ? totalSteps(s) - 1 : 0);
    },
    [recorded],
  );

  return { script, step, running, pending, error, info, start, replay, pick };
}
