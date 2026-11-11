import { type ExpectedTransfer, failureMessage, type FinalOutcome, classifyFtTransferCall, isFailure, type TransferResult } from "../near/outcome";
import { RpcError, type RpcOptions, txStatus } from "../near/rpc";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Waits until the transaction is final. Right after the wallet returns, an RPC node may not know the
// transaction yet (UNKNOWN_TRANSACTION) or may time out waiting; both are retried until the deadline.
export async function waitForFinal(rpc: RpcOptions, hash: string, signer: string, deadlineMs = 90_000): Promise<FinalOutcome> {
  const started = Date.now();
  let delay = 1000;
  for (;;) {
    try {
      return await txStatus<FinalOutcome>(rpc, hash, signer, "FINAL");
    } catch (err) {
      const retryable = err instanceof RpcError && ["not_found", "timeout", "network"].includes(err.kind);
      if (!retryable || Date.now() - started > deadlineMs) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 5000);
    }
  }
}

export async function confirmDonation(rpc: RpcOptions, hash: string, expected: ExpectedTransfer, deadlineMs?: number): Promise<TransferResult> {
  const outcome = await waitForFinal(rpc, hash, expected.signer, deadlineMs);
  return classifyFtTransferCall(outcome, expected);
}

// For plain calls like the test token faucet: any failed receipt means it didn't work.
export async function confirmPlainCall(rpc: RpcOptions, hash: string, signer: string): Promise<void> {
  const outcome = await waitForFinal(rpc, hash, signer);
  if (isFailure(outcome.status)) throw new Error(failureMessage(outcome.status.Failure));
  const failed = outcome.receipts_outcome.find((r) => isFailure(r.outcome.status));
  if (failed && isFailure(failed.outcome.status)) throw new Error(failureMessage(failed.outcome.status.Failure));
}

// A donation waiting for confirmation survives a page reload, so the donor always sees the result.
export interface PendingDonation {
  hash: string;
  signer: string;
  token: string;
  receiver: string;
  amount: string;
  at: number;
}

const KEY = "lifeline:pending-donation";

export const pendingStore = {
  save(p: PendingDonation) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      // Private mode or blocked storage: the flow still works, it just can't resume after a reload.
    }
  },
  load(): PendingDonation | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      const p = raw ? (JSON.parse(raw) as PendingDonation) : null;
      return p && Date.now() - p.at < 30 * 60_000 ? p : null;
    } catch {
      return null;
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
