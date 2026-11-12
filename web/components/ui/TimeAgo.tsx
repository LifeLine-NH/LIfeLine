"use client";

import { useSyncExternalStore } from "react";
import { formatShort, timeAgo } from "@/lib/format";
import type { Nanos } from "@/lib/types";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 30_000);
  return () => clearInterval(id);
}
const nowMinute = () => Math.floor(Date.now() / 60_000);

// Server and first paint show the UTC time; the browser then switches to "2 min ago".
export function TimeAgo({ at }: { at: Nanos }) {
  const minute = useSyncExternalStore(subscribe, nowMinute, () => null);
  const exact = `${formatShort(at)} UTC`;
  return <span title={exact}>{minute === null ? formatShort(at) : timeAgo(at, minute * 60_000)}</span>;
}
