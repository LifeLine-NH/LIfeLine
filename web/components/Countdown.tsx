"use client";

import { useEffect, useState } from "react";

export function Countdown({ endsAtMs, endedText = "Closed" }: { endsAtMs: number; endedText?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return <span>…</span>;
  const left = Math.max(0, Math.floor((endsAtMs - now) / 1000));
  if (left === 0) return <span>{endedText}</span>;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return <span>{h > 0 ? `${h}h ${m}m` : `${m}:${s.toString().padStart(2, "0")}`} left</span>;
}
