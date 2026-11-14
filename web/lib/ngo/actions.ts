// Transactions for responders and coordinators, built from the method table in the shared plan (section 5):
//   register_ngo(profile_hash)                         payable, the attached NEAR is the bond
//   place_bid(case_id, ask, eta_hours, plan_hash)      only while the case is Bidding, ask <= cap
//   submit_proof(case_id, proof_hash, proof_uri)       only the winner, only while Awarded
//   human_confirm(case_id) / human_reject(case_id)     only a coordinator, only from NeedsReview
// Argument names follow that table; re-check them against docs/CONTRACT.md when the contract lands.

import type { FunctionCallAction, PlannedTransaction } from "../donate/plan";
import { AmountError, nearToYocto, parseUnits, TGAS } from "../near/units";

export class FormError extends Error {}

const call = (receiverId: string, methodName: string, args: object, tgas: number, deposit = "0"): PlannedTransaction => ({
  receiverId,
  actions: [{ type: "FunctionCall", params: { methodName, args, gas: (BigInt(tgas) * TGAS).toString(), deposit } } satisfies FunctionCallAction],
});

export interface NgoProfile {
  name: string;
  website?: string;
  regions: string[];
  payout?: { asset: string; address: string };
}

export function buildProfile(input: { name: string; website: string; regions: string; payoutAsset: string; payoutAddress: string }): NgoProfile {
  const name = input.name.trim();
  if (name.length < 2) throw new FormError("Enter your organisation's name.");
  const website = input.website.trim();
  if (website && !/^https:\/\/[^\s]+\.[^\s]+$/.test(website)) throw new FormError("The website must start with https://");
  const regions = input.regions
    .split(/[\s,]+/)
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  if (regions.length === 0) throw new FormError("Add at least one area, as a geohash prefix like s4p.");
  const bad = regions.find((r) => !/^[0-9bcdefghjkmnpqrstuvwxyz]{1,8}$/.test(r));
  if (bad) throw new FormError(`"${bad}" isn't a geohash prefix. Use letters and digits from the geohash alphabet, up to 8 characters.`);
  const address = input.payoutAddress.trim();
  return { name, ...(website ? { website } : {}), regions, ...(address ? { payout: { asset: input.payoutAsset, address } } : {}) };
}

export function buildRegister(contractId: string, profileHash: string, bondNear: string): PlannedTransaction {
  let bond: bigint;
  try {
    bond = nearToYocto(bondNear);
  } catch {
    throw new FormError("The bond must be a NEAR amount like 1 or 0.5.");
  }
  if (bond <= BigInt(0)) throw new FormError("The bond must be more than zero.");
  return call(contractId, "register_ngo", { profile_hash: profileHash }, 100, bond.toString());
}

export interface BidInput {
  caseId: string;
  askText: string;
  etaText: string;
  plan: string;
  cap: string;
  decimals: number;
  symbol: string;
}

export function checkBid({ askText, etaText, plan, cap, decimals, symbol }: BidInput): { ask: bigint; eta: number } {
  let ask: bigint;
  try {
    ask = parseUnits(askText, decimals);
  } catch (err) {
    throw new FormError(err instanceof AmountError ? err.message : "Enter an amount.");
  }
  if (ask > BigInt(cap)) {
    const whole = BigInt(cap) / BigInt(10) ** BigInt(decimals);
    throw new FormError(`The most you can ask for this case is ${whole.toLocaleString("en-US")} ${symbol}.`);
  }
  const eta = Number(etaText.trim());
  if (!/^\d+$/.test(etaText.trim()) || eta < 1 || eta > 720) throw new FormError("Delivery time must be a whole number of hours, from 1 to 720.");
  if (plan.trim().length < 20) throw new FormError("Describe your plan in at least a sentence. Verifiers compare your proof with it.");
  return { ask, eta };
}

export function buildBid(contractId: string, caseId: string, ask: bigint, eta: number, planHash: string): PlannedTransaction {
  return call(contractId, "place_bid", { case_id: caseId, ask: ask.toString(), eta_hours: eta, plan_hash: planHash }, 50);
}

export interface ProofInput {
  caseId: string;
  ngo: string;
  summary: string;
  householdsText: string;
  plannedText: string;
  location: string;
}

export function buildProofRecord(input: ProofInput, now = new Date()) {
  const summary = input.summary.trim();
  if (summary.length < 20) throw new FormError("Describe what was delivered, where and to whom.");
  const reached = Number(input.householdsText.trim());
  if (!/^\d+$/.test(input.householdsText.trim()) || reached < 1) throw new FormError("Households reached must be a whole number.");
  const planned = Number(input.plannedText.trim());
  if (!/^\d+$/.test(input.plannedText.trim()) || planned < 1) throw new FormError("Planned households must be a whole number.");
  const location = input.location.trim().toLowerCase();
  if (!/^[0-9bcdefghjkmnpqrstuvwxyz]{4,9}$/.test(location)) throw new FormError("Give the delivery location as a geohash, 4 to 9 characters.");
  return {
    case_id: input.caseId,
    ngo_account: input.ngo,
    summary,
    households_reached: reached,
    planned_households: planned,
    location: { geohash: location },
    photo_hashes: [] as string[],
    delivered_at: now.toISOString(),
  };
}

// Same check the delivery verifiers apply, shown before submitting so an honest typo doesn't cost the payment.
export function proofWarning(reached: number, planned: number): string | null {
  if (planned <= 0) return null;
  const ratio = reached / planned;
  if (ratio > 3 || ratio < 0.25) {
    return `${reached.toLocaleString("en-US")} is far from your plan of ${planned.toLocaleString("en-US")}. Verifiers will likely reject this. Check the number before submitting.`;
  }
  return null;
}

export function buildProof(contractId: string, caseId: string, proofHash: string, proofUri: string): PlannedTransaction {
  return call(contractId, "submit_proof", { case_id: caseId, proof_hash: proofHash, proof_uri: proofUri }, 50);
}

export function buildCoordinatorDecision(contractId: string, caseId: string, decision: "confirm" | "reject"): PlannedTransaction {
  return call(contractId, decision === "confirm" ? "human_confirm" : "human_reject", { case_id: caseId }, 100);
}

// expire(case_id) is open to any account once the bidding window or proof deadline has passed.
// From Awarded it returns the held second payment to the pool's available balance.
export function buildExpire(contractId: string, caseId: string): PlannedTransaction {
  return call(contractId, "expire", { case_id: caseId }, 50);
}

export function expiryDue(c: { status: string; bidding_ends_at: number | string; proof_deadline: number | string }, nowMs: number): "proof" | "bidding" | null {
  const passed = (ns: number | string) => Number(ns) > 0 && nowMs > Number(ns) / 1e6;
  if (c.status === "Awarded" && passed(c.proof_deadline)) return "proof";
  if ((c.status === "Bidding" || c.status === "Verified") && passed(c.bidding_ends_at)) return "bidding";
  return null;
}
