import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VoteRecordSchema,
  type EvidenceBundle,
  type ExternalEvidenceEntry,
  type Verdict,
  type VoteRecord
} from "../schemas/index.js";
import { callStructuredLlm, LlmVoteOutputSchema } from "../llm/client.js";
import { runAllEvidenceTools, toExternalEvidenceEntries } from "../tools/index.js";
import type { Verifier, VerifierContext } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FACT_PROMPT_PATH = path.resolve(__dirname, "../prompts/fact.md");

/**
 * V2 `fact` Verifier Agent — External Evidence Tools + LLM #1 (Section B.4.3).
 *
 * Direct fix for Aegis's circular keyword fact-checker:
 * 1. Runs all independent external evidence tools (`open-meteo`, `gdacs`, `reliefweb`, `usgs`)
 *    if `bundle.external_evidence` is not already populated.
 * 2. Passes ONLY structured tool results + cluster metadata to LLM #1.
 * 3. Hard code-level guard: Even if an LLM were tricked into voting `Yes`, `FactVerifier`
 *    refuses to output `Yes` unless `>= 2` independent tools have `supports === "yes"`.
 *    If `>= 2` tools have `supports === "no"` and `0` tools support, it enforces `No`.
 */
export class FactVerifier implements Verifier {
  public readonly role = "fact" as const;

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

    const supportingCount = evidenceEntries.filter((e) => e.supports === "yes").length;
    const contradictingCount = evidenceEntries.filter((e) => e.supports === "no").length;

    const systemPrompt = readFileSync(FACT_PROMPT_PATH, "utf8");
    const userPrompt = JSON.stringify(
      {
        case_id: bundle.case_id,
        geohash: bundle.geohash,
        centroid: bundle.centroid,
        window: bundle.window,
        incident_type: bundle.incident_type ?? "flood",
        external_evidence: evidenceEntries
      },
      null,
      2
    );

    const llmRes = await callStructuredLlm({
      role: "fact",
      systemPrompt,
      userPrompt,
      schema: LlmVoteOutputSchema,
      mode: bundle.mode,
      scenarioId: ctx?.scenarioId
    });

    if (!llmRes.ok || !llmRes.data) {
      return VoteRecordSchema.parse({
        case_id: bundle.case_id,
        agent: "fact",
        model: llmRes.model,
        verdict: "Abstain",
        confidence_bps: 0,
        tier: 0,
        reasoning: llmRes.abstainFallback.reasoning,
        tool_calls: evidenceEntries,
        attestation: null
      });
    }

    let finalVerdict: Verdict = llmRes.data.verdict;
    let finalReasoning = llmRes.data.reasoning;
    let finalConfidence = llmRes.data.confidence_bps;

    // Hard code guard: never allow Yes unless >= 2 independent external tools support
    if (finalVerdict === "Yes" && supportingCount < 2) {
      finalVerdict = contradictingCount >= 2 ? "No" : "Abstain";
      finalConfidence = 8500;
      finalReasoning = `Code guard override: LLM proposed Yes, but only ${supportingCount} independent tool(s) supported the claim (minimum 2 required). Original reasoning: ${finalReasoning}`;
    }

    return VoteRecordSchema.parse({
      case_id: bundle.case_id,
      agent: "fact",
      model: llmRes.model,
      verdict: finalVerdict,
      confidence_bps: finalConfidence,
      tier: 0,
      reasoning: finalReasoning,
      tool_calls: evidenceEntries,
      attestation: null
    });
  }
}
