import { RpcError } from "../near/rpc";

// Turns wallet and contract errors into one sentence a donor can act on.
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  const text = raw.toLowerCase();

  if (/(reject|denied|cancel|user closed|closed by user|declined)/.test(text)) {
    return "You cancelled in your wallet. Nothing was sent.";
  }
  if (err instanceof RpcError && (err.kind === "network" || err.kind === "timeout")) {
    return "Couldn't reach the NEAR network. Check your connection and try again.";
  }
  if (text.includes("doesn't have enough balance") || text.includes("not enough balance")) {
    return "Your token balance is too low for this amount.";
  }
  if (text.includes("is not registered")) {
    return "An account involved isn't registered with the token. If it's yours, use the test token button first.";
  }
  if (text.includes("exactly 1 yoctonear")) {
    return "The wallet changed the attached deposit, so the token refused the transfer.";
  }
  if (text.includes("notenoughbalance") || text.includes("lack balance")) {
    return "Your account doesn't have enough NEAR to pay the network fee.";
  }
  return `Something went wrong: ${raw}`;
}

export function describeReceiverError(message: string): string {
  return `The relief contract refused it: ${message.replace(/^Smart contract panicked:\s*/, "")}`;
}
