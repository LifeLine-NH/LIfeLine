import { describe, expect, it } from "vitest";
import s1 from "./swarm/__fixtures__/trace-S1.json";
import s2 from "./swarm/__fixtures__/trace-S2.json";
import s3 from "./swarm/__fixtures__/trace-S3.json";
import s5 from "./swarm/__fixtures__/trace-S5.json";
import { canonicalJson, hashCanonical } from "./hash";

// The browser hash check only works if the website hashes records exactly like the agents do.
describe("hashCanonical matches the agents' hashes", () => {
  it.each([["S1", s1], ["S2", s2], ["S3", s3], ["S5", s5]])("evidence bundle of %s", async (_, trace) => {
    expect(await hashCanonical(trace.bundle)).toBe(trace.bundle_hash);
  });

  it("vote records of S1", async () => {
    for (const step of s1.verifier_steps) {
      expect(await hashCanonical(step.vote_record)).toBe(step.evidence_hash);
    }
  });

  it("sorts keys at every level and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [{ y: 2, x: 1 }] } })).toBe('{"a":{"c":[{"x":1,"y":2}]},"b":1}');
  });
});
