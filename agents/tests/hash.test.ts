import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonical, hashSourceId, scrubPiiText } from "../src/utils/hash.js";

describe("Canonical JSON & SHA-256 Hashing (B.4.1 / B.5)", () => {
  it("produces identical canonical JSON and SHA-256 hash regardless of object key order", () => {
    const objA = {
      case_id: "s5ptx-2024-09-10-001",
      geohash: "s5ptx",
      centroid: { lon: 13.15, lat: 11.83 },
      reports: [
        { ts: "2024-09-10T05:00:00Z", text: "Flood water rising", source_type: "sms_relay" }
      ]
    };

    const objB = {
      geohash: "s5ptx",
      centroid: { lat: 11.83, lon: 13.15 },
      reports: [
        { source_type: "sms_relay", text: "Flood water rising", ts: "2024-09-10T05:00:00Z" }
      ],
      case_id: "s5ptx-2024-09-10-001"
    };

    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(hashCanonical(objA)).toBe(hashCanonical(objB));
    expect(hashCanonical(objA)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes source_id deterministically and strips case/whitespace differences", () => {
    const h1 = hashSourceId("+2348012345678");
    const h2 = hashSourceId("  +2348012345678 ");
    const h3 = hashSourceId("+2348099999999");

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("scrubs phone numbers and emails from report text to protect reporter privacy", () => {
    const raw = "Call me at +234 803 123 4567 or email help@maiduguri.org urgently!";
    const scrubbed = scrubPiiText(raw);
    expect(scrubbed).not.toContain("803 123 4567");
    expect(scrubbed).not.toContain("help@maiduguri.org");
    expect(scrubbed).toContain("[REDACTED_PHONE]");
    expect(scrubbed).toContain("[REDACTED_EMAIL]");
  });
});
