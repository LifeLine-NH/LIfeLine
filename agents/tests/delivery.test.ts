import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LifelineChainClient } from "../src/chain/client.js";
import { ingestReportsToBundles } from "../src/intake/bundle.js";
import { runNgoBiddingRound, submitNgoDeliveryProof } from "../src/ngo/bidders.js";
import { runCase } from "../src/orchestrator/index.js";
import { ScenarioSchema } from "../src/schemas/index.js";
import {
  evaluateDeliveryForRole,
  runDeliveryVerificationSwarm
} from "../src/verifiers/delivery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadScenario(id: string) {
  const filePath = path.resolve(__dirname, `../scenarios/${id}.json`);
  return ScenarioSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

describe("NGO Bidding & Delivery Verification Swarm (B.4.5 & B.4.6)", () => {
  it("completes full lifecycle S1 -> Bidding -> Awarded (Tranche 1) -> ProofSubmitted -> Delivered (Tranche 2)", async () => {
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
    expect(trace.post_vote_status).toBe("Bidding");

    const biddingRes = await runNgoBiddingRound(chain, trace.bundle, false);
    expect(biddingRes.bids).toHaveLength(3);
    // ngo-3 (68% of cap) wins lowest-ask auction
    expect(biddingRes.winnerRole).toBe("ngo-3");
    expect(BigInt(biddingRes.tranche1_paid ?? "0")).toBeGreaterThan(BigInt(0));

    const proofRes = await submitNgoDeliveryProof(
      chain,
      trace.bundle,
      biddingRes.winnerRole!,
      "valid",
      false
    );

    const deliveryRes = await runDeliveryVerificationSwarm(
      chain,
      trace.bundle,
      proofRes.proofPackage,
      { scenarioId: "S1", persistArtifacts: false }
    );

    expect(deliveryRes.votes.filter((v) => v.ok).length).toBeGreaterThanOrEqual(2);
    expect(deliveryRes.final_status).toBe("Delivered");
    expect(BigInt(deliveryRes.tranche2_paid ?? "0")).toBeGreaterThan(BigInt(0));
  });

  it("rejects inflated/fraudulent proof in S5 and withholds Tranche 2 (reverts to Awarded)", async () => {
    const s5 = loadScenario("S5");
    const [built] = ingestReportsToBundles(s5.reports, {
      incidentType: s5.incident_type,
      requestedTier: s5.requested_tier,
      mode: "replay"
    });
    const chain = new LifelineChainClient({ mode: "stub" });

    const trace = await runCase(built.bundle, {
      scenarioId: "S5",
      chain,
      persistArtifacts: false
    });
    const biddingRes = await runNgoBiddingRound(chain, trace.bundle, false);
    const proofRes = await submitNgoDeliveryProof(
      chain,
      trace.bundle,
      biddingRes.winnerRole!,
      "inflated_fraud",
      false
    );

    const deliveryRes = await runDeliveryVerificationSwarm(
      chain,
      trace.bundle,
      proofRes.proofPackage,
      { scenarioId: "S5", persistArtifacts: false }
    );

    expect(deliveryRes.votes.every((v) => v.ok === false)).toBe(true);
    expect(deliveryRes.final_status).toBe("Awarded");
    expect(deliveryRes.tranche2_paid).toBe("0");
  });

  it("omits vote when a verifier errors during delivery check rather than casting a wrong vote (B.4.6 fail-safe)", async () => {
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
    const biddingRes = await runNgoBiddingRound(chain, trace.bundle, false);
    const proofRes = await submitNgoDeliveryProof(
      chain,
      trace.bundle,
      biddingRes.winnerRole!,
      "valid",
      false
    );

    const deliveryRes = await runDeliveryVerificationSwarm(
      chain,
      trace.bundle,
      proofRes.proofPackage,
      {
        scenarioId: "S1",
        persistArtifacts: false,
        customEvaluator: async (role) => {
          if (role === "fact" || role === "red") {
            throw new Error("Simulated provider outage during delivery check");
          }
          return evaluateDeliveryForRole(role, trace.bundle, proofRes.proofPackage, "S1");
        }
      }
    );

    // Only geo and sev cast votes (2 votes total), and 2 ok votes still reach Delivered!
    expect(deliveryRes.votes).toHaveLength(2);
    expect(deliveryRes.final_status).toBe("Delivered");
  });
});
