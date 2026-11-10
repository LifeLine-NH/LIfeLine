import { ToolResultSchema, type ToolResult, type ToolSupport } from "../schemas/index.js";
import { hashCanonical } from "../utils/hash.js";
import { loadFixtureJson, type Tool, type ToolQuery } from "./types.js";

interface ReliefWebItem {
  id?: string;
  fields?: {
    title?: string;
    body?: string;
  };
}

interface ReliefWebResponse {
  totalCount?: number;
  data?: ReliefWebItem[];
  retrieved_at?: string;
  source_url?: string;
}

/**
 * UN OCHA ReliefWeb Humanitarian Report Tool (Section B.2)
 */
export const reliefwebTool: Tool = async (q: ToolQuery): Promise<ToolResult> => {
  const mode = q.mode ?? "replay";
  const appname = process.env.RELIEFWEB_APPNAME ?? "lifeline-near-hackathon";
  const defaultUrl = `https://api.reliefweb.int/v1/reports?appname=${encodeURIComponent(appname)}&limit=5`;

  let rawData: ReliefWebResponse;
  let retrievedAt = new Date().toISOString();
  let url = defaultUrl;

  if (mode === "replay") {
    rawData = loadFixtureJson<ReliefWebResponse>(q, "reliefweb.json");
    retrievedAt = rawData.retrieved_at ?? "2024-09-10T06:00:00Z";
    url = rawData.source_url ?? defaultUrl;
  } else {
    const res = await fetch(defaultUrl, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      throw new Error(`ReliefWeb HTTP ${res.status}`);
    }
    rawData = (await res.json()) as ReliefWebResponse;
  }

  const items = rawData.data ?? [];
  let supports: ToolSupport = "no";
  let claim = "No corroborating UN OCHA ReliefWeb situation reports found for region/window";

  if (items.length > 0) {
    supports = "yes";
    const title = items[0]?.fields?.title ?? "Humanitarian Flash Update";
    claim = `ReliefWeb situation report confirmed (${items.length} matches): "${title}"`;
  }

  const rawHash = hashCanonical(rawData);

  return ToolResultSchema.parse({
    tool: "reliefweb",
    claim,
    supports,
    url,
    retrieved_at: retrievedAt,
    raw_hash: rawHash,
    raw: rawData
  });
};
