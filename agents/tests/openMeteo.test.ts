import { describe, expect, it } from "vitest";
import { openMeteoTool } from "../src/tools/openMeteo.js";

describe("Open-Meteo Evidence Tool Adapter (B.2)", () => {
  it("returns supports='yes' with deterministic raw_hash for S1 Maiduguri flood fixture", async () => {
    const res = await openMeteoTool({
      lat: 11.83,
      lon: 13.15,
      from: "2024-09-08T00:00:00Z",
      to: "2024-09-10T10:00:00Z",
      incident_type: "flood",
      mode: "replay",
      scenarioId: "S1"
    });

    expect(res.tool).toBe("open-meteo");
    expect(res.supports).toBe("yes");
    expect(res.claim).toContain("112.4mm/24h");
    expect(res.raw_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns supports='no' for S2 dry-zone keyword attack fixture", async () => {
    const res = await openMeteoTool({
      lat: 12.0,
      lon: 8.59,
      from: "2025-01-13T00:00:00Z",
      to: "2025-01-15T12:00:00Z",
      incident_type: "flood",
      mode: "replay",
      scenarioId: "S2"
    });

    expect(res.supports).toBe("no");
    expect(res.claim).toContain("0mm total precipitation");
  });
});
