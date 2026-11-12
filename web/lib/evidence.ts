import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStubEvidence } from "./chain/stub";
import { config } from "./config";

// Where B's agent runner writes evidence when it runs inside this app (agents/src/intake/bundle.ts).
export const RUNNER_EVIDENCE_DIR = process.env.AGENT_EVIDENCE_DIR || path.resolve(process.cwd(), "storage/evidence");

async function fromRunner(hash: string): Promise<unknown | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  try {
    return JSON.parse(await readFile(path.join(RUNNER_EVIDENCE_DIR, `${hash}.json`), "utf8"));
  } catch {
    return null;
  }
}

// Evidence lives off chain; only its hash is on chain.
export async function getEvidence(hash: string): Promise<unknown | null> {
  if (config.chainMode === "stub") return (await getStubEvidence(hash)) ?? (await fromRunner(hash));
  if (config.evidenceBaseUrl) {
    const res = await fetch(`${config.evidenceBaseUrl.replace(/\/$/, "")}/${hash}`, { cache: "no-store" });
    if (res.ok) return res.json();
  }
  return fromRunner(hash);
}
