"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const pad = (n: number) => String(n).padStart(2, "0");

// "01:42:18" until endsAtMs, then endedText. Renders a placeholder on the server so the clock never mismatches.
export function Countdown({
  endsAtMs,
  endedText = "Closed",
  className = "",
  style,
}: {
  endsAtMs: number;
  endedText?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null);
  if (now === null) {
    return (
      <span className={`tick ${className}`} style={style}>
        --:--:--
      </span>
    );
  }
  const left = Math.max(0, Math.floor(endsAtMs / 1000) - now);
  if (left === 0) {
    return (
      <span className={className} style={style}>
        {endedText}
      </span>
    );
  }
  return (
    <span className={`tick ${className}`} style={style} role="timer" aria-live="off">
      {pad(Math.floor(left / 3600))}:{pad(Math.floor((left % 3600) / 60))}:{pad(left % 60)}
    </span>
  );
}

// True once endsAtMs has passed; false on the server.
export function useEnded(endsAtMs: number): boolean {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null);
  return now !== null && now * 1000 >= endsAtMs;
}
