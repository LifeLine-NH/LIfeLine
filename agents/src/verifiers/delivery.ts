import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { LifelineChainClient } from "../chain/client.js";
import { persistEvidenceArtifact } from "../intake/bundle.js";
import { haversineMeters } from "../intake/cluster.js";
import { callStructuredLlm } from "../llm/client.js";
import {
  DeliveryVoteRecordSchema,
  type DeliveryProofPackage,
  type DeliveryVoteRecord,
  type EvidenceBundle,
  type VerifierRole
} from "../schemas/index.js";
import { hashCanonical } from "../utils/hash.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DELIVERY_PROMPT_PATH = path.resolve(__dirname, "../prompts/delivery.md");

export const LlmDeliveryOutputSchema = z.object({
  ok: z.boolean(),
  reasoning: z.string().min(1)
});

export interface DeliveryVerificationResult {
  votes: Array<{
    role: VerifierRole;
    signer_account: string;
    ok: boolean;
    reasoning: string;
    evidence_hash: string;
    tx_hash: string;
  }>;
  tranche2_paid?: string;
  final_status: string;
}

/**
 * Evaluates a single verifier role's check on the submitted `DeliveryProofPackage`.
 *
 * Fail-safe (Section B.4.6):
 * "Same fail-safe: error → ok=false? No. Error → do not vote; a missing vote is better than a wrong one.
 * The contract needs 2 ok, so 2 working verifiers can still finish."
 */
export async function evaluateDeliveryForRole(
  role: VerifierRole,
  bundle: EvidenceBundle,
  proof: DeliveryProofPackage,
  scenarioId?: string
): Promise<DeliveryVoteRecord> {
  const distanceM = Math.round(
    haversineMeters(
      bundle.centroid.lat,
      bundle.centroid.lon,
      proof.location.lat,
      proof.location.lon
    )
  );
  const ratio = proof.households_reached / proof.planned_households;
  const deliveryTs = new Date(proof.delivered_at).getTime();
  const openedTs = new Date(bundle.window.from).getTime();

  const locationConsistent = distanceM <= 5000; // within 5km of case centroid
  const quantityPlausible = ratio >= 0.25 && ratio <= 3.0; // between 25% and 300% of awarded plan
  const timingPlausible = deliveryTs > openedTs;
  const hasPhotos = proof.photo_hashes.length >= 1;

  const deterministicOk =
    locationConsistent && quantityPlausible && timingPlausible && hasPhotos;

  // V1 geo is always pure deterministic code
  if (role === "geo") {
    const reasons: string[] = [];
    if (!locationConsistent) {
      reasons.push(`delivery GPS is ${distanceM}m from case centroid (>5000m max)`);
    }
    if (!quantityPlausible) {
      reasons.push(
        `claimed ${proof.households_reached} households is ${(ratio * 100).toFixed(
          0
        )}% of planned ${proof.planned_households} (outside 25%-300% plausibility band)`
      );
    }
    if (!timingPlausible) {
      reasons.push("delivery timestamp precedes case window");
    }

    return DeliveryVoteRecordSchema.parse({
      case_id: bundle.case_id,
      agent: "geo",
      model: "deterministic-delivery-v1",
      ok: deterministicOk,
      reasoning: deterministicOk
        ? `Delivery geometry & quantities verified: GPS ${distanceM}m from centroid (<=5km), ${proof.households_reached}/${proof.planned_households} households (${(
            ratio * 100
          ).toFixed(0)}%), ${proof.photo_hashes.length} photo hashes attached.`
        : `Delivery proof rejected by deterministic checks: ${reasons.join("; ")}.`
    });
  }

  // For LLM verifiers (fact, sev, red), call structured LLM (or replay recording) + apply hard fraud guard
  const systemPrompt = readFileSync(DELIVERY_PROMPT_PATH, "utf8");
  const userPrompt = JSON.stringify(
    {
      role,
      case_id: bundle.case_id,
      case_centroid: bundle.centroid,
      distance_from_centroid_m: distanceM,
      proof
    },
    null,
    2
  );

  const llmRes = await callStructuredLlm({
    role: "delivery",
    systemPrompt,
    userPrompt,
    schema: LlmDeliveryOutputSchema,
    mode: bundle.mode,
    scenarioId
  });

  if (!llmRes.ok || !llmRes.data) {
    // Throw so the caller skips casting a vote on error (per B.4.6: "Error -> do not vote")
    throw new Error(`Verifier ${role} delivery check failed: ${llmRes.abstainFallback.reasoning}`);
  }

  // Hard code guard: if physical coordinates are >5km off or quantities are >3x inflated, never approve
  const finalOk = llmRes.data.ok && deterministicOk;
  const finalReasoning =
    llmRes.data.ok && !deterministicOk
      ? `Code guard override: rejected due to physical/quantity mismatch (distance=${distanceM}m, ratio=${ratio.toFixed(
          1
        )}x).`
      : llmRes.data.reasoning;

  return DeliveryVoteRecordSchema.parse({
    case_id: bundle.case_id,
    agent: role,
    model: llmRes.model,
    ok: finalOk,
    reasoning: finalReasoning
  });
}

/**
 * Runs the Delivery Verification Swarm across `geo`, `fact`, `sev`, and `red` (Section B.4.6).
 * - Each verifier evaluates the proof and calls `contract.vote_delivery` from its own account.
 * - If a verifier errors out, it does NOT vote (`Promise.allSettled` skips failed verifiers).
 */
export async function runDeliveryVerificationSwarm(
  chain: LifelineChainClient,
  bundle: EvidenceBundle,
  proof: DeliveryProofPackage,
  options: {
    scenarioId?: string;
    roles?: VerifierRole[];
    persistArtifacts?: boolean;
    customEvaluator?: (role: VerifierRole) => Promise<DeliveryVoteRecord>;
  } = {}
): Promise<DeliveryVerificationResult> {
  const roles: VerifierRole[] = options.roles ?? ["geo", "fact", "sev", "red"];
  const shouldPersist = options.persistArtifacts ?? true;

  const settled = await Promise.allSettled(
    roles.map(async (role) => {
      if (options.customEvaluator) {
        return options.customEvaluator(role);
      }
      return evaluateDeliveryForRole(role, bundle, proof, options.scenarioId);
    })
  );

  const votes: DeliveryVerificationResult["votes"] = [];

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const item = settled[i];

    // Section B.4.6 rule: "Error -> do not vote; a missing vote is better than a wrong one."
    if (item.status !== "fulfilled") {
      continue;
    }

    const record = item.value;
    const evidenceHash = hashCanonical(record);
    if (shouldPersist) {
      persistEvidenceArtifact(evidenceHash, record);
    }

    const tx = await chain.voteDelivery(role, {
      case_id: bundle.case_id,
      ok: record.ok,
      evidence_hash: evidenceHash
    });

    votes.push({
      role,
      signer_account: tx.signer_id,
      ok: record.ok,
      reasoning: record.reasoning,
      evidence_hash: evidenceHash,
      tx_hash: tx.tx_hash
    });
  }

  const updatedCase = await chain.getCase(bundle.case_id);

  return {
    votes,
    tranche2_paid: updatedCase?.tranche2_paid,
    final_status: updatedCase?.status ?? "Unknown"
  };
}
