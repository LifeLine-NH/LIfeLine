"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function Countdown({ endsAtMs, endedText = "Closed" }: { endsAtMs: number; endedText?: string }) {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null);

  if (now === null) return <span>…</span>;
  const left = Math.max(0, Math.floor(endsAtMs / 1000) - now);
  if (left === 0) return <span>{endedText}</span>;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return <span>{h > 0 ? `${h}h ${m}m` : `${m}:${s.toString().padStart(2, "0")}`} left</span>;
}
