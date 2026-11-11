import { describe, expect, it } from "vitest";
import accepted from "../near/__fixtures__/mainnet-accepted.json";
import type { FinalOutcome } from "../near/outcome";
import { confirmDonation, waitForFinal } from "./confirm";

const outcome = accepted as FinalOutcome;
const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

// RPC node that doesn't know the transaction for the first `misses` calls, then returns the real outcome.
function laggingRpc(misses: number) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    const body =
      calls <= misses
        ? { jsonrpc: "2.0", id: 1, error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_TRANSACTION", info: {} } } }
        : { jsonrpc: "2.0", id: 1, result: outcome };
    return new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
  return { rpc: { url: "http://fake", fetchImpl, retries: 0 }, calls: () => calls };
}

describe("waitForFinal", () => {
  it("keeps asking until the node knows the transaction", async () => {
    const { rpc, calls } = laggingRpc(2);
    const got = await waitForFinal(rpc, outcome.transaction.hash, outcome.transaction.signer_id, 20_000);
    expect(got.transaction.hash).toBe(outcome.transaction.hash);
    expect(calls()).toBe(3);
  }, 15_000);

  it("gives up after the deadline", async () => {
    const { rpc } = laggingRpc(100);
    await expect(waitForFinal(rpc, "x", "y", 1)).rejects.toThrow(/UNKNOWN_TRANSACTION/);
  });
});

describe("confirmDonation", () => {
  it("returns the classified result of the real transaction", async () => {
    const { rpc } = laggingRpc(0);
    const r = await confirmDonation(rpc, outcome.transaction.hash, {
      token: USDC,
      receiver: "v2.ref-finance.near",
      signer: outcome.transaction.signer_id,
      amount: BigInt(850360584),
    });
    expect(r.kind).toBe("accepted");
  });
});
