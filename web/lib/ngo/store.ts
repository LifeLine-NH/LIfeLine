"use client";

import { hashCanonical } from "../hash";

// Saves a record through /api/evidence and checks the server stored exactly what we hashed.
export async function storeRecord(record: Record<string, unknown>): Promise<{ hash: string; uri: string }> {
  const expected = await hashCanonical(record);
  const res = await fetch("/api/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.hash) throw new Error(body?.error ?? `Evidence storage answered ${res.status}.`);
  if (body.hash !== expected) throw new Error("Evidence storage returned a different hash than the one computed here, so nothing was sent.");
  return { hash: body.hash, uri: body.uri };
}
