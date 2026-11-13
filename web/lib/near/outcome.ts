import { fromBase64 } from "./rpc";

// Shapes of the NEAR RPC `tx` response that we rely on.

export type ExecutionStatus =
  | { SuccessValue: string }
  | { SuccessReceiptId: string }
  | { Failure: unknown }
  | string;

export interface ExecutionOutcomeWithId {
  id: string;
  outcome: {
    executor_id: string;
    logs: string[];
    status: ExecutionStatus;
    receipt_ids: string[];
    gas_burnt: number;
  };
}

export interface RpcAction {
  FunctionCall?: { method_name: string; args: string; gas: number | string; deposit: string };
  [other: string]: unknown;
}

export interface FinalOutcome {
  status: ExecutionStatus;
  final_execution_status?: string;
  transaction: { hash: string; signer_id: string; receiver_id: string; actions: Array<RpcAction | string> };
  transaction_outcome: ExecutionOutcomeWithId;
  receipts_outcome: ExecutionOutcomeWithId[];
}

export interface NepEvent {
  standard: string;
  version?: string;
  event: string;
  data: unknown;
  executor: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export function isFailure(status: ExecutionStatus): status is { Failure: unknown } {
  return isObj(status) && "Failure" in status;
}

// Turns the nested Failure object into one readable line.
export function failureMessage(failure: unknown): string {
  const stack: unknown[] = [failure];
  while (stack.length) {
    const node = stack.shift();
    if (isObj(node)) {
      if (typeof node.ExecutionError === "string") return node.ExecutionError;
      for (const v of Object.values(node)) stack.push(v);
    }
  }
  if (isObj(failure) && isObj(failure.ActionError) && isObj(failure.ActionError.kind)) {
    const [kind, detail] = Object.entries(failure.ActionError.kind)[0] ?? [];
    return detail ? `${kind}: ${JSON.stringify(detail)}` : String(kind);
  }
  return JSON.stringify(failure);
}

// NEP-297 events from every receipt, tagged with the contract that emitted them.
export function collectEvents(outcome: FinalOutcome): NepEvent[] {
  const events: NepEvent[] = [];
  for (const r of outcome.receipts_outcome) {
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const parsed = JSON.parse(log.slice("EVENT_JSON:".length));
        if (typeof parsed.standard === "string" && typeof parsed.event === "string") {
          events.push({ ...parsed, executor: r.outcome.executor_id });
        }
      } catch {
        // Malformed event logs are ignored; they don't change what the transfer did.
      }
    }
  }
  return events;
}

export function decodeSuccessValue(status: ExecutionStatus): unknown {
  if (!isObj(status) || !("SuccessValue" in status) || typeof status.SuccessValue !== "string") return undefined;
  if (status.SuccessValue === "") return null;
  return JSON.parse(fromBase64(status.SuccessValue));
}

export interface ExpectedTransfer {
  token: string;
  receiver: string;
  signer: string;
  amount: bigint;
}

export type TransferResult =
  | { kind: "mismatch"; detail: string }
  | { kind: "failed"; reason: string; events: NepEvent[] }
  | {
      kind: "accepted" | "partial" | "refunded";
      used: bigint;
      refunded: bigint;
      receiverError: string | null;
      events: NepEvent[];
    };

// Reads what an ft_transfer_call really did. The transaction can "succeed" while the receiver
// rejected everything, so the only trustworthy number is the used amount ft_resolve_transfer returns.
export function classifyFtTransferCall(outcome: FinalOutcome, expected: ExpectedTransfer): TransferResult {
  const tx = outcome.transaction;
  if (tx.receiver_id !== expected.token) return { kind: "mismatch", detail: `Sent to ${tx.receiver_id}, expected the token ${expected.token}` };
  if (tx.signer_id !== expected.signer) return { kind: "mismatch", detail: `Signed by ${tx.signer_id}, expected ${expected.signer}` };

  const call = tx.actions.map((a) => (isObj(a) ? a.FunctionCall : undefined)).find((f) => f?.method_name === "ft_transfer_call");
  if (!call) return { kind: "mismatch", detail: "The transaction has no ft_transfer_call" };
  let args: { receiver_id?: string; amount?: string };
  try {
    args = JSON.parse(fromBase64(call.args));
  } catch {
    return { kind: "mismatch", detail: "Couldn't read the transfer arguments" };
  }
  if (args.receiver_id !== expected.receiver) return { kind: "mismatch", detail: `Transfer went to ${args.receiver_id}, expected ${expected.receiver}` };
  if (args.amount !== expected.amount.toString()) return { kind: "mismatch", detail: `Transfer amount was ${args.amount}, expected ${expected.amount}` };

  const events = collectEvents(outcome);
  if (isFailure(outcome.status)) return { kind: "failed", reason: failureMessage(outcome.status.Failure), events };

  const value = decodeSuccessValue(outcome.status);
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { kind: "failed", reason: `Unexpected result from the token: ${JSON.stringify(value)}`, events };
  }
  const used = BigInt(value);
  const receiverFailure = outcome.receipts_outcome.find((r) => r.outcome.executor_id === expected.receiver && isFailure(r.outcome.status));
  const receiverError = receiverFailure && isFailure(receiverFailure.outcome.status) ? failureMessage(receiverFailure.outcome.status.Failure) : null;

  return {
    kind: used === expected.amount ? "accepted" : used === BigInt(0) ? "refunded" : "partial",
    used,
    refunded: expected.amount - used,
    receiverError,
    events,
  };
}
