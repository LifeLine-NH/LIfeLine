"use client";

import { useEffect, useState } from "react";
import { TxResult } from "@/components/ngo/TxResult";
import { busyLabel, contractBlocker, useTx } from "@/components/ngo/useTx";
import { config } from "@/lib/config";
import { formatAmount } from "@/lib/format";
import { buildExpire, expiryDue } from "@/lib/ngo/actions";
import type { Case } from "@/lib/types";

// Shown once a deadline has passed. The contract lets any account close the case, so nobody has to
// trust the team to release held money back to the pool.
export function ExpireButton({ c }: { c: Case }) {
  const [due, setDue] = useState<"proof" | "bidding" | null>(null);
  const { state, run, busy } = useTx();
  const blocker = contractBlocker();

  useEffect(() => {
    const check = () => setDue(expiryDue(c, Date.now()));
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, [c]);

  if (!due) return null;
  const held = BigInt(c.award_amount || "0") - BigInt(c.tranche1_paid || "0");
  const text =
    due === "proof"
      ? `The proof deadline has passed. Closing the case returns the held ${formatAmount(held)} to the pool and counts a failed delivery against the responder.`
      : "The bidding window has passed with no award. Closing the case marks it expired.";

  return (
    <div className="notice n-info mt-4 flex flex-wrap items-center justify-between gap-3" role="status">
      <span style={{ flex: "1 1 320px" }}>
        <b>Anyone can close this case.</b> {text}
      </span>
      <span className="flex flex-col items-end gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!blocker || busy} title={blocker ?? undefined} onClick={() => run(async () => buildExpire(config.contractId, c.id))}>
          {busyLabel(state) ?? (due === "proof" ? "Return escrow to pool" : "Close case")}
        </button>
        <span aria-live="polite" style={{ maxWidth: 360 }}>
          <TxResult state={state} done="Case closed." />
        </span>
      </span>
    </div>
  );
}
