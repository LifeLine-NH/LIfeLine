import { createHash } from "node:crypto";

/**
 * Recursively sorts object keys alphabetically so JSON serialization is canonical and deterministic.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const val = record[key];
      if (val !== undefined) {
        result[key] = sortKeysDeep(val);
      }
    }
    return result;
  }
  return value;
}

/**
 * Produces deterministic canonical JSON string with sorted keys and no extra whitespace.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/**
 * Computes lowercase hex SHA-256 hash of a string or canonicalized object.
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Computes deterministic SHA-256 hash of any JSON-serializable object via canonicalJson.
 */
export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Hashes raw reporter source_id (e.g., phone number or relay sender ID) with a domain prefix
 * so raw PII never enters an EvidenceBundle or LLM prompt.
 */
export function hashSourceId(rawSourceId: string): string {
  const normalized = rawSourceId.trim().toLowerCase();
  return sha256Hex(`lifeline:source:${normalized}`);
}

/**
 * Scrubs phone numbers and email addresses from free-form report text before bundling or LLM prompting.
 */
export function scrubPiiText(text: string): string {
  return text
    .replace(/\+?\d[\d\s\-()]{7,}\d/g, "[REDACTED_PHONE]")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]");
}
