import { describe, expect, it } from "vitest";
import { TGAS } from "../near/units";
import { buildBid, buildCoordinatorDecision, buildProfile, buildProof, buildProofRecord, buildRegister, checkBid, FormError, proofWarning } from "./actions";

const C = "lifeline.testnet";
const args = (tx: ReturnType<typeof buildBid>) => tx.actions[0].params;

describe("buildProfile", () => {
  it("normalises regions and keeps an optional payout address", () => {
    const p = buildProfile({ name: " Rapid response ", website: "https://rapid.example", regions: "S4P, kr8  u1h", payoutAsset: "base-usdc", payoutAddress: "0xabc" });
    expect(p).toEqual({ name: "Rapid response", website: "https://rapid.example", regions: ["s4p", "kr8", "u1h"], payout: { asset: "base-usdc", address: "0xabc" } });
  });
  it("rejects a missing name, plain http and letters outside the geohash alphabet", () => {
    expect(() => buildProfile({ name: "", website: "", regions: "s4p", payoutAsset: "", payoutAddress: "" })).toThrow(FormError);
    expect(() => buildProfile({ name: "Org", website: "http://x.org", regions: "s4p", payoutAsset: "", payoutAddress: "" })).toThrow(/https/);
    expect(() => buildProfile({ name: "Org", website: "", regions: "s4a", payoutAsset: "", payoutAddress: "" })).toThrow(/geohash/);
  });
});

describe("buildRegister", () => {
  it("attaches the bond in yoctoNEAR to register_ngo", () => {
    const tx = buildRegister(C, "ab".repeat(32), "1.5");
    expect(tx.receiverId).toBe(C);
    expect(args(tx).methodName).toBe("register_ngo");
    expect(args(tx).deposit).toBe("1500000000000000000000000");
    expect(args(tx).args).toEqual({ profile_hash: "ab".repeat(32) });
  });
  it("refuses a zero or malformed bond", () => {
    expect(() => buildRegister(C, "x", "0")).toThrow(FormError);
    expect(() => buildRegister(C, "x", "one")).toThrow(FormError);
  });
});

describe("checkBid and buildBid", () => {
  const base = { caseId: "c1", askText: "3200", etaText: "12", plan: "Boats from the north bank with pre staged kits.", cap: "5000000000", decimals: 6, symbol: "USDC" };
  it("turns a valid bid into exact base units and a place_bid call", () => {
    const { ask, eta } = checkBid(base);
    expect(ask).toBe(BigInt(3_200_000_000));
    const tx = buildBid(C, "c1", ask, eta, "cd".repeat(32));
    expect(args(tx).methodName).toBe("place_bid");
    expect(args(tx).args).toEqual({ case_id: "c1", ask: "3200000000", eta_hours: 12, plan_hash: "cd".repeat(32) });
    expect(args(tx).deposit).toBe("0");
    expect(args(tx).gas).toBe((BigInt(50) * TGAS).toString());
  });
  it("refuses asks over the cap, bad hours and an empty plan", () => {
    expect(() => checkBid({ ...base, askText: "5400" })).toThrow("The most you can ask for this case is 5,000 USDC.");
    expect(() => checkBid({ ...base, askText: "12.1234567" })).toThrow(/decimal/);
    expect(() => checkBid({ ...base, etaText: "1.5" })).toThrow(/whole number/);
    expect(() => checkBid({ ...base, etaText: "0" })).toThrow(/whole number/);
    expect(() => checkBid({ ...base, plan: "boats" })).toThrow(/plan/);
  });
});

describe("proof", () => {
  const input = { caseId: "c1", ngo: "ngo.testnet", summary: "600 hygiene kits delivered by boat to the east side.", householdsText: "212", plannedText: "200", location: "S4P7K" };
  it("builds a record the verifiers can check", () => {
    const r = buildProofRecord(input, new Date("2026-11-13T10:00:00Z"));
    expect(r).toMatchObject({ case_id: "c1", households_reached: 212, planned_households: 200, location: { geohash: "s4p7k" }, delivered_at: "2026-11-13T10:00:00.000Z" });
    const tx = buildProof(C, "c1", "ef".repeat(32), "/api/evidence/x");
    expect(args(tx).args).toEqual({ case_id: "c1", proof_hash: "ef".repeat(32), proof_uri: "/api/evidence/x" });
  });
  it("warns about the same household ratio the delivery check rejects", () => {
    expect(proofWarning(212, 200)).toBeNull();
    expect(proofWarning(50000, 600)).toMatch(/far from your plan/);
    expect(proofWarning(100, 600)).toMatch(/far from your plan/);
  });
  it("refuses non numeric households and a bad location", () => {
    expect(() => buildProofRecord({ ...input, householdsText: "two hundred" })).toThrow(FormError);
    expect(() => buildProofRecord({ ...input, location: "lagos" })).toThrow(/geohash/);
  });
});

describe("buildCoordinatorDecision", () => {
  it("calls human_confirm or human_reject with the case id", () => {
    expect(args(buildCoordinatorDecision(C, "c9", "confirm")).methodName).toBe("human_confirm");
    expect(args(buildCoordinatorDecision(C, "c9", "reject")).args).toEqual({ case_id: "c9" });
  });
});
