import { describe, expect, it } from "vitest";
import accepted from "./__fixtures__/mainnet-accepted.json";
import partial from "./__fixtures__/mainnet-partial.json";
import panicked from "./__fixtures__/mainnet-receiver-panicked.json";
import refunded from "./__fixtures__/mainnet-refunded.json";
import { classifyFtTransferCall, collectEvents, type FinalOutcome } from "./outcome";

// Real NEAR mainnet `tx` responses for USDC ft_transfer_call, fetched from rpc.mainnet.fastnear.com.
const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

const cases = {
  accepted: { outcome: accepted as FinalOutcome, receiver: "v2.ref-finance.near", amount: BigInt(850360584) },
  refunded: { outcome: refunded as FinalOutcome, receiver: "dclv2.ref-labs.near", amount: BigInt(300000000) },
  partial: { outcome: partial as FinalOutcome, receiver: "dclv2.ref-labs.near", amount: BigInt(200000000) },
  panicked: { outcome: panicked as FinalOutcome, receiver: "dclv2.ref-labs.near", amount: BigInt(211471571) },
};

const expected = (c: (typeof cases)[keyof typeof cases]) => ({
  token: USDC,
  receiver: c.receiver,
  signer: c.outcome.transaction.signer_id,
  amount: c.amount,
});

describe("classifyFtTransferCall on real mainnet outcomes", () => {
  it("reports a transfer the receiver kept in full", () => {
    const r = classifyFtTransferCall(cases.accepted.outcome, expected(cases.accepted));
    expect(r).toMatchObject({ kind: "accepted", used: BigInt(850360584), refunded: BigInt(0), receiverError: null });
  });

  it("reports a full refund when the receiver returned everything", () => {
    const r = classifyFtTransferCall(cases.refunded.outcome, expected(cases.refunded));
    expect(r).toMatchObject({ kind: "refunded", used: BigInt(0), refunded: BigInt(300000000) });
  });

  it("reports a partial refund with the exact split", () => {
    const r = classifyFtTransferCall(cases.partial.outcome, expected(cases.partial));
    expect(r).toMatchObject({ kind: "partial", used: BigInt(73646561), refunded: BigInt(126353439) });
  });

  it("catches a receiver that panicked even though the transaction succeeded", () => {
    expect("SuccessValue" in (cases.panicked.outcome.status as object)).toBe(true);
    const r = classifyFtTransferCall(cases.panicked.outcome, expected(cases.panicked));
    expect(r.kind).toBe("refunded");
    if (r.kind === "refunded") expect(r.receiverError).toBe("Smart contract panicked: E204: slippage error");
  });

  it("refuses to classify a transaction that isn't the expected transfer", () => {
    const c = cases.accepted;
    expect(classifyFtTransferCall(c.outcome, { ...expected(c), token: "other.near" }).kind).toBe("mismatch");
    expect(classifyFtTransferCall(c.outcome, { ...expected(c), signer: "someone-else.near" }).kind).toBe("mismatch");
    expect(classifyFtTransferCall(c.outcome, { ...expected(c), receiver: "relief.near" }).kind).toBe("mismatch");
    expect(classifyFtTransferCall(c.outcome, { ...expected(c), amount: BigInt(1) }).kind).toBe("mismatch");
  });
});

describe("collectEvents", () => {
  it("finds the refund transfer event emitted by the token", () => {
    const events = collectEvents(cases.panicked.outcome);
    const refund = events.find((e) => e.standard === "nep141" && JSON.stringify(e.data).includes('"memo":"refund"'));
    expect(refund?.executor).toBe(USDC);
  });
});
