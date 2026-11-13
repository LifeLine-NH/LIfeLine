import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { RUNNER_EVIDENCE_DIR } from "@/lib/evidence";
import { canonicalJson, hashCanonical } from "@/lib/hash";

// Stores a JSON record (NGO profile, bid plan, proof of delivery) under its SHA-256 so it can be
// fetched from /api/evidence/<hash> and checked against the hash the contract stores.
const MAX_BYTES = 32 * 1024;
const MAX_FILES = 5000;
const KINDS = new Set(["ngo_profile", "bid_plan", "delivery_proof"]);

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Records are limited to 32 KB." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Send one JSON object." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Send one JSON object." }, { status: 400 });
  const kind = (body as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !KINDS.has(kind)) return Response.json({ error: `"kind" must be one of ${[...KINDS].join(", ")}.` }, { status: 400 });

  const hash = await hashCanonical(body);
  try {
    await mkdir(RUNNER_EVIDENCE_DIR, { recursive: true });
    if ((await readdir(RUNNER_EVIDENCE_DIR)).length >= MAX_FILES) return Response.json({ error: "Evidence storage is full." }, { status: 507 });
    await writeFile(path.join(RUNNER_EVIDENCE_DIR, `${hash}.json`), canonicalJson(body), "utf8");
  } catch (err) {
    return Response.json({ error: `Couldn't store the record: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
  return Response.json({ hash, uri: `/api/evidence/${hash}` });
}
