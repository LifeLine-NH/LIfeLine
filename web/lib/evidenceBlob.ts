import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

// Vercel gives every function its own /tmp, so a record a run writes there can't be read by the
// case page. When a Blob store is connected (it sets BLOB_READ_WRITE_TOKEN), records are copied
// there and read back from any instance. Without the token nothing here runs.
const access = process.env.EVIDENCE_BLOB_ACCESS === "private" ? "private" : "public";
const HASH_FILE = /^([a-f0-9]{64})\.json$/;

export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const pathFor = (hash: string) => `evidence/${hash}.json`;

// Records are named by their own SHA-256, so writing the same one twice stores the same bytes.
export async function putBlobRecord(hash: string, text: string): Promise<void> {
  await put(pathFor(hash), text, { access, contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
}

export async function getBlobRecord(hash: string): Promise<unknown | null> {
  const res = await get(pathFor(hash), { access });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return JSON.parse(await new Response(res.stream).text());
}

// Copies the records a run just wrote. Returns how many were uploaded.
export async function uploadNewRecords(dir: string, sinceMs: number): Promise<number> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => HASH_FILE.test(n));
  const fresh: string[] = [];
  for (const name of names) {
    const s = await stat(path.join(dir, name)).catch(() => null);
    if (s && s.mtimeMs >= sinceMs) fresh.push(name);
  }
  await Promise.all(fresh.map(async (name) => putBlobRecord(name.slice(0, 64), await readFile(path.join(dir, name), "utf8"))));
  return fresh.length;
}
