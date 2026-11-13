import { describe, expect, it } from "vitest";
import s1 from "./__fixtures__/trace-S1.json";
import s2 from "./__fixtures__/trace-S2.json";
import s3 from "./__fixtures__/trace-S3.json";
import s5 from "./__fixtures__/trace-S5.json";
import { brokenVerifiers, type SwarmTrace, traceToScript } from "./trace";

// Fixtures are real traces from B's runner (agents, replay mode, stub chain), dumped on 12 Nov 2026.
const t = (x: unknown) => x as SwarmTrace;

describe("traceToScript", () => {
  it("S1 funds the case and walks through bids, award, proof and both payments", () => {
    const s = traceToScript(t(s1), "Genuine report", { households_reached: 212, planned_households: 200 });
    expect(s.decision.word).toBe("Funded");
    expect(s.decision.funded).toBe(true);
    expect(s.votes.map((v) => v.verdict)).toEqual(["Yes", "Yes", "Yes", "Yes"]);
    expect(s.events.map((e) => e.kind)).toEqual(["bid", "bid", "bid", "pay", "proof", "ok", "pay"]);
    expect(s.events[4].detail).toBe("212 households reached · plan 200");
  });

  it("S2 and S3 are rejected with no events after the decision", () => {
    for (const x of [s2, s3]) {
      const s = traceToScript(t(x), "attack");
      expect(s.decision.word).toBe("Rejected");
      expect(s.decision.funded).toBe(false);
      expect(s.events).toEqual([]);
    }
  });

  it("S5 withholds the second payment after a failed delivery check", () => {
    const s = traceToScript(t(s5), "Inflated proof");
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("no");
    expect(kinds.at(-1)).toBe("hold");
    expect(kinds.filter((k) => k === "pay")).toHaveLength(1);
  });

  it("keeps votes in Geo, Fact, Severity, Red team order with reasons", () => {
    const s = traceToScript(t(s2), "Keyword attack");
    expect(s.votes.map((v) => v.role)).toEqual(["geo", "fact", "sev", "red"]);
    expect(s.votes.every((v) => v.reason && v.reason.length > 0)).toBe(true);
  });
});

describe("brokenVerifiers", () => {
  it("finds none in a healthy run", () => {
    expect(brokenVerifiers(t(s1))).toEqual([]);
  });
  it("flags verifiers that fell back after an error", () => {
    const broken = structuredClone(s1) as unknown as SwarmTrace;
    broken.verifier_steps[1].vote_record.model = "error-fallback";
    expect(brokenVerifiers(broken)).toEqual(["fact"]);
  });
});
