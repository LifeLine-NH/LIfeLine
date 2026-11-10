import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { LifelineChainClient } from "./chain/client.js";
import { ingestReportsToBundles, readEvidenceArtifact } from "./intake/bundle.js";
import { runNgoBiddingRound, submitNgoDeliveryProof } from "./ngo/bidders.js";
import { runCase } from "./orchestrator/index.js";
import {
  ExecutionModeSchema,
  RawReportSchema,
  ScenarioSchema,
  SwarmTraceSchema,
  type ExecutionMode,
  type Scenario,
  type SwarmTrace
} from "./schemas/index.js";
import { runDeliveryVerificationSwarm } from "./verifiers/delivery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.resolve(__dirname, "../scenarios");

export const SwarmRunRequestSchema = z.object({
  scenarioId: z.string().optional(),
  mode: ExecutionModeSchema.default("replay"),
  chainMode: z.enum(["stub", "testnet", "mainnet"]).optional(),
  includeFullLifecycle: z.boolean().default(true),
  customReports: z.array(RawReportSchema).optional(),
  incidentType: z.enum(["flood", "earthquake", "fire", "cyclone", "other"]).optional(),
  requestedTier: z.number().int().min(1).max(4).optional()
});
export type SwarmRunRequest = z.infer<typeof SwarmRunRequestSchema>;

export function loadScenarioById(scenarioId: string): Scenario {
  const cleanId = scenarioId.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const filePath = path.join(SCENARIOS_DIR, `${cleanId}.json`);
  return ScenarioSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

/**
 * Runs a complete scenario (or custom report batch) from intake clustering -> 4-verifier voting ->
 * (if verified & includeFullLifecycle=true) NGO bidding -> Tranche 1 award -> Proof of Delivery ->
 * Swarm Delivery Verification -> Tranche 2 release.
 */
export async function executeSwarmScenario(
  req: Partial<SwarmRunRequest> = {},
  sharedChain?: LifelineChainClient
): Promise<SwarmTrace> {
  const parsedReq = SwarmRunRequestSchema.parse(req);
  const mode: ExecutionMode = parsedReq.mode;
  const chain =
    sharedChain ??
    new LifelineChainClient(parsedReq.chainMode ? { mode: parsedReq.chainMode } : undefined);

  let scenario: Scenario | undefined;
  if (parsedReq.scenarioId) {
    scenario = loadScenarioById(parsedReq.scenarioId);
  }

  const reports = parsedReq.customReports ?? scenario?.reports ?? [];
  if (reports.length === 0) {
    throw new Error("No reports provided: specify scenarioId (S1/S2/S3/S5) or customReports");
  }

  const incidentType = parsedReq.incidentType ?? scenario?.incident_type ?? "flood";
  const requestedTier = parsedReq.requestedTier ?? scenario?.requested_tier ?? 3;
  const scenarioTag = (parsedReq.scenarioId ?? "custom").toLowerCase();

  const [built] = ingestReportsToBundles(reports, {
    incidentType,
    requestedTier,
    mode
  });

  // Make case_id unique per scenario run so S1 and S5 can run on the same contract instance without collision
  const caseIdWithScenario =
    parsedReq.scenarioId && !built.bundle.case_id.endsWith(`-${scenarioTag}`)
      ? `${built.bundle.case_id}-${scenarioTag}`
      : built.bundle.case_id;

  const bundle = {
    ...built.bundle,
    case_id: caseIdWithScenario
  };

  let trace = await runCase(bundle, {
    scenarioId: parsedReq.scenarioId,
    chain,
    persistArtifacts: true
  });

  // If the case reached Bidding and full lifecycle is requested, run simulated NGO bidders + delivery check
  if (
    parsedReq.includeFullLifecycle &&
    (trace.post_vote_status === "Bidding" || trace.post_vote_status === "Verified")
  ) {
    const biddingRes = await runNgoBiddingRound(chain, trace.bundle, true);
    let deliveryTrace: SwarmTrace["delivery_trace"];

    if (biddingRes.winnerRole) {
      const tamperMode = scenario?.tamper_proof_mode ?? "valid";
      const proofRes = await submitNgoDeliveryProof(
        chain,
        trace.bundle,
        biddingRes.winnerRole,
        tamperMode,
        true
      );
      const deliveryVerification = await runDeliveryVerificationSwarm(
        chain,
        trace.bundle,
        proofRes.proofPackage,
        {
          scenarioId: parsedReq.scenarioId,
          persistArtifacts: true
        }
      );

      deliveryTrace = {
        proof_hash: proofRes.proofHash,
        proof_uri: proofRes.proofUri,
        proof_tx_hash: proofRes.txHash,
        votes: deliveryVerification.votes,
        tranche2_paid: deliveryVerification.tranche2_paid
      };
    }

    const finalOnChainCase = await chain.getCase(trace.case_id);
    trace = SwarmTraceSchema.parse({
      ...trace,
      bidding_trace: {
        bids: biddingRes.bids,
        winner: biddingRes.winner,
        award_amount: biddingRes.award_amount,
        tranche1_paid: biddingRes.tranche1_paid,
        close_bidding_tx_hash: biddingRes.close_bidding_tx_hash
      },
      delivery_trace: deliveryTrace,
      final_status: finalOnChainCase?.status ?? trace.post_vote_status,
      completed_at: new Date().toISOString()
    });
  }

  return trace;
}

/**
 * Next.js App Router compatible POST handler for Developer C's `/api/swarm/run` route.
 */
export async function handleSwarmRunHttp(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<SwarmRunRequest>;
    const trace = await executeSwarmScenario(body);
    return new Response(JSON.stringify(trace, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Helper for Developer C's `/api/evidence/[hash]` route to retrieve stored EvidenceBundles & VoteRecords.
 */
export function getEvidenceByHash(hash: string): unknown | null {
  return readEvidenceArtifact(hash);
}
