import { ToolResultSchema, type ToolResult, type ToolSupport } from "../schemas/index.js";
import { hashCanonical } from "../utils/hash.js";
import { loadFixtureJson, type Tool, type ToolQuery } from "./types.js";

interface GdacsFeature {
  properties?: {
    eventtype?: string;
    eventid?: number;
    name?: string;
    alertlevel?: string;
    severity?: string;
    country?: string;
  };
}

interface GdacsResponse {
  features?: GdacsFeature[];
  retrieved_at?: string;
  source_url?: string;
}

/**
 * GDACS (Global Disaster Alert and Coordination System) Tool (Section B.2)
 */
export const gdacsTool: Tool = async (q: ToolQuery): Promise<ToolResult> => {
  const mode = q.mode ?? "replay";
  const defaultUrl = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=FL;EQ;TC&fromDate=${q.from.slice(0, 10)}&toDate=${q.to.slice(0, 10)}`;

  let rawData: GdacsResponse;
  let retrievedAt = new Date().toISOString();
  let url = defaultUrl;

  if (mode === "replay") {
    rawData = loadFixtureJson<GdacsResponse>(q, "gdacs.json");
    retrievedAt = rawData.retrieved_at ?? "2024-09-10T06:00:00Z";
    url = rawData.source_url ?? defaultUrl;
  } else {
    const res = await fetch(defaultUrl, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      throw new Error(`GDACS HTTP ${res.status}`);
    }
    rawData = (await res.json()) as GdacsResponse;
  }

  const features = rawData.features ?? [];
  let supports: ToolSupport = "no";
  let claim = "No active GDACS disaster alert found in region/window";

  if (features.length > 0) {
    const first = features[0]?.properties;
    supports = "yes";
    claim = `GDACS ${first?.alertlevel ?? "Active"} Alert: ${first?.name ?? "Disaster event"} — ${first?.severity ?? "verified alert"}`;
  }

  const rawHash = hashCanonical(rawData);

  return ToolResultSchema.parse({
    tool: "gdacs",
    claim,
    supports,
    url,
    retrieved_at: retrievedAt,
    raw_hash: rawHash,
    raw: rawData
  });
};
