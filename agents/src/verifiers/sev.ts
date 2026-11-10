import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VoteRecordSchema,
  type EvidenceBundle,
  type ExternalEvidenceEntry,
  type VoteRecord
} from "../schemas/index.js";
import { callStructuredLlm, LlmVoteOutputSchema } from "../llm/client.js";
import { runAllEvidenceTools, toExternalEvidenceEntries } from "../tools/index.js";
import type { Verifier, VerifierContext } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEV_PROMPT_PATH = path.resolve(__dirname, "../prompts/sev.md");

/**
 * V3 `sev` Verifier Agent — LLM #2 (Section B.4.3).
 *
 * Proposes severity tier 1–4 with a short justification citing physical evidence.
 * Does NOT decide the dollar payout — the smart contract enforces the cap formula.
 */
export class SevVerifier implements Verifier {
  public readonly role = "sev" as const;

  public async run(bundle: EvidenceBundle, ctx?: VerifierContext): Promise<VoteRecord> {
    let evidenceEntries: ExternalEvidenceEntry[] = bundle.external_evidence;

    if (evidenceEntries.length === 0) {
      const toolResults = await runAllEvidenceTools({
        lat: bundle.centroid.lat,
        lon: bundle.centroid.lon,
        from: bundle.window.from,
        to: bundle.window.to,
        incident_type: bundle.incident_type ?? "flood",
        mode: bundle.mode,
        scenarioId: ctx?.scenarioId
      });
      evidenceEntries = toExternalEvidenceEntries(toolResults);
    }

    const systemPrompt = readFileSync(SEV_PROMPT_PATH, "utf8");
    const userPrompt = JSON.stringify(
      {
        case_id: bundle.case_id,
        geohash: bundle.geohash,
        radius_m: bundle.radius_m,
        source_diversity: bundle.source_diversity,
        report_count: bundle.reports.length,
        requested_tier: bundle.requested_tier,
        external_evidence: evidenceEntries,
        untrusted_report_excerpts: bundle.reports.slice(0, 5).map((r) => r.text)
      },
      null,
      2
    );

    const llmRes = await callStructuredLlm({
      role: "sev",
      systemPrompt,
      userPrompt,
      schema: LlmVoteOutputSchema,
      mode: bundle.mode,
      scenarioId: ctx?.scenarioId
    });

    if (!llmRes.ok || !llmRes.data) {
      return VoteRecordSchema.parse({
        case_id: bundle.case_id,
        agent: "sev",
        model: llmRes.model,
        verdict: "Abstain",
        confidence_bps: 0,
        tier: 0,
        reasoning: llmRes.abstainFallback.reasoning,
        tool_calls: evidenceEntries,
        attestation: null
      });
    }

    const proposedTier =
      llmRes.data.tier && llmRes.data.tier >= 1 && llmRes.data.tier <= 4
        ? llmRes.data.tier
        : llmRes.data.verdict === "Yes"
          ? bundle.requested_tier
          : 1;

    return VoteRecordSchema.parse({
      case_id: bundle.case_id,
      agent: "sev",
      model: llmRes.model,
      verdict: llmRes.data.verdict,
      confidence_bps: llmRes.data.confidence_bps,
      tier: proposedTier,
      reasoning: llmRes.data.reasoning,
      tool_calls: evidenceEntries,
      attestation: null
    });
  }
}
