// View shapes from the shared plan (section 5) and the agents' chain client.
// Contract argument details are owned by developer A; update here when docs/CONTRACT.md lands.

export type CaseStatus =
  | "Open"
  | "Verified"
  | "NeedsReview"
  | "Rejected"
  | "Bidding"
  | "Awarded"
  | "ProofSubmitted"
  | "Delivered"
  | "Expired";

export type Role = "geo" | "fact" | "sev" | "red";
export type Verdict = "Yes" | "No" | "Abstain";
export type IncidentType = "flood" | "earthquake" | "fire" | "cyclone" | "other";

// u128 amounts arrive as decimal strings; timestamps are block time in nanoseconds.
export type U128 = string;
export type Nanos = number | string;

export interface Case {
  id: string;
  geohash: string;
  bundle_hash: string;
  requested_tier: number;
  tier: number;
  status: CaseStatus;
  opened_at: Nanos;
  cap: U128;
  bidding_ends_at: Nanos;
  winner: string | null;
  award_amount: U128;
  tranche1_paid: U128;
  tranche2_paid: U128;
  proof_hash: string | null;
  proof_uri?: string | null;
  proof_deadline: Nanos;
}

export interface Vote {
  role: Role;
  verifier: string;
  verdict: Verdict;
  confidence_bps: number;
  tier: number;
  evidence_hash: string;
  attestation_hash: string | null;
  at: Nanos;
  tx_hash?: string;
}

export interface Bid {
  ngo: string;
  ask: U128;
  eta_hours: number;
  plan_hash: string;
  at: Nanos;
  tx_hash?: string;
  simulated?: boolean;
}

export interface DeliveryVote {
  role: Role;
  verifier: string;
  ok: boolean;
  evidence_hash: string;
  at: Nanos;
  tx_hash?: string;
}

export interface Pool {
  balance: U128;
  reserved: U128;
  available: U128;
  disbursed_today: U128;
  donors_count: number;
}

export interface Donation {
  donor: string;
  amount: U128;
  at: Nanos;
  tx_hash?: string;
}

export interface Ngo {
  bond: U128;
  reputation: number;
  delivered: number;
  failed: number;
  profile_hash: string;
}

export interface ContractConfig {
  bidding_window_secs: number;
  proof_deadline_secs: number;
  tranche1_bps: number;
  tier_cap: U128[];
  max_case_bps: number;
  daily_limit: U128;
}

export interface ExternalEvidence {
  tool: string;
  claim: string;
  supports?: "yes" | "no" | "unclear";
  url: string;
  retrieved_at: string;
  raw_hash: string;
}

export interface EvidenceBundle {
  case_id: string;
  geohash: string;
  centroid: { lat: number; lon: number };
  radius_m: number;
  window: { from: string; to: string };
  incident_type?: IncidentType;
  requested_tier: number;
  reports: { source_type: string; source_id_hash: string; text: string; ts: string }[];
  source_diversity: number;
  external_evidence: ExternalEvidence[];
  mode: "replay" | "live";
}

export interface VoteRecord {
  case_id?: string;
  agent: Role;
  model: string;
  verdict: Verdict;
  confidence_bps: number;
  tier: number;
  reasoning: string;
  strongest_objection?: string;
  can_be_rebutted?: boolean;
  tool_calls: ExternalEvidence[];
  attestation: string | null;
}
