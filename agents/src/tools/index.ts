import type { ExternalEvidenceEntry, ToolResult } from "../schemas/index.js";
import { sha256Hex } from "../utils/hash.js";
import { gdacsTool } from "./gdacs.js";
import { openMeteoTool } from "./openMeteo.js";
import { reliefwebTool } from "./reliefweb.js";
import type { Tool, ToolQuery } from "./types.js";
import { usgsTool } from "./usgs.js";

export { openMeteoTool, gdacsTool, reliefwebTool, usgsTool };
export type { Tool, ToolQuery };

const REGISTERED_TOOLS: Array<{ name: string; fn: Tool }> = [
  { name: "open-meteo", fn: openMeteoTool },
  { name: "gdacs", fn: gdacsTool },
  { name: "reliefweb", fn: reliefwebTool },
  { name: "usgs", fn: usgsTool }
];

/**
 * Runs all registered external evidence tools in parallel.
 * If any individual tool times out or errors out in live mode, it safely degrades to
 * `supports: "unclear"` so a single upstream API outage never blocks the swarm.
 */
export async function runAllEvidenceTools(q: ToolQuery): Promise<ToolResult[]> {
  const settled = await Promise.allSettled(REGISTERED_TOOLS.map((t) => t.fn(q)));

  return settled.map((item, idx) => {
    const toolName = REGISTERED_TOOLS[idx].name;
    if (item.status === "fulfilled") {
      return item.value;
    }
    const errMsg = item.reason instanceof Error ? item.reason.message : String(item.reason);
    return {
      tool: toolName,
      claim: `Tool unavailable or timed out (${errMsg}); defaulting to unclear`,
      supports: "unclear",
      url: `https://lifeline.invalid/tool-error/${toolName}`,
      retrieved_at: new Date().toISOString(),
      raw_hash: sha256Hex(`error:${toolName}:${errMsg}`)
    };
  });
}

/**
 * Strips bulky `raw` fields from ToolResults to produce compact ExternalEvidenceEntry records
 * suitable for storing inside `EvidenceBundle` and `VoteRecord`.
 */
export function toExternalEvidenceEntries(results: ToolResult[]): ExternalEvidenceEntry[] {
  return results.map((r) => ({
    tool: r.tool,
    claim: r.claim,
    supports: r.supports,
    url: r.url,
    retrieved_at: r.retrieved_at,
    raw_hash: r.raw_hash
  }));
}
