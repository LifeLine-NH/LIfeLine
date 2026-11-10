import { z } from "zod";

/**
 * Contract Case Status enum (matches Section 5 of shared LIFELINE spec)
 */
export const CaseStatusSchema = z.enum([
  "Open",
  "Verified",
  "NeedsReview",
  "Rejected",
  "Bidding",
  "Awarded",
  "ProofSubmitted",
  "Delivered",
  "Expired"
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

/**
 * Verifier Role enum
 */
export const VerifierRoleSchema = z.enum(["geo", "fact", "sev", "red"]);
export type VerifierRole = z.infer<typeof VerifierRoleSchema>;

/**
 * Verifier Verdict enum
 */
export const VerdictSchema = z.enum(["Yes", "No", "Abstain"]);
export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Raw incoming field report (OFF-CHAIN ONLY; contains raw source_id which is hashed before bundling)
 */
export const RawReportSchema = z.object({
  source_type: z.enum(["sms_relay", "partner_relay", "web_form", "sensor"]),
  source_id: z.string().min(1),
  text: z.string().min(1).max(2000),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  ts: z.string().datetime()
});
export type RawReport = z.infer<typeof RawReportSchema>;

/**
 * Sanitized report stored inside EvidenceBundle (no raw phone numbers or raw source_ids)
 */
export const SanitizedReportSchema = z.object({
  source_type: z.enum(["sms_relay", "partner_relay", "web_form", "sensor"]),
  source_id_hash: z.string().regex(/^[a-f0-9]{64}$/),
  text: z.string().min(1).max(2000),
  ts: z.string().datetime()
});
export type SanitizedReport = z.infer<typeof SanitizedReportSchema>;

/**
 * External Evidence Tool Result (Section B.2)
 */
export const ToolSupportSchema = z.enum(["yes", "no", "unclear"]);
export type ToolSupport = z.infer<typeof ToolSupportSchema>;

export const ToolResultSchema = z.object({
  tool: z.string().min(1),
  claim: z.string().min(1),
  supports: ToolSupportSchema,
  url: z.string().url(),
  retrieved_at: z.string().datetime(),
  raw_hash: z.string().regex(/^[a-f0-9]{64}$/),
  raw: z.unknown().optional()
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * External Evidence summary stored inside EvidenceBundle (Section 6)
 */
export const ExternalEvidenceEntrySchema = z.object({
  tool: z.string().min(1),
  claim: z.string().min(1),
  supports: ToolSupportSchema.optional(),
  url: z.string().url(),
  retrieved_at: z.string().datetime(),
  raw_hash: z.string().regex(/^[a-f0-9]{64}$/)
});
export type ExternalEvidenceEntry = z.infer<typeof ExternalEvidenceEntrySchema>;

/**
 * Execution Mode ("replay" | "live")
 */
export const ExecutionModeSchema = z.enum(["replay", "live"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

/**
 * EvidenceBundle — stored off-chain at /api/evidence/<sha256>, hash goes on-chain (Section 6)
 */
export const EvidenceBundleSchema = z.object({
  case_id: z.string().min(1),
  geohash: z.string().min(4).max(12),
  centroid: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180)
  }),
  radius_m: z.number().nonnegative(),
  window: z.object({
    from: z.string().datetime(),
    to: z.string().datetime()
  }),
  incident_type: z.enum(["flood", "earthquake", "fire", "cyclone", "other"]).optional(),
  requested_tier: z.number().int().min(1).max(4).default(2),
  reports: z.array(SanitizedReportSchema).min(1),
  source_diversity: z.number().int().positive(),
  external_evidence: z.array(ExternalEvidenceEntrySchema),
  mode: ExecutionModeSchema
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

/**
 * VoteRecord — stored beside the bundle, hash goes on-chain as evidence_hash (Section 6)
 */
export const VoteRecordSchema = z.object({
  case_id: z.string().min(1).optional(),
  agent: VerifierRoleSchema,
  model: z.string().min(1),
  verdict: VerdictSchema,
  confidence_bps: z.number().int().min(0).max(10000),
  tier: z.number().int().min(1).max(4).default(0),
  reasoning: z.string().min(1),
  strongest_objection: z.string().optional(),
  can_be_rebutted: z.boolean().optional(),
  tool_calls: z.array(ExternalEvidenceEntrySchema),
  attestation: z.string().nullable().default(null)
});
export type VoteRecord = z.infer<typeof VoteRecordSchema>;

/**
 * Delivery Proof Package submitted by winning NGO (Section B.4.5 & B.4.6)
 */
export const DeliveryProofPackageSchema = z.object({
  case_id: z.string().min(1),
  ngo_account: z.string().min(1),
  summary: z.string().min(1),
  households_reached: z.number().int().nonnegative(),
  planned_households: z.number().int().positive(),
  amount_spent: z.string(),
  award_amount: z.string(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180)
  }),
  photo_hashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1),
  delivered_at: z.string().datetime(),
  simulated: z.literal(true)
});
export type DeliveryProofPackage = z.infer<typeof DeliveryProofPackageSchema>;

/**
 * Delivery Vote Record (Section B.4.6)
 */
export const DeliveryVoteRecordSchema = z.object({
  case_id: z.string().min(1),
  agent: VerifierRoleSchema,
  model: z.string().min(1),
  ok: z.boolean(),
  reasoning: z.string().min(1)
});
export type DeliveryVoteRecord = z.infer<typeof DeliveryVoteRecordSchema>;

/**
 * Scenario Definition (Section B.3)
 */
export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  incident_type: z.enum(["flood", "earthquake", "fire", "cyclone", "other"]),
  requested_tier: z.number().int().min(1).max(4),
  expected_verification_status: CaseStatusSchema,
  expected_final_status: CaseStatusSchema,
  tamper_proof_mode: z.enum(["valid", "inflated_fraud"]).default("valid"),
  reports: z.array(RawReportSchema).min(1)
});
export type Scenario = z.infer<typeof ScenarioSchema>;

/**
 * SwarmTrace — returned by orchestrator for Developer C's UI (/ops & /cases/[id])
 */
export const SwarmVoteStepSchema = z.object({
  role: VerifierRoleSchema,
  signer_account: z.string(),
  vote_record: VoteRecordSchema,
  evidence_hash: z.string().regex(/^[a-f0-9]{64}$/),
  tx_hash: z.string(),
  duration_ms: z.number().nonnegative()
});
export type SwarmVoteStep = z.infer<typeof SwarmVoteStepSchema>;

export const SwarmTraceSchema = z.object({
  scenario_id: z.string().optional(),
  case_id: z.string(),
  mode: ExecutionModeSchema,
  chain_mode: z.enum(["stub", "testnet", "mainnet"]),
  bundle_hash: z.string().regex(/^[a-f0-9]{64}$/),
  bundle: EvidenceBundleSchema,
  submit_tx_hash: z.string(),
  verifier_steps: z.array(SwarmVoteStepSchema),
  post_vote_status: CaseStatusSchema,
  cap_amount: z.string().optional(),
  bidding_trace: z
    .object({
      bids: z.array(
        z.object({
          ngo: z.string(),
          ask: z.string(),
          eta_hours: z.number(),
          plan_hash: z.string(),
          tx_hash: z.string(),
          simulated: z.literal(true)
        })
      ),
      winner: z.string().optional(),
      award_amount: z.string().optional(),
      tranche1_paid: z.string().optional(),
      close_bidding_tx_hash: z.string().optional()
    })
    .optional(),
  delivery_trace: z
    .object({
      proof_hash: z.string(),
      proof_uri: z.string(),
      proof_tx_hash: z.string(),
      votes: z.array(
        z.object({
          role: VerifierRoleSchema,
          signer_account: z.string(),
          ok: z.boolean(),
          reasoning: z.string(),
          evidence_hash: z.string(),
          tx_hash: z.string()
        })
      ),
      tranche2_paid: z.string().optional()
    })
    .optional(),
  final_status: CaseStatusSchema,
  started_at: z.string().datetime(),
  completed_at: z.string().datetime()
});
export type SwarmTrace = z.infer<typeof SwarmTraceSchema>;
