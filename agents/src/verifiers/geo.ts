import {
  VoteRecordSchema,
  type EvidenceBundle,
  type Verdict,
  type VoteRecord
} from "../schemas/index.js";
import type { Verifier } from "./types.js";

/**
 * Normalizes report text to detect copy-paste / botnet template floods
 * (strips trailing counters like `[msg 01]`, `#1`, punctuation, and collapses whitespace).
 */
function normalizeTemplateSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[msg\s*\d+\]/g, "")
    .replace(/#\d+/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * V1 `geo` Verifier Agent — Pure Deterministic Code, Zero LLM, Zero Network (Section B.4.3).
 *
 * Rules:
 * - Votes `No` if:
 *   - `source_diversity === 1` or any single source accounts for `>= 80%` of reports (Sybil / flood-of-fakes)
 *   - Botnet template repetition: `>= 75%` of reports (when total >= 4) share an identical normalized template
 * - Votes `Yes` if:
 *   - `source_diversity >= 3`
 *   - Time spread is plausible (`>= 60s` across reports and `<= 3600s` cluster window)
 *   - Cluster radius is plausible (`<= 1000m`)
 *   - No single source accounts for `> 40%` of reports
 * - Votes `Abstain` otherwise.
 */
export class GeoVerifier implements Verifier {
  public readonly role = "geo" as const;

  public async run(bundle: EvidenceBundle): Promise<VoteRecord> {
    const totalReports = bundle.reports.length;
    const sourceCounts = new Map<string, number>();
    const templateCounts = new Map<string, number>();

    for (const r of bundle.reports) {
      sourceCounts.set(r.source_id_hash, (sourceCounts.get(r.source_id_hash) ?? 0) + 1);
      const sig = normalizeTemplateSignature(r.text);
      templateCounts.set(sig, (templateCounts.get(sig) ?? 0) + 1);
    }

    const maxSourceCount =
      sourceCounts.size > 0 ? Math.max(...Array.from(sourceCounts.values())) : 0;
    const maxSourceShare = totalReports > 0 ? maxSourceCount / totalReports : 1;

    const maxTemplateCount =
      templateCounts.size > 0 ? Math.max(...Array.from(templateCounts.values())) : 0;
    const maxTemplateShare = totalReports > 0 ? maxTemplateCount / totalReports : 0;

    const distinctSources = sourceCounts.size;
    const windowSpreadSecs =
      (new Date(bundle.window.to).getTime() - new Date(bundle.window.from).getTime()) / 1000;
    const plausibleTimeSpread = windowSpreadSecs >= 60 && windowSpreadSecs <= 3600;
    const plausibleRadius = bundle.radius_m >= 0 && bundle.radius_m <= 1000;

    let verdict: Verdict = "Abstain";
    let confidenceBps = 5500;
    let reasoning = "";

    if (maxSourceShare >= 0.8 || distinctSources <= 1) {
      verdict = "No";
      confidenceBps = 9700;
      reasoning = `Sybil / single-source concentration detected: top source accounts for ${(
        maxSourceShare * 100
      ).toFixed(1)}% of all ${totalReports} reports (source_diversity=${distinctSources}, threshold >=80% rejects).`;
    } else if (totalReports >= 4 && maxTemplateShare >= 0.75) {
      verdict = "No";
      confidenceBps = 9300;
      reasoning = `Botnet duplicate-phrasing pattern detected: ${(
        maxTemplateShare * 100
      ).toFixed(1)}% of reports share identical normalized template signature.`;
    } else if (
      distinctSources >= 3 &&
      maxSourceShare <= 0.4 &&
      plausibleTimeSpread &&
      plausibleRadius
    ) {
      verdict = "Yes";
      confidenceBps = 9100;
      reasoning = `Spatio-temporal cluster verified: source_diversity=${distinctSources}, max single-source share=${(
        maxSourceShare * 100
      ).toFixed(1)}% (<=40%), radius=${bundle.radius_m}m, window spread=${Math.round(
        windowSpreadSecs
      )}s.`;
    } else {
      verdict = "Abstain";
      confidenceBps = 5000;
      reasoning = `Inconclusive cluster geometry: source_diversity=${distinctSources}, max single-source share=${(
        maxSourceShare * 100
      ).toFixed(1)}%, window spread=${Math.round(windowSpreadSecs)}s, radius=${bundle.radius_m}m.`;
    }

    return VoteRecordSchema.parse({
      case_id: bundle.case_id,
      agent: "geo",
      model: "deterministic-cluster-v1",
      verdict,
      confidence_bps: confidenceBps,
      tier: 0,
      reasoning,
      tool_calls: [],
      attestation: null
    });
  }
}
