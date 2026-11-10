import { describe, expect, it } from "vitest";
import { LifelineChainClient } from "../src/chain/client.js";

describe("LifelineChainClient Multi-Account & Quorum State Machine (Section 5)", () => {
  it("uses 4 separate NEAR accounts for geo, fact, sev, and red verifiers and reaches Bidding on 3 Yes votes", async () => {
    const chain = new LifelineChainClient({ mode: "stub" });

    expect(new Set([
      chain.getAccountId("geo"),
      chain.getAccountId("fact"),
      chain.getAccountId("sev"),
      chain.getAccountId("red")
    ]).size).toBe(4);

    await chain.submitCase({
      case_id: "s5ptx-2024-09-10-001",
      geohash: "s5ptx",
      bundle_hash: "a".repeat(64),
      requested_tier: 3
    });

    await chain.vote("geo", {
      case_id: "s5ptx-2024-09-10-001",
      verdict: "Yes",
      confidence_bps: 9200,
      tier: 0,
      evidence_hash: "b".repeat(64),
      attestation_hash: null
    });

    await chain.vote("fact", {
      case_id: "s5ptx-2024-09-10-001",
      verdict: "Yes",
      confidence_bps: 9000,
      tier: 0,
      evidence_hash: "c".repeat(64),
      attestation_hash: null
    });

    await chain.vote("sev", {
      case_id: "s5ptx-2024-09-10-001",
      verdict: "Yes",
      confidence_bps: 8800,
      tier: 3,
      evidence_hash: "d".repeat(64),
      attestation_hash: null
    });

    const c = await chain.getCase("s5ptx-2024-09-10-001");
    expect(c?.status).toBe("Bidding");
    expect(c?.tier).toBe(3);
    expect(BigInt(c?.cap ?? "0")).toBeGreaterThan(BigInt(0));
  });

  it("transitions to Rejected when 2 verifiers vote No", async () => {
    const chain = new LifelineChainClient({ mode: "stub" });
    await chain.submitCase({
      case_id: "s5ptx-2025-01-15-002",
      geohash: "s5ptx",
      bundle_hash: "1".repeat(64),
      requested_tier: 4
    });

    await chain.vote("fact", {
      case_id: "s5ptx-2025-01-15-002",
      verdict: "No",
      confidence_bps: 9500,
      tier: 0,
      evidence_hash: "2".repeat(64),
      attestation_hash: null
    });

    await chain.vote("red", {
      case_id: "s5ptx-2025-01-15-002",
      verdict: "No",
      confidence_bps: 9100,
      tier: 0,
      evidence_hash: "3".repeat(64),
      attestation_hash: null
    });

    const c = await chain.getCase("s5ptx-2025-01-15-002");
    expect(c?.status).toBe("Rejected");
  });
});
