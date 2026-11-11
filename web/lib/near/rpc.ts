// Minimal NEAR JSON-RPC client. Works in the browser and on the server, with no SDK dependency.

export type RpcErrorKind = "network" | "timeout" | "rpc" | "contract" | "not_found";

export class RpcError extends Error {
  constructor(
    message: string,
    readonly kind: RpcErrorKind,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export interface RpcOptions {
  url: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

const RETRYABLE: RpcErrorKind[] = ["network", "timeout"];

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): string {
  const binary = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once<T>(opts: RpcOptions, method: string, params: unknown): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ jsonrpc: "2.0", id: "lifeline", method, params }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new RpcError(timedOut ? `${method} timed out` : `Couldn't reach the NEAR RPC (${opts.url})`, timedOut ? "timeout" : "network", err);
  }
  if (res.status >= 500 || res.status === 429) {
    throw new RpcError(`NEAR RPC answered ${res.status}`, "network");
  }
  const body = await res.json().catch(() => {
    throw new RpcError("NEAR RPC sent a response that isn't JSON", "network");
  });
  if (body.error) {
    const name: string = body.error.cause?.name ?? body.error.name ?? "";
    const info = body.error.cause?.info ?? body.error.data;
    if (name === "UNKNOWN_ACCOUNT" || name === "UNKNOWN_TRANSACTION") {
      throw new RpcError(name, "not_found", info);
    }
    if (name === "TIMEOUT_ERROR") throw new RpcError(`${method} timed out on the RPC node`, "timeout", info);
    throw new RpcError(`${method} failed: ${name || JSON.stringify(body.error)}`, "rpc", body.error);
  }
  return body.result as T;
}

export async function rpcCall<T>(opts: RpcOptions, method: string, params: unknown): Promise<T> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      return await once<T>(opts, method, params);
    } catch (err) {
      if (!(err instanceof RpcError) || !RETRYABLE.includes(err.kind) || attempt >= retries) throw err;
      await sleep(300 * 2 ** attempt);
    }
  }
}

interface CallFunctionResult {
  result?: number[];
  error?: string;
  logs: string[];
}

// Read-only contract call. A contract panic becomes an RpcError of kind "contract".
export async function viewFunction<T>(opts: RpcOptions, contractId: string, method: string, args: object = {}): Promise<T> {
  const res = await rpcCall<CallFunctionResult>(opts, "query", {
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  });
  if (res.error) throw new RpcError(`${contractId}.${method} failed: ${res.error}`, "contract", res.error);
  const text = new TextDecoder().decode(Uint8Array.from(res.result ?? []));
  return (text ? JSON.parse(text) : null) as T;
}

export interface AccountView {
  amount: string;
  locked: string;
  storage_usage: number;
}

export async function viewAccount(opts: RpcOptions, accountId: string): Promise<AccountView | null> {
  try {
    return await rpcCall<AccountView>(opts, "query", { request_type: "view_account", finality: "final", account_id: accountId });
  } catch (err) {
    if (err instanceof RpcError && err.kind === "not_found") return null;
    throw err;
  }
}

export type WaitUntil = "INCLUDED" | "EXECUTED_OPTIMISTIC" | "EXECUTED" | "FINAL";

export async function txStatus<T>(opts: RpcOptions, txHash: string, senderId: string, waitUntil: WaitUntil = "FINAL"): Promise<T> {
  return rpcCall<T>(opts, "tx", { tx_hash: txHash, sender_account_id: senderId, wait_until: waitUntil });
}
