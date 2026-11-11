import type { LifelineChainClient } from "../chain/client.js";
import { persistEvidenceArtifact } from "../intake/bundle.js";
import {
  DeliveryProofPackageSchema,
  type DeliveryProofPackage,
  type EvidenceBundle
} from "../schemas/index.js";
import { hashCanonical, sha256Hex } from "../utils/hash.js";

export interface SimulatedNgoProfile {
  role: "ngo-1" | "ngo-2" | "ngo-3";
  name: string;
  strategy: "expensive_fast" | "balanced" | "cheap_frugal";
  askBpsOfCap: number; // e.g., 9200 = 92% of cap
  etaHours: number;
  plannedHouseholds: number;
  simulated: true;
}

export const SIMULATED_NGO_PROFILES: SimulatedNgoProfile[] = [
  {
    role: "ngo-1",
    name: "RapidAir Relief Borno [SIMULATED]",
    strategy: "expensive_fast",
    askBpsOfCap: 9200,
    etaHours: 6,
    plannedHouseholds: 500,
    simulated: true
  },
  {
    role: "ngo-2",
    name: "Sahel WASH & Shelter Coalition [SIMULATED]",
    strategy: "balanced",
    askBpsOfCap: 8000,
    etaHours: 14,
    plannedHouseholds: 550,
    simulated: true
  },
  {
    role: "ngo-3",
    name: "NorthEast Community Responders [SIMULATED]",
    strategy: "cheap_frugal",
    askBpsOfCap: 6800,
    etaHours: 18,
    plannedHouseholds: 600,
    simulated: true
  }
];

export interface BiddingRoundResult {
  bids: Array<{
    ngo: string;
    ask: string;
    eta_hours: number;
    plan_hash: string;
    tx_hash: string;
    simulated: true;
  }>;
  winner?: string;
  winnerRole?: "ngo-1" | "ngo-2" | "ngo-3";
  award_amount?: string;
  tranche1_paid?: string;
  close_bidding_tx_hash: string;
}

/**
 * Runs the 3 simulated NGO bidder bots on a case in `Bidding` state (Section B.4.5).
 *
 * - Each NGO computes `ask <= cap` based on its profile (`92%`, `80%`, `68%` of cap).
 * - Generates a structured relief plan JSON, hashes it (`plan_hash`), stores it in the evidence store,
 *   and calls `contract.place_bid` using its own NEAR account key.
 * - Calls `contract.close_bidding` to select the winner and release Tranche 1 from escrow.
 */
export async function runNgoBiddingRound(
  chain: LifelineChainClient,
  bundle: EvidenceBundle,
  persistArtifacts = true
): Promise<BiddingRoundResult> {
  const onChainCase = await chain.getCase(bundle.case_id);
  if (!onChainCase || (onChainCase.status !== "Bidding" && onChainCase.status !== "Verified")) {
    throw new Error(
      `Cannot run NGO bidding: case ${bundle.case_id} is in state ${onChainCase?.status ?? "null"}`
    );
  }

  const cap = BigInt(onChainCase.cap);
  const bids: BiddingRoundResult["bids"] = [];

  for (const profile of SIMULATED_NGO_PROFILES) {
    const askAmount = ((cap * BigInt(profile.askBpsOfCap)) / BigInt(10000)).toString();
    const planDoc = {
      case_id: bundle.case_id,
      ngo_name: profile.name,
      ngo_account: chain.getAccountId(profile.role),
      simulated: true as const,
      strategy: profile.strategy,
      ask: askAmount,
      eta_hours: profile.etaHours,
      planned_households: profile.plannedHouseholds,
      deliverables: [
        "Emergency clean water purification tablets & jerrycans",
        "Tarpaulins and dry food rations for displaced households",
        "Geotagged distribution manifest & photo hashes"
      ]
    };

    const planHash = hashCanonical(planDoc);
    if (persistArtifacts) {
      persistEvidenceArtifact(planHash, planDoc);
    }

    const tx = await chain.placeBid(profile.role, {
      case_id: bundle.case_id,
      ask: askAmount,
      eta_hours: profile.etaHours,
      plan_hash: planHash
    });

    bids.push({
      ngo: tx.signer_id,
      ask: askAmount,
      eta_hours: profile.etaHours,
      plan_hash: planHash,
      tx_hash: tx.tx_hash,
      simulated: true
    });
  }

  const closeTx = await chain.closeBidding(bundle.case_id);
  const updatedCase = await chain.getCase(bundle.case_id);

  const winningProfile = SIMULATED_NGO_PROFILES.find(
    (p) => chain.getAccountId(p.role) === updatedCase?.winner
  );

  return {
    bids,
    winner: updatedCase?.winner ?? undefined,
    winnerRole: winningProfile?.role,
    award_amount: updatedCase?.award_amount,
    tranche1_paid: updatedCase?.tranche1_paid,
    close_bidding_tx_hash: closeTx.tx_hash
  };
}

/**
 * Generates and submits a Proof of Delivery package from the winning NGO bot (Section B.4.5).
 * Supports both:
 * - `"valid"` mode (`S1`): accurate coordinates near case centroid and realistic household delivery count
 * - `"inflated_fraud"` mode (`S5`): fraudulent claim of 50,000 households (83x plan) and coordinates 85km away
 */
export async function submitNgoDeliveryProof(
  chain: LifelineChainClient,
  bundle: EvidenceBundle,
  winnerRole: "ngo-1" | "ngo-2" | "ngo-3",
  tamperMode: "valid" | "inflated_fraud" = "valid",
  persistArtifacts = true
): Promise<{
  proofPackage: DeliveryProofPackage;
  proofHash: string;
  proofUri: string;
  txHash: string;
}> {
  const onChainCase = await chain.getCase(bundle.case_id);
  if (!onChainCase || onChainCase.status !== "Awarded") {
    throw new Error(`Case ${bundle.case_id} is not in Awarded state`);
  }

  const profile =
    SIMULATED_NGO_PROFILES.find((p) => p.role === winnerRole) ?? SIMULATED_NGO_PROFILES[2];
  const ngoAccount = chain.getAccountId(winnerRole);

  const isFraud = tamperMode === "inflated_fraud";

  const proofPackage = DeliveryProofPackageSchema.parse({
    case_id: bundle.case_id,
    ngo_account: ngoAccount,
    summary: isFraud
      ? "[SIMULATED FRAUDULENT PROOF] Claiming 50,000 households reached in distant LGA with unverifiable manifest."
      : `[SIMULATED VALID PROOF] ${profile.name} completed distribution of WASH kits, tarpaulins, and dry rations to 585 displaced households in Maiduguri.`,
    households_reached: isFraud ? 50_000 : 585,
    planned_households: profile.plannedHouseholds,
    amount_spent: onChainCase.award_amount,
    award_amount: onChainCase.award_amount,
    location: isFraud
      ? {
          lat: Number((bundle.centroid.lat + 0.78).toFixed(4)), // ~86km away from case centroid!
          lon: Number((bundle.centroid.lon + 0.65).toFixed(4))
        }
      : {
          lat: Number((bundle.centroid.lat + 0.0012).toFixed(4)), // ~150m from centroid
          lon: Number((bundle.centroid.lon - 0.0008).toFixed(4))
        },
    photo_hashes: [
      sha256Hex(`lifeline:proof-photo-1:${bundle.case_id}:${tamperMode}`),
      sha256Hex(`lifeline:proof-photo-2:${bundle.case_id}:${tamperMode}`)
    ],
    delivered_at: new Date(new Date(bundle.window.to).getTime() + 4 * 3600_000).toISOString(),
    simulated: true
  });

  const proofHash = hashCanonical(proofPackage);
  if (persistArtifacts) {
    persistEvidenceArtifact(proofHash, proofPackage);
  }
  const proofUri = `/api/evidence/${proofHash}`;

  const tx = await chain.submitProof(winnerRole, {
    case_id: bundle.case_id,
    proof_hash: proofHash,
    proof_uri: proofUri
  });

  return {
    proofPackage,
    proofHash,
    proofUri,
    txHash: tx.tx_hash
  };
}
