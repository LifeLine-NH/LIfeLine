import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import ngeohash from "ngeohash";
import {
  EvidenceBundleSchema,
  type EvidenceBundle,
  type ExecutionMode,
  type ExternalEvidenceEntry,
  type RawReport,
  type SanitizedReport
} from "../schemas/index.js";
import { canonicalJson, hashCanonical, hashSourceId, scrubPiiText } from "../utils/hash.js";
import { clusterReports, type ReportCluster } from "./cluster.js";

export interface BuildBundleOptions {
  sequence?: number;
  caseIdOverride?: string;
  incidentType?: "flood" | "earthquake" | "fire" | "cyclone" | "other";
  requestedTier?: number;
  externalEvidence?: ExternalEvidenceEntry[];
  mode?: ExecutionMode;
}

export interface BuiltBundleResult {
  bundle: EvidenceBundle;
  bundleHash: string;
  canonical: string;
}

/**
 * Builds a deterministic EvidenceBundle from a ReportCluster:
 * - Hashes every source_id (never leaks phone numbers or raw IDs)
 * - Scrubs PII from report text
 * - Computes source_diversity (distinct hashed source IDs; each source's effective cluster weight is capped at 1)
 * - Generates deterministic case_id (<geohash>-<YYYY-MM-DD>-<seq>)
 * - Computes canonical SHA-256 bundleHash
 */
export function buildEvidenceBundle(
  cluster: ReportCluster,
  options: BuildBundleOptions = {}
): BuiltBundleResult {
  const geohash = ngeohash.encode(cluster.centroid.lat, cluster.centroid.lon, 5);
  const datePart = cluster.window.from.slice(0, 10);
  const seqStr = String(options.sequence ?? 1).padStart(3, "0");
  const caseId = options.caseIdOverride ?? `${geohash}-${datePart}-${seqStr}`;

  const sanitizedReports: SanitizedReport[] = cluster.reports.map((r) => ({
    source_type: r.source_type,
    source_id_hash: hashSourceId(r.source_id),
    text: scrubPiiText(r.text),
    ts: r.ts
  }));

  const distinctSources = new Set(sanitizedReports.map((r) => r.source_id_hash));
  const sourceDiversity = distinctSources.size;

  const rawBundle: EvidenceBundle = {
    case_id: caseId,
    geohash,
    centroid: {
      lat: Number(cluster.centroid.lat.toFixed(4)),
      lon: Number(cluster.centroid.lon.toFixed(4))
    },
    radius_m: cluster.radius_m,
    window: cluster.window,
    ...(options.incidentType ? { incident_type: options.incidentType } : {}),
    requested_tier: options.requestedTier ?? 2,
    reports: sanitizedReports,
    source_diversity: sourceDiversity,
    external_evidence: options.externalEvidence ?? [],
    mode: options.mode ?? "replay"
  };

  const bundle = EvidenceBundleSchema.parse(rawBundle);
  const canonical = canonicalJson(bundle);
  const bundleHash = hashCanonical(bundle);

  return {
    bundle,
    bundleHash,
    canonical
  };
}

/**
 * Convenience helper: clusters raw reports and builds EvidenceBundles for each cluster.
 */
export function ingestReportsToBundles(
  reports: RawReport[],
  options: BuildBundleOptions = {}
): BuiltBundleResult[] {
  const clusters = clusterReports(reports);
  return clusters.map((cluster, idx) =>
    buildEvidenceBundle(cluster, {
      ...options,
      sequence: (options.sequence ?? 1) + idx
    })
  );
}

/**
 * Persists an EvidenceBundle or VoteRecord by its SHA-256 hash so C's `/api/evidence/<hash>` route can serve it.
 */
export function persistEvidenceArtifact(
  hash: string,
  payload: unknown,
  storageDir = path.resolve(process.cwd(), "storage/evidence")
): string {
  mkdirSync(storageDir, { recursive: true });
  const filePath = path.join(storageDir, `${hash}.json`);
  writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

/**
 * Reads an EvidenceBundle or VoteRecord by SHA-256 hash from the evidence store.
 */
export function readEvidenceArtifact<T = unknown>(
  hash: string,
  storageDir = path.resolve(process.cwd(), "storage/evidence")
): T | null {
  const filePath = path.join(storageDir, `${hash}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}
