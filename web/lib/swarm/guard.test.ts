import { describe, expect, it } from "vitest";
import type { ContractConfig, Pool } from "../types";
import { nextSequence, runBlockedReason } from "./guard";

// Values read from lifeline-demo.testnet on 14 Nov 2026.
const config: ContractConfig = {
  bidding_window_secs: 90,
  proof_deadline_secs: 300,
  tranche1_bps: 4000,
  tier_cap: ["0", "2000000000", "5000000000", "10000000000"],
  max_case_bps: 2000,
  daily_limit: "25000000000",
};
const pool: Pool = { balance: "93880000000", reserved: "4080000000", available: "89800000000", disbursed_today: "6120000000", donors_count: 1 };
const now = Date.UTC(2026, 10, 14, 9, 0, 0);
const nsAgo = (secs: number) => (BigInt(now - secs * 1000) * BigInt(1_000_000)).toString();

describe("runBlockedReason", () => {
  it("allows a run when the last case is old and the budget is there", () => {
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: nsAgo(600), funded: true, pool, config })).toBeNull();
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: null, funded: true, pool, config })).toBeNull();
  });

  it("waits while the previous run may still be sending transactions", () => {
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: nsAgo(15), latestStatus: "Awarded", funded: false, pool, config })).toMatch(/15 seconds ago.*wait 25 seconds/);
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: nsAgo(15), latestStatus: "Open", funded: false, pool, config })).not.toBeNull();
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: nsAgo(40), latestStatus: "Awarded", funded: false, pool, config })).toBeNull();
  });

  it("lets the next run start as soon as the previous case is final", () => {
    for (const latestStatus of ["Rejected", "NeedsReview", "Delivered", "Expired"]) {
      expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: nsAgo(12), latestStatus, funded: true, pool, config })).toBeNull();
    }
  });

  it("refuses funded runs once the daily limit can't cover a tier 3 cap", () => {
    const spent = { ...pool, disbursed_today: "20000000001" };
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: null, funded: true, pool: spent, config })).toMatch(/daily payout limit/);
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: null, funded: false, pool: spent, config })).toBeNull();
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: null, funded: true, pool: { ...pool, disbursed_today: "20000000000" }, config })).toBeNull();
  });

  it("refuses funded runs when the pool is mostly reserved", () => {
    expect(runBlockedReason({ nowMs: now, latestOpenedAtNs: null, funded: true, pool: { ...pool, available: "4999999999" }, config })).toMatch(/unreserved/);
  });
});

describe("nextSequence", () => {
  // Case ids on lifeline-demo.testnet on 14 Nov 2026.
  const ids = ["s6177-2024-09-10-002-s1", "s6177-2024-09-10-001-s5", "s6177-2024-09-10-001-s1", "s1t7d-2025-02-01-001-s3", "s4nh7-2025-01-15-001-s2"];

  it("moves past the highest sequence for that scenario only", () => {
    expect(nextSequence(ids, "S1")).toBe(3);
    expect(nextSequence(ids, "S2")).toBe(2);
    expect(nextSequence(ids, "S5")).toBe(2);
  });

  it("starts at 1 for a scenario with no cases and isn't fooled by similar tags", () => {
    expect(nextSequence(["x-2025-01-01-007-s10"], "S1")).toBe(1);
    expect(nextSequence([], "S3")).toBe(1);
    expect(nextSequence(["s4nh7-2025-01-15-999-s2"], "S2")).toBe(1000);
  });
});
