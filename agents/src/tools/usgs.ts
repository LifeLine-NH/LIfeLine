import { ToolResultSchema, type ToolResult, type ToolSupport } from "../schemas/index.js";
import { hashCanonical } from "../utils/hash.js";
import { loadFixtureJson, type Tool, type ToolQuery } from "./types.js";

interface UsgsFeature {
  properties?: {
    mag?: number;
    place?: string;
    title?: string;
  };
}

interface UsgsResponse {
  features?: UsgsFeature[];
  retrieved_at?: string;
  source_url?: string;
}

/**
 * USGS Earthquake Feed Tool (Section B.2)
 * Note: For flood incidents without seismic activity, returns supports="unclear"
 * (per Section B.2: "`supports: 'unclear'` is a valid, common answer. Do not force yes/no.")
 */
export const usgsTool: Tool = async (q: ToolQuery): Promise<ToolResult> => {
  const mode = q.mode ?? "replay";
  const startDate = q.from.slice(0, 10);
  const endDate = q.to.slice(0, 10);
  const defaultUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${q.lat.toFixed(2)}&longitude=${q.lon.toFixed(2)}&maxradiuskm=150&starttime=${startDate}&endtime=${endDate}`;

  let rawData: UsgsResponse;
  let retrievedAt = new Date().toISOString();
  let url = defaultUrl;

  if (mode === "replay") {
    rawData = loadFixtureJson<UsgsResponse>(q, "usgs.json");
    retrievedAt = rawData.retrieved_at ?? "2024-09-10T06:00:00Z";
    url = rawData.source_url ?? defaultUrl;
  } else {
    const res = await fetch(defaultUrl, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      throw new Error(`USGS HTTP ${res.status}`);
    }
    rawData = (await res.json()) as UsgsResponse;
  }

  const features = rawData.features ?? [];
  let supports: ToolSupport = "unclear";
  let claim = "No seismic activity recorded near centroid (seismic feed neutral for hydrological event)";

  if (features.length > 0) {
    const first = features[0]?.properties;
    supports = "yes";
    claim = `USGS seismic event detected: M${first?.mag ?? "?"} at ${first?.place ?? "region"}`;
  } else if (q.incident_type === "earthquake") {
    supports = "no";
    claim = "No USGS seismic events recorded within 150km radius for claimed earthquake";
  }

  const rawHash = hashCanonical(rawData);

  return ToolResultSchema.parse({
    tool: "usgs",
    claim,
    supports,
    url,
    retrieved_at: retrievedAt,
    raw_hash: rawHash,
    raw: rawData
  });
};
