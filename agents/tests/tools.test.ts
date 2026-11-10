import { describe, expect, it } from "vitest";
import { runAllEvidenceTools } from "../src/tools/index.js";

describe("External Evidence Tools Suite — GDACS, ReliefWeb, USGS, Open-Meteo (B.2)", () => {
  it("finds 3 independent supporting tools (open-meteo, gdacs, reliefweb) for S1 genuine flood", async () => {
    const results = await runAllEvidenceTools({
      lat: 11.83,
      lon: 13.15,
      from: "2024-09-10T04:00:00Z",
      to: "2024-09-10T10:00:00Z",
      incident_type: "flood",
      mode: "replay",
      scenarioId: "S1"
    });

    expect(results).toHaveLength(4);
    const supporting = results.filter((r) => r.supports === "yes");
    expect(supporting.map((s) => s.tool)).toEqual(["open-meteo", "gdacs", "reliefweb"]);
    const usgs = results.find((r) => r.tool === "usgs");
    expect(usgs?.supports).toBe("unclear");
  });

  it("finds zero supporting tools for S2 keyword attack in a dry zone", async () => {
    const results = await runAllEvidenceTools({
      lat: 12.0,
      lon: 8.59,
      from: "2025-01-15T10:00:00Z",
      to: "2025-01-15T11:00:00Z",
      incident_type: "flood",
      mode: "replay",
      scenarioId: "S2"
    });

    const supporting = results.filter((r) => r.supports === "yes");
    expect(supporting).toHaveLength(0);
    const refuting = results.filter((r) => r.supports === "no");
    expect(refuting.map((r) => r.tool)).toEqual(["open-meteo", "gdacs", "reliefweb"]);
  });
});
