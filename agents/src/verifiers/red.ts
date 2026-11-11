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
const RED_PROMPT_PATH = path.resolve(__dirname, "../prompts/red.md");

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|your|system)?\s*(instructions|rules|tools|prompts)/i,
  /system\s*instruction\s*:/i,
  /vote\s+yes\s+with\s+confidence/i,
  /override\s+verdict/i
];

/**
 * Checks if any untrusted report text contains an explicit adversarial prompt-injection attempt.
 */
export function detectPromptInjection(reports: Array<{ text: string }>): string | null {
  for (const r of reports) {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(r.text)) {
        return `Adversarial prompt-injection attempt detected in report text: "${r.text.slice(0, 120)}"`;
      }
    }
  }
  return null;
}

/**
 * V4 `red` Verifier Agent — Adversarial Red-Team Verifier on LLM #3 (Section B.4.3).
 *
 * Job: "Find the strongest reason this report is false, staged, or exaggerated."
 * - Must output `{ strongest_objection, can_be_rebutted, verdict }`
 * - Votes `Yes` ONLY if its objection is rebutted by independent external evidence in the bundle
 * - Automatically flags prompt-injection payloads or uncorroborated claims and votes `No`
 */
export class RedTeamVerifier implements Verifier {
  public readonly role = "red" as const;

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

    const injectionAlert = detectPromptInjection(bundle.reports);
    const supportingTools = evidenceEntries.filter((e) => e.supports === "yes").length;

    const systemPrompt = readFileSync(RED_PROMPT_PATH, "utf8");
    const userPrompt = JSON.stringify(
      {
        case_id: bundle.case_id,
        geohash: bundle.geohash,
        source_diversity: bundle.source_diversity,
        report_count: bundle.reports.length,
        prompt_injection_alert: injectionAlert,
        external_evidence: evidenceEntries,
        untrusted_reports: bundle.reports.slice(0, 8)
      },
      null,
      2
    );

    const llmRes = await callStructuredLlm({
      role: "red",
      systemPrompt,
      userPrompt,
      schema: LlmVoteOutputSchema,
      mode: bundle.mode,
      scenarioId: ctx?.scenarioId
    });

    if (!llmRes.ok || !llmRes.data) {
      return VoteRecordSchema.parse({
        case_id: bundle.case_id,
        agent: "red",
        model: llmRes.model,
        verdict: "Abstain",
        confidence_bps: 0,
        tier: 0,
        reasoning: llmRes.abstainFallback.reasoning,
        tool_calls: evidenceEntries,
        attestation: null
      });
    }

    let verdict: Verdict = llmRes.data.verdict;
    let canBeRebutted = llmRes.data.can_be_rebutted ?? verdict === "Yes";
    let strongestObjection =
      llmRes.data.strongest_objection ??
      "Reports could be coordinated or exaggerated to extract relief funds.";
    let reasoning = llmRes.data.reasoning;

    // Code-level red-team invariant:
    // 1. If prompt injection is present, or if can_be_rebutted is false, or if <2 external tools support,
    //    the objection cannot be rebutted by external evidence -> verdict MUST be No.
    if (injectionAlert) {
      verdict = "No";
      canBeRebutted = false;
      strongestObjection = injectionAlert;
      reasoning = `Red-team rejection: ${injectionAlert}. Unrebutted adversarial manipulation.`;
    } else if (!canBeRebutted || supportingTools < 2) {
      verdict = "No";
      canBeRebutted = false;
    }

    return VoteRecordSchema.parse({
      case_id: bundle.case_id,
      agent: "red",
      model: llmRes.model,
      verdict,
      confidence_bps: llmRes.data.confidence_bps,
      tier: 0,
      strongest_objection: strongestObjection,
      can_be_rebutted: canBeRebutted,
      reasoning,
      tool_calls: evidenceEntries,
      attestation: null
    });
  }
}
