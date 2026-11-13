"use client";

import { useEffect, useRef, useState } from "react";

export interface PoolFigure {
  value: number;
  decimals: number;
  label: string;
  note: string;
  href: string | null;
  sample: boolean;
}

const fmt = (n: number, d: number) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// Figures render at their real value first (no JS, reduced motion), then count up once when scrolled into view.
export function PoolStats({ figures }: { figures: PoolFigure[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduced || !("IntersectionObserver" in window)) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / 1400);
          setT(1 - Math.pow(1 - p, 3));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        setT(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="grid gap-x-8 gap-y-10" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
      {figures.map((p) => {
        const text = fmt(p.value * t, p.decimals);
        return (
          <div key={p.label} className="flex flex-col gap-2.5">
            {p.sample ? (
              <span className="stat-n src-sample" title="Sample data: there is no record behind this number.">
                {text}
              </span>
            ) : p.href ? (
              <a className="stat-n" href={p.href} target="_blank" rel="noreferrer" aria-label={`${fmt(p.value, p.decimals)} ${p.label}`}>
                {text}
              </a>
            ) : (
              <span className="stat-n">{text}</span>
            )}
            <span style={{ fontWeight: 600 }}>{p.label}</span>
            <span className="cap">{p.note}</span>
          </div>
        );
      })}
    </div>
  );
}
