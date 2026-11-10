import { LifelineChainClient } from "../chain/client.js";
import { persistEvidenceArtifact } from "../intake/bundle.js";
import {
  SwarmTraceSchema,
  VoteRecordSchema,
  type EvidenceBundle,
  type SwarmTrace,
  type SwarmVoteStep,
  type VoteRecord
} from "../schemas/index.js";
import { runAllEvidenceTools, toExternalEvidenceEntries } from "../tools/index.js";
import { hashCanonical } from "../utils/hash.js";
import { FactVerifier } from "../verifiers/fact.js";
import { GeoVerifier } from "../verifiers/geo.js";
import { RedTeamVerifier } from "../verifiers/red.js";
import { SevVerifier } from "../verifiers/sev.js";
import type { Verifier } from "../verifiers/types.js";

export interface RunCaseOptions {
  scenarioId?: string;
  chain?: LifelineChainClient;
  verifiers?: Verifier[];
  persistArtifacts?: boolean;
}

/**
 * Swarm Orchestrator (`runCase`) — Section B.4.4.
 *
 * 1. Populates external evidence in the `EvidenceBundle` (if empty) and computes canonical `bundle_hash`.
 * 2. Submits `contract.submit_case(case_id, geohash, bundle_hash, requested_tier)` using the `intake` account key.
 * 3. Runs all 4 independent verifiers (`geo`, `fact`, `sev`, `red`) in parallel via `Promise.allSettled`.
 *    - Partial failure resilience: if one verifier throws or times out, it defaults to `Abstain` and
 *      never blocks the other verifiers.
 * 4. Hashes each `VoteRecord` (`evidence_hash`), stores it for `/api/evidence/<hash>`, and submits
 *    `contract.vote(...)` signed by that verifier's own NEAR account key.
 * 5. Reads the resulting case status directly from the contract (`get_case`) — NEVER computes quorum locally.
 */
export async function runCase(
  initialBundle: EvidenceBundle,
  options: RunCaseOptions = {}
): Promise<SwarmTrace> {
  const startedAt = new Date().toISOString();
  const chain = options.chain ?? new LifelineChainClient();
  const shouldPersist = options.persistArtifacts ?? true;

  // Ensure external_evidence is populated before computing canonical bundle_hash
  let bundle: EvidenceBundle = initialBundle;
  if (bundle.external_evidence.length === 0) {
    const toolResults = await runAllEvidenceTools({
      lat: bundle.centroid.lat,
      lon: bundle.centroid.lon,
      from: bundle.window.from,
      to: bundle.window.to,
      incident_type: bundle.incident_type ?? "flood",
      mode: bundle.mode,
      scenarioId: options.scenarioId
    });
    bundle = {
      ...bundle,
      external_evidence: toExternalEvidenceEntries(toolResults)
    };
  }

  const bundleHash = hashCanonical(bundle);
  if (shouldPersist) {
    persistEvidenceArtifact(bundleHash, bundle);
  }

  // 1. Submit case on-chain via intake oracle account
  const submitOutcome = await chain.submitCase({
    case_id: bundle.case_id,
    geohash: bundle.geohash,
    bundle_hash: bundleHash,
    requested_tier: bundle.requested_tier
  });

  // 2. Run the 4 verifiers in parallel (Promise.allSettled so one timeout/error never blocks others)
  const verifiers: Verifier[] = options.verifiers ?? [
    new GeoVerifier(),
    new FactVerifier(),
    new SevVerifier(),
    new RedTeamVerifier()
  ];

  const parallelStart = Date.now();
  const verifierOutcomes = await Promise.allSettled(
    verifiers.map(async (v) => {
      const t0 = Date.now();
      const record = await v.run(bundle, { scenarioId: options.scenarioId });
      const durationMs = Date.now() - t0;
      return { role: v.role, record, durationMs };
    })
  );

  // 3. Submit each verifier's vote on-chain from its own NEAR account
  const verifierSteps: SwarmVoteStep[] = [];

  for (let i = 0; i < verifiers.length; i++) {
    const verifier = verifiers[i];
    const settled = verifierOutcomes[i];

    let voteRecord: VoteRecord;
    let durationMs = Date.now() - parallelStart;

    if (settled.status === "fulfilled") {
      voteRecord = settled.value.record;
      durationMs = settled.value.durationMs;
    } else {
      const errMsg =
        settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      voteRecord = VoteRecordSchema.parse({
        case_id: bundle.case_id,
        agent: verifier.role,
        model: "error-fallback",
        verdict: "Abstain",
        confidence_bps: 0,
        tier: 0,
        reasoning: `Verifier error/timeout fallback: ${errMsg}`,
        tool_calls: bundle.external_evidence,
        attestation: null
      });
    }

    const evidenceHash = hashCanonical(voteRecord);
    if (shouldPersist) {
      persistEvidenceArtifact(evidenceHash, voteRecord);
    }

    const voteTx = await chain.vote(verifier.role, {
      case_id: bundle.case_id,
      verdict: voteRecord.verdict,
      confidence_bps: voteRecord.confidence_bps,
      tier: voteRecord.tier,
      evidence_hash: evidenceHash,
      attestation_hash: voteRecord.attestation
    });

    verifierSteps.push({
      role: verifier.role,
      signer_account: voteTx.signer_id,
      vote_record: voteRecord,
      evidence_hash: evidenceHash,
      tx_hash: voteTx.tx_hash,
      duration_ms: durationMs
    });
  }

  // 4. Read the quorum outcome and cap directly from the contract state
  const onChainCase = await chain.getCase(bundle.case_id);
  if (!onChainCase) {
    throw new Error(`Contract state missing for case ${bundle.case_id} after voting`);
  }

  const completedAt = new Date().toISOString();

  return SwarmTraceSchema.parse({
    scenario_id: options.scenarioId,
    case_id: bundle.case_id,
    mode: bundle.mode,
    chain_mode: chain.mode,
    bundle_hash: bundleHash,
    bundle,
    submit_tx_hash: submitOutcome.tx_hash,
    verifier_steps: verifierSteps,
    post_vote_status: onChainCase.status,
    cap_amount: onChainCase.cap,
    final_status: onChainCase.status,
    started_at: startedAt,
    completed_at: completedAt
  });
}
