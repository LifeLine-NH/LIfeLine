import { describe, expect, it } from "vitest";
import { executeSwarmScenario, handleSwarmRunHttp } from "../src/api.js";
import { LifelineChainClient } from "../src/chain/client.js";

describe("End-to-End Scenario Pack (S1, S2, S3, S5) & HTTP Handler (B.5 & B.9)", () => {
  it("runs S1, S2, S3, and S5 repeatably across 5 iterations in replay mode with exact expected outcomes", async () => {
    for (let iter = 1; iter <= 5; iter++) {
      const chain = new LifelineChainClient({ mode: "stub" });

      const s1 = await executeSwarmScenario({ scenarioId: "S1", mode: "replay" }, chain);
      expect(s1.post_vote_status).toBe("Bidding");
      expect(s1.final_status).toBe("Delivered");
      expect(new Set(s1.verifier_steps.map((s) => s.signer_account)).size).toBe(4);

      const s2 = await executeSwarmScenario({ scenarioId: "S2", mode: "replay" }, chain);
      expect(s2.post_vote_status).toBe("Rejected");
      expect(s2.final_status).toBe("Rejected");

      const s3 = await executeSwarmScenario({ scenarioId: "S3", mode: "replay" }, chain);
      expect(s3.post_vote_status).toBe("Rejected");
      expect(s3.final_status).toBe("Rejected");

      const s5 = await executeSwarmScenario({ scenarioId: "S5", mode: "replay" }, chain);
      expect(s5.post_vote_status).toBe("Bidding");
      expect(s5.final_status).toBe("Awarded");
      expect(s5.delivery_trace?.tranche2_paid).toBe("0");
    }
  });

  it("serves SwarmTrace JSON via handleSwarmRunHttp for Developer C's /api/swarm/run endpoint", async () => {
    const req = new Request("http://localhost:3000/api/swarm/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "S2",
        mode: "replay",
        chainMode: "stub"
      })
    });

    const res = await handleSwarmRunHttp(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { final_status: string; verifier_steps: unknown[] };
    expect(body.final_status).toBe("Rejected");
    expect(body.verifier_steps).toHaveLength(4);
  });
});
