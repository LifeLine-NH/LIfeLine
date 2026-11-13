"use client";

import { config } from "@/lib/config";
import { buildCoordinatorDecision } from "@/lib/ngo/actions";
import { TxResult } from "./TxResult";
import { busyLabel, contractBlocker, useTx } from "./useTx";

// Confirm or reject a split case. Only an account registered as coordinator on the contract can do this;
// anyone else gets the contract's own refusal.
export function CoordinatorButtons({ caseId }: { caseId: string }) {
  const blocker = contractBlocker();
  const { state, run, busy } = useTx();
  const label = busyLabel(state);
  return (
    <span className="flex flex-col items-end gap-2">
      <span className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!blocker || busy} title={blocker ?? undefined} onClick={() => run(async () => buildCoordinatorDecision(config.contractId, caseId, "confirm"))}>
          {label ?? "Confirm"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!blocker || busy} title={blocker ?? undefined} onClick={() => run(async () => buildCoordinatorDecision(config.contractId, caseId, "reject"))}>
          Reject
        </button>
      </span>
      <span aria-live="polite" style={{ maxWidth: 360 }}>
        <TxResult state={state} done="Decision recorded." />
      </span>
    </span>
  );
}
