import { describe, expect, it } from "vitest";
import {
  callStructuredLlm,
  getModelConfigForRole,
  LlmVoteOutputSchema
} from "../src/llm/client.js";

describe("LLM Client — Schema Validation, Retry-Once, and Abstain Fallback (B.1 #3 & #4)", () => {
  it("configures distinct models across fact, sev, and red roles", () => {
    const factCfg = getModelConfigForRole("fact");
    const sevCfg = getModelConfigForRole("sev");
    const redCfg = getModelConfigForRole("red");

    expect(factCfg.modelId).not.toBe(sevCfg.modelId);
    expect(sevCfg.modelId).not.toBe(redCfg.modelId);
    expect(factCfg.provider).toBe("near-ai-cloud");
    expect(redCfg.provider).toBe("secondary");
  });

  it("retries once when attempt 1 returns garbage JSON and succeeds when attempt 2 returns valid JSON", async () => {
    let calls = 0;
    const res = await callStructuredLlm({
      role: "fact",
      systemPrompt: "You are a fact verifier.",
      userPrompt: "Evaluate claim.",
      schema: LlmVoteOutputSchema,
      mode: "live",
      customFetch: async (_sys, _usr, attempt) => {
        calls = attempt;
        if (attempt === 1) {
          return "NOT_VALID_JSON {{{";
        }
        return JSON.stringify({
          verdict: "Yes",
          confidence_bps: 8800,
          reasoning: "Recovered on second attempt with valid JSON."
        });
      }
    });

    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
    expect(res.data?.verdict).toBe("Yes");
    expect(res.attempts).toBe(2);
  });

  it("defaults to Abstain with invalid_model_output when both attempts return invalid JSON (never defaults to Yes)", async () => {
    const res = await callStructuredLlm({
      role: "sev",
      systemPrompt: "You are a severity verifier.",
      userPrompt: "Evaluate tier.",
      schema: LlmVoteOutputSchema,
      mode: "live",
      customFetch: async () => "Total garbage output that is not JSON"
    });

    expect(res.ok).toBe(false);
    expect(res.abstainFallback.verdict).toBe("Abstain");
    expect(res.abstainFallback.reasoning).toContain("invalid_model_output");
    expect(res.attempts).toBe(2);
  });

  it("defaults to Abstain when the LLM times out or errors out", async () => {
    const res = await callStructuredLlm({
      role: "red",
      systemPrompt: "You are a red team verifier.",
      userPrompt: "Find flaws.",
      schema: LlmVoteOutputSchema,
      mode: "live",
      customFetch: async () => {
        throw new Error("TimeoutError: The operation was aborted");
      }
    });

    expect(res.ok).toBe(false);
    expect(res.abstainFallback.verdict).toBe("Abstain");
    expect(res.abstainFallback.reasoning).toContain("llm_timeout_or_error");
  });
});
