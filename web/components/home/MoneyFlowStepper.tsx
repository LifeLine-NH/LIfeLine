"use client";

import { useEffect, useState } from "react";

export interface FlowStep {
  short: string;
  title: string;
  text: string;
}

// Five steps from report to second payment. Auto advances every 4s until someone picks a step.
export function MoneyFlowStepper({ steps }: { steps: FlowStep[] }) {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduced || !auto) return;
    const id = setInterval(() => setStep((s) => (s + 1) % steps.length), 4000);
    return () => clearInterval(id);
  }, [auto, steps.length]);

  const s = steps[step];
  return (
    <section style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
      <div className="wrap flex flex-col gap-12" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="flex flex-wrap items-start gap-x-16 gap-y-6">
          <div className="flex min-w-0 flex-col gap-2.5" style={{ flex: "0 1 300px" }}>
            <span className="eyebrow">How the money moves</span>
            <span className="num" style={{ font: "700 88px/0.9 var(--font-display)", letterSpacing: "-0.05em", color: "var(--accent)" }}>
              0{step + 1}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-3.5" style={{ flex: "1 1 520px", minHeight: 170 }} id="flow-panel" role="tabpanel" aria-live="polite">
            <div className="quote-in flex flex-col gap-3.5" key={step}>
              <h2 className="step-big">{s.title}</h2>
              <p className="lead" style={{ maxWidth: 620 }}>
                {s.text}
              </p>
            </div>
          </div>
        </div>
        <div className="steps-track" role="tablist" aria-label="Steps">
          <div className="steps-line" aria-hidden>
            <i style={{ width: `${(step / (steps.length - 1)) * 100}%` }} />
          </div>
          {steps.map((st, i) => (
            <button
              key={st.short}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-controls="flow-panel"
              aria-label={`Step ${i + 1}: ${st.short}`}
              className={`step-btn${i === step ? " on" : i < step ? " past" : ""}`}
              onClick={() => {
                setStep(i);
                setAuto(false);
              }}
            >
              <span className="step-dot" />
              <span className="step-label">{st.short}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
