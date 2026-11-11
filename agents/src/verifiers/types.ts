import type { EvidenceBundle, VerifierRole, VoteRecord } from "../schemas/index.js";

export interface VerifierContext {
  scenarioId?: string;
}

export interface Verifier {
  readonly role: VerifierRole;
  run(bundle: EvidenceBundle, ctx?: VerifierContext): Promise<VoteRecord>;
}
