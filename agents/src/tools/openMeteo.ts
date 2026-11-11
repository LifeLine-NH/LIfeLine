import { ToolResultSchema, type ToolResult, type ToolSupport } from "../schemas/index.js";
import { hashCanonical } from "../utils/hash.js";
import { loadFixtureJson, type Tool, type ToolQuery } from "./types.js";

interface OpenMeteoResponse {
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    rain_sum?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
  };
  retrieved_at?: string;
  source_url?: string;
}

/**
 * Open-Meteo Historical / Forecast Weather Anomaly Tool (Section B.2)
 * - In `replay` mode: loads `agents/fixtures/<scenario>/open-meteo.json`
 * - In `live` mode: fetches from Open-Meteo Archive / Forecast API (no API key required)
 */
export const openMeteoTool: Tool = async (q: ToolQuery): Promise<ToolResult> => {
  const mode = q.mode ?? "replay";
  const startDate = q.from.slice(0, 10);
  const endDate = q.to.slice(0, 10);
  const defaultUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${q.lat.toFixed(2)}&longitude=${q.lon.toFixed(2)}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum,rain_sum,wind_speed_10m_max&timezone=GMT`;

  let rawData: OpenMeteoResponse;
  let retrievedAt = new Date().toISOString();
  let url = defaultUrl;

  if (mode === "replay") {
    rawData = loadFixtureJson<OpenMeteoResponse>(q, "open-meteo.json");
    retrievedAt = rawData.retrieved_at ?? "2024-09-10T06:00:00Z";
    url = rawData.source_url ?? defaultUrl;
  } else {
    const res = await fetch(defaultUrl, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    rawData = (await res.json()) as OpenMeteoResponse;
  }

  const precip = (rawData.daily?.precipitation_sum ?? []).map((v) => v ?? 0);
  const maxDailyMm = precip.length > 0 ? Math.max(...precip) : 0;
  const totalMm = Number(precip.reduce((a, b) => a + b, 0).toFixed(1));

  let supports: ToolSupport = "unclear";
  if ((q.incident_type ?? "flood") === "flood") {
    if (maxDailyMm >= 40 || totalMm >= 75) {
      supports = "yes";
    } else if (totalMm < 5) {
      supports = "no";
    } else {
      supports = "unclear";
    }
  }

  const claim =
    supports === "yes"
      ? `Severe rainfall anomaly detected: peak ${maxDailyMm}mm/24h (${totalMm}mm cumulative over window)`
      : supports === "no"
        ? `No significant rainfall: ${totalMm}mm total precipitation recorded over window (dry conditions)`
        : `Moderate precipitation recorded: ${totalMm}mm total over window`;

  const rawHash = hashCanonical(rawData);

  return ToolResultSchema.parse({
    tool: "open-meteo",
    claim,
    supports,
    url,
    retrieved_at: retrievedAt,
    raw_hash: rawHash,
    raw: rawData
  });
};
