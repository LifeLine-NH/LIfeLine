"use client";

import { Countdown, useEnded } from "./Countdown";

// Label and value switch together when bidding closes.
export function BidClock({ endsAtMs }: { endsAtMs: number }) {
  const ended = useEnded(endsAtMs);
  return (
    <div>
      <span className="cap">{ended ? "Status" : "Bidding closes in"}</span>
      <p className="num" style={{ fontWeight: 650, fontSize: 17, marginTop: 2, color: ended ? "var(--ink-3)" : "var(--ink)" }}>
        <Countdown endsAtMs={endsAtMs} endedText="Bidding closed" />
      </p>
    </div>
  );
}
