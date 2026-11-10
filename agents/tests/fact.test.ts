import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ingestReportsToBundles } from "../src/intake/bundle.js";
import { ScenarioSchema } from "../src/schemas/index.js";
import { FactVerifier } from "../src/verifiers/fact.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadScenario(id: string) {
  const filePath = path.resolve(__dirname, `../scenarios/${id}.json`);
  return ScenarioSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

describe("V2 FactVerifier — External Tools + LLM #1 & >=2 Tools Guard (B.4.3)", () => {
  const fact = new FactVerifier();

  it("votes Yes on S1 genuine flood when 3 independent external tools support", async () => {
    const s1 = loadScenario("S1");
    const [built] = ingestReportsToBundles(s1.reports, {
      incidentType: s1.incident_type,
      requestedTier: s1.requested_tier,
      mode: "replay"
    });

    const record = await fact.run(built.bundle, { scenarioId: "S1" });
    expect(record.agent).toBe("fact");
    expect(record.verdict).toBe("Yes");
    expect(record.tool_calls.filter((t) => t.supports === "yes")).toHaveLength(3);
  });

  it("votes No on S2 keyword attack when all weather/disaster tools show dry conditions", async () => {
    const s2 = loadScenario("S2");
    const [built] = ingestReportsToBundles(s2.reports, {
      incidentType: s2.incident_type,
      requestedTier: s2.requested_tier,
      mode: "replay"
    });

    const record = await fact.run(built.bundle, { scenarioId: "S2" });
    expect(record.verdict).toBe("No");
    expect(record.tool_calls.filter((t) => t.supports === "yes")).toHaveLength(0);
  });

  it("overrides LLM Yes to No if fewer than 2 external tools support the claim", async () => {
    const s2 = loadScenario("S2");
    const [built] = ingestReportsToBundles(s2.reports, {
      incidentType: s2.incident_type,
      requestedTier: s2.requested_tier,
      mode: "replay",
      externalEvidence: [
        {
          tool: "open-meteo",
          claim: "0mm rain",
          supports: "no",
          url: "https://archive-api.open-meteo.com/v1/archive",
          retrieved_at: "2025-01-15T10:20:00Z",
          raw_hash: "a".repeat(64)
        },
        {
          tool: "gdacs",
          claim: "No alert",
          supports: "no",
          url: "https://www.gdacs.org",
          retrieved_at: "2025-01-15T10:20:00Z",
          raw_hash: "b".repeat(64)
        }
      ]
    });

    // Even if we pass S1's replay recording (which says Yes), the code guard sees 0 supporting tools and overrides to No
    const record = await fact.run(built.bundle, { scenarioId: "S1" });
    expect(record.verdict).toBe("No");
    expect(record.reasoning).toContain("Code guard override");
  });
});
