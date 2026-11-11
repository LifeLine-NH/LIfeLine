import { config } from "./config";
import { getStubEvidence } from "./chain/stub";

// Evidence lives off chain; only its hash is on chain. Storage location is still to be agreed with B.
export async function getEvidence(hash: string): Promise<unknown | null> {
  if (config.chainMode === "stub") return getStubEvidence(hash);
  if (!config.evidenceBaseUrl) return null;
  const res = await fetch(`${config.evidenceBaseUrl.replace(/\/$/, "")}/${hash}`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}
