import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutionMode, ToolResult } from "../schemas/index.js";

export interface ToolQuery {
  lat: number;
  lon: number;
  from: string;
  to: string;
  incident_type?: "flood" | "earthquake" | "fire" | "cyclone" | "other";
  mode?: ExecutionMode;
  scenarioId?: string;
}

export type Tool = (q: ToolQuery) => Promise<ToolResult>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.resolve(__dirname, "../../fixtures");

/**
 * Resolves the fixture folder (`S1`, `S2`, or `S3`) from either `scenarioId` or coordinates.
 * Note: S5 uses the same genuine Maiduguri flood event as S1 for intake/verification.
 */
export function resolveFixtureScenario(q: ToolQuery): string {
  if (q.scenarioId) {
    if (q.scenarioId.toUpperCase() === "S5") return "S1";
    return q.scenarioId.toUpperCase();
  }
  if (Math.abs(q.lat - 11.83) < 0.2 && Math.abs(q.lon - 13.15) < 0.2) {
    return "S1";
  }
  if (Math.abs(q.lat - 12.0) < 0.2 && Math.abs(q.lon - 8.59) < 0.2) {
    return "S2";
  }
  return "S3";
}

export function loadFixtureJson<T = Record<string, unknown>>(
  q: ToolQuery,
  toolFileName: string
): T {
  const folder = resolveFixtureScenario(q);
  const fullPath = path.join(FIXTURES_ROOT, folder, toolFileName);
  return JSON.parse(readFileSync(fullPath, "utf8")) as T;
}
