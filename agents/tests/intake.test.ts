import { describe, expect, it } from "vitest";
import { clusterReports, haversineMeters } from "../src/intake/cluster.js";
import { buildEvidenceBundle, ingestReportsToBundles } from "../src/intake/bundle.js";
import type { RawReport } from "../src/schemas/index.js";

describe("Haversine Clustering & EvidenceBundle Builder (B.4.1)", () => {
  const sampleReports: RawReport[] = [
    {
      source_type: "sms_relay",
      source_id: "+2348011111111",
      text: "Alau dam water has entered Gwange ward in Maiduguri, homes submerged.",
      lat: 11.8311,
      lon: 13.1510,
      ts: "2024-09-10T05:10:00Z"
    },
    {
      source_type: "partner_relay",
      source_id: "redcross-borno-01",
      text: "Bridge near Lagos Street Maiduguri overtopped by fast-moving floodwater.",
      lat: 11.8335,
      lon: 13.1525,
      ts: "2024-09-10T05:25:00Z"
    },
    {
      source_type: "web_form",
      source_id: "citizen-reporter-99",
      text: "Families stranded on rooftops in Maiduguri central, call +234 803 555 0199.",
      lat: 11.8290,
      lon: 13.1490,
      ts: "2024-09-10T05:45:00Z"
    },
    // Distant report (> 5km away) that should form a second cluster
    {
      source_type: "sms_relay",
      source_id: "+2348022222222",
      text: "Separate report far north of town",
      lat: 11.9100,
      lon: 13.2200,
      ts: "2024-09-10T05:30:00Z"
    }
  ];

  it("computes haversine distance accurately within 1km", () => {
    const d = haversineMeters(11.8311, 13.1510, 11.8335, 13.1525);
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(400);
  });

  it("clusters reports within <=1km and <=1h into one cluster and separates distant reports", () => {
    const clusters = clusterReports(sampleReports);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].reports).toHaveLength(3);
    expect(clusters[1].reports).toHaveLength(1);
    expect(clusters[0].radius_m).toBeGreaterThan(0);
    expect(clusters[0].radius_m).toBeLessThanOrEqual(1000);
  });

  it("builds a deterministic EvidenceBundle with hashed source_ids, PII scrubbing, and stable bundleHash", () => {
    const clusters = clusterReports(sampleReports.slice(0, 3));
    const res1 = buildEvidenceBundle(clusters[0], {
      sequence: 1,
      incidentType: "flood",
      requestedTier: 3,
      mode: "replay"
    });
    const res2 = buildEvidenceBundle(clusters[0], {
      sequence: 1,
      incidentType: "flood",
      requestedTier: 3,
      mode: "replay"
    });

    expect(res1.bundleHash).toBe(res2.bundleHash);
    expect(res1.bundle.case_id).toBe(`${res1.bundle.geohash}-2024-09-10-001`);
    expect(res1.bundle.source_diversity).toBe(3);
    // Ensure raw source IDs and phone numbers are never in the bundle
    const serialized = JSON.stringify(res1.bundle);
    expect(serialized).not.toContain("+2348011111111");
    expect(serialized).not.toContain("803 555 0199");
    expect(serialized).toContain("[REDACTED_PHONE]");
  });

  it("caps per-source diversity weight at 1 when a single source floods 10 reports", () => {
    const sybilReports: RawReport[] = Array.from({ length: 10 }, (_, idx) => ({
      source_type: "sms_relay",
      source_id: "bot-sender-01",
      text: `Flood emergency report #${idx + 1}`,
      lat: 11.831,
      lon: 13.151,
      ts: new Date(Date.parse("2024-09-10T05:00:00Z") + idx * 60_000).toISOString()
    }));

    const [built] = ingestReportsToBundles(sybilReports);
    expect(built.bundle.reports).toHaveLength(10);
    expect(built.bundle.source_diversity).toBe(1);
  });
});
