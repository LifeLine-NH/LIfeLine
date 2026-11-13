"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-reads contract views every few seconds. Off in stub mode, where nothing changes.
export function AutoRefresh({ enabled, everyMs = 5000 }: { enabled: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [enabled, everyMs, router]);
  return null;
}
