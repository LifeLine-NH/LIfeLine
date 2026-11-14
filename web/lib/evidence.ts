import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStubEvidence } from "./chain/stub";
import { blobEnabled, getBlobRecord } from "./evidenceBlob";
import { config } from "./config";

// Where B's agent runner writes evidence when it runs inside this app (agents/src/intake/bundle.ts).
const BUNDLED_EVIDENCE_DIR = path.resolve(process.cwd(), "storage/evidence");
export const RUNNER_EVIDENCE_DIR = process.env.AGENT_EVIDENCE_DIR || BUNDLED_EVIDENCE_DIR;

// On Vercel the runner writes under /tmp, while the recorded testnet records ship with the deploy.
async function fromRunner(hash: string): Promise<unknown | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  for (const dir of new Set([RUNNER_EVIDENCE_DIR, BUNDLED_EVIDENCE_DIR])) {
    try {
      return JSON.parse(await readFile(path.join(dir, `${hash}.json`), "utf8"));
    } catch {}
  }
  if (blobEnabled()) return getBlobRecord(hash).catch(() => null);
  return null;
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
