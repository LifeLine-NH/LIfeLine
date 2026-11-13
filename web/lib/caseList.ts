import type { CaseRowData } from "@/components/case/CaseRows";
import { chain } from "./chain";
import { getEvidence } from "./evidence";
import type { EvidenceBundle } from "./types";

// Cases plus their incident type, which lives in the off chain evidence bundle.
export async function listCaseRows(limit = 100): Promise<CaseRowData[]> {
  const cases = await chain.listCases({ limit });
  const bundles = await Promise.all(cases.map((c) => getEvidence(c.bundle_hash).catch(() => null) as Promise<EvidenceBundle | null>));
  return cases.map((c, i) => ({ c, incident: bundles[i]?.incident_type ?? null }));
}
