"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunScript } from "@/lib/scenarios";

// Step 0 case, 1 all thinking, 2 to 5 one vote each, 6 decision, 7+ events after the decision.
export function totalSteps(s: RunScript) {
  return 7 + s.events.length;
}

export function useRun(scripts: RunScript[], everyMs: number) {
  const [key, setKey] = useState(scripts[0]?.key ?? "");
  const script = scripts.find((s) => s.key === key) ?? scripts[0];
  const [step, setStep] = useState(script ? totalSteps(script) - 1 : 0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const run = useCallback(
    (k: string) => {
      const s = scripts.find((x) => x.key === k);
      if (!s) return;
      stop();
      setKey(k);
      let reduced = false;
      try {
        reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {}
      const total = totalSteps(s);
      if (reduced) {
        setStep(total - 1);
        setRunning(false);
        return;
      }
      setStep(0);
      setRunning(true);
      let n = 0;
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
    [scripts, everyMs],
  );

  const pick = useCallback(
    (k: string) => {
      const s = scripts.find((x) => x.key === k);
      if (!s) return;
      stop();
      setRunning(false);
      setKey(k);
      setStep(totalSteps(s) - 1);
    },
    [scripts],
  );

  return { script, step, running, run, pick };
}
