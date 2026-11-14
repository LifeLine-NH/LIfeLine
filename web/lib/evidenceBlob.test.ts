import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: string) => {
    store.set(pathname, body);
    return { pathname };
  }),
  get: vi.fn(async (pathname: string) => {
    const text = store.get(pathname);
    return text === undefined ? null : { statusCode: 200, stream: new Response(text).body };
  }),
}));

const { getBlobRecord, uploadNewRecords } = await import("./evidenceBlob");
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

describe("evidence blob store", () => {
  beforeEach(() => store.clear());

  it("uploads only the records written since the run started", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ev-"));
    const start = Date.now();
    await writeFile(path.join(dir, `${hashA}.json`), '{"kind":"old"}');
    await utimes(path.join(dir, `${hashA}.json`), new Date(start - 60_000), new Date(start - 60_000));
    await writeFile(path.join(dir, `${hashB}.json`), '{"kind":"vote_record"}');
    await writeFile(path.join(dir, "notes.txt"), "not a record");

    expect(await uploadNewRecords(dir, start - 1000)).toBe(1);
    expect([...store.keys()]).toEqual([`evidence/${hashB}.json`]);
    expect(await getBlobRecord(hashB)).toEqual({ kind: "vote_record" });
  });

  it("returns null for a record that isn't stored, and copes with a missing folder", async () => {
    expect(await getBlobRecord(hashA)).toBeNull();
    expect(await uploadNewRecords(path.join(tmpdir(), "does-not-exist-ll"), 0)).toBe(0);
  });
});
