import type { ContractConfig, Pool } from "../types";

// The in-memory lock in /api/swarm/run only covers one server instance, so these checks read the
// contract itself: they hold across every instance and still let the recorded cases replay.
// Recorded testnet runs finish their last transaction 11 to 35 seconds after the case opens.
export const RUN_SPACING_SECS = 40;
const FINAL = new Set(["Rejected", "NeedsReview", "Delivered", "Expired"]);
// The funded scenarios (S1, S5) request tier 3, and their simulated bids sit just under that cap.
const FUNDED_TIER = 3;

export interface GuardInput {
  nowMs: number;
  latestOpenedAtNs: string | null;
  latestStatus?: string;
  funded: boolean;
  pool: Pool;
  config: ContractConfig;
}

export function runBlockedReason({ nowMs, latestOpenedAtNs, latestStatus, funded, pool, config }: GuardInput): string | null {
  if (latestOpenedAtNs && !(latestStatus && FINAL.has(latestStatus))) {
    const ageSecs = (nowMs - Number(BigInt(latestOpenedAtNs) / BigInt(1_000_000))) / 1000;
    if (ageSecs >= 0 && ageSecs < RUN_SPACING_SECS) {
      return `A run started ${Math.floor(ageSecs)} seconds ago. It may still be running and runs share the verifier keys, so wait ${Math.ceil(RUN_SPACING_SECS - ageSecs)} seconds or replay a recorded case.`;
    }
  }
  if (!funded) return null;
  const tierCap = BigInt(config.tier_cap[FUNDED_TIER - 1] ?? "0");
  const dailyLeft = BigInt(config.daily_limit) - BigInt(pool.disbursed_today);
  if (dailyLeft < tierCap) {
    return "The contract's daily payout limit is nearly used up for today (it resets at 00:00 UTC), so a funded run would be refused. Replay a recorded case instead.";
  }
  if (BigInt(pool.available) < tierCap) {
    return "The pool doesn't hold enough unreserved funds for a funded run. Replay a recorded case instead.";
  }
  return null;
}
