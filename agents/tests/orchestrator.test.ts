import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LifelineChainClient } from "../src/chain/client.js";
import { ingestReportsToBundles } from "../src/intake/bundle.js";
import { runCase } from "../src/orchestrator/index.js";
import { ScenarioSchema, type EvidenceBundle, type VoteRecord } from "../src/schemas/index.js";
import { FactVerifier } from "../src/verifiers/fact.js";
import { GeoVerifier } from "../src/verifiers/geo.js";
import { SevVerifier } from "../src/verifiers/sev.js";
import type { Verifier } from "../src/verifiers/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadScenario(id: string) {
  const filePath = path.resolve(__dirname, `../scenarios/${id}.json`);
  return ScenarioSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

describe("Swarm Orchestrator — Parallel Verifiers, Separate Keys, Resilience (B.4.4 / B.5)", () => {
  it("runs S1 genuine case across all 4 verifiers with 4 distinct NEAR signer accounts and reaches Bidding", async () => {
    const s1 = loadScenario("S1");
    const [built] = ingestReportsToBundles(s1.reports, {
      incidentType: s1.incident_type,
      requestedTier: s1.requested_tier,
      mode: "replay"
    });
    const chain = new LifelineChainClient({ mode: "stub" });

    const trace = await runCase(built.bundle, {
      scenarioId: "S1",
      chain,
      persistArtifacts: false
    });

    expect(trace.verifier_steps).toHaveLength(4);
    const signers = new Set(trace.verifier_steps.map((s) => s.signer_account));
    expect(signers.size).toBe(4);
    expect(trace.post_vote_status).toBe("Bidding");
    expect(BigInt(trace.cap_amount ?? "0")).toBe(BigInt("5000000000"));
  });

  it("resilience test: one verifier timing out/throwing does not block the other 3 from reaching quorum", async () => {
    const s1 = loadScenario("S1");
    const [built] = ingestReportsToBundles(s1.reports, {
      incidentType: s1.incident_type,
      requestedTier: s1.requested_tier,
      mode: "replay"
    });
    const chain = new LifelineChainClient({ mode: "stub" });

    const crashingRedVerifier: Verifier = {
      role: "red",
      async run(_bundle: EvidenceBundle): Promise<VoteRecord> {
        throw new Error("Simulated network timeout on V4 red-team provider");
      }
    };

    const trace = await runCase(built.bundle, {
      scenarioId: "S1",
      chain,
      verifiers: [new GeoVerifier(), new FactVerifier(), new SevVerifier(), crashingRedVerifier],
      persistArtifacts: false
    });

    const redStep = trace.verifier_steps.find((s) => s.role === "red");
    expect(redStep?.vote_record.verdict).toBe("Abstain");
    expect(redStep?.vote_record.reasoning).toContain("Simulated network timeout");
    // Because geo, fact, and sev still voted Yes (3 of 4), the contract still reaches Bidding!
    expect(trace.post_vote_status).toBe("Bidding");
  });
});
