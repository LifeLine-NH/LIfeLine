import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z, type ZodSchema } from "zod";
import type { ExecutionMode, Verdict } from "../schemas/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_ROOT = path.resolve(__dirname, "../../recordings");

export type LlmAgentRole = "fact" | "sev" | "red" | "delivery";

export interface LlmModelConfig {
  provider: "near-ai-cloud" | "secondary";
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export function getModelConfigForRole(role: LlmAgentRole): LlmModelConfig {
  const nearBaseUrl = process.env.NEAR_AI_BASE_URL ?? "https://api.near.ai/v1";
  const nearApiKey = process.env.NEAR_AI_API_KEY ?? "";
  const secondaryBaseUrl = process.env.SECONDARY_LLM_BASE_URL ?? "https://api.openai.com/v1";
  const secondaryApiKey = process.env.SECONDARY_LLM_API_KEY ?? "";

  switch (role) {
    case "fact":
      return {
        provider: "near-ai-cloud",
        baseUrl: nearBaseUrl,
        apiKey: nearApiKey,
        modelId:
          process.env.FACT_MODEL_ID ??
          "fireworks::accounts/fireworks/models/llama-v3p1-70b-instruct"
      };
    case "sev":
      return {
        provider: "near-ai-cloud",
        baseUrl: nearBaseUrl,
        apiKey: nearApiKey,
        modelId:
          process.env.SEV_MODEL_ID ??
          "fireworks::accounts/fireworks/models/qwen2p5-72b-instruct"
      };
    case "red":
    case "delivery":
      return {
        provider: "secondary",
        baseUrl: secondaryBaseUrl,
        apiKey: secondaryApiKey,
        modelId: process.env.RED_MODEL_ID ?? "gpt-4o-mini"
      };
  }
}

export const LlmVoteOutputSchema = z.object({
  verdict: z.enum(["Yes", "No", "Abstain"]),
  confidence_bps: z.number().int().min(0).max(10000),
  tier: z.number().int().min(0).max(4).optional(),
  reasoning: z.string().min(1),
  strongest_objection: z.string().optional(),
  can_be_rebutted: z.boolean().optional()
});
export type LlmVoteOutput = z.infer<typeof LlmVoteOutputSchema>;

export interface StructuredLlmCallOptions<T> {
  role: LlmAgentRole;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
  mode?: ExecutionMode;
  scenarioId?: string;
  timeoutMs?: number;
  customFetch?: (systemPrompt: string, userPrompt: string, attempt: number) => Promise<string>;
}

export interface StructuredLlmCallResult<T> {
  ok: boolean;
  model: string;
  data?: T;
  abstainFallback: {
    verdict: Verdict;
    confidence_bps: number;
    tier: number;
    reasoning: string;
  };
  attempts: number;
}

/**
 * Extracts a JSON object from raw model output (handles optional ```json ... ``` markdown fences).
 */
export function extractJsonFromText(raw: string): unknown {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

/**
 * Schema-validated LLM client with:
 * - Distinct models/providers per role (`fact` = LLM #1 on NEAR AI Cloud, `sev` = LLM #2 on NEAR AI Cloud, `red` = LLM #3 on secondary provider)
 * - Low temperature (`0.1`), capped tokens (`600`), ~25s timeout
 * - 1 automatic retry if the model returns invalid JSON or fails Zod schema validation
 * - Safe failure mode (Section B.1 #3 & #4): never defaults to `Yes`; returns `Abstain` with `invalid_model_output` or `llm_timeout_or_error`
 * - Offline `replay` mode reading `agents/recordings/<scenario>/<role>.json` with zero API keys
 */
export async function callStructuredLlm<T>(
  options: StructuredLlmCallOptions<T>
): Promise<StructuredLlmCallResult<T>> {
  const config = getModelConfigForRole(options.role);
  const mode = options.mode ?? "replay";
  const timeoutMs = options.timeoutMs ?? 25_000;

  if (mode === "replay" && !options.customFetch) {
    const scenarioFolder = (options.scenarioId ?? "S1").toUpperCase();
    const recordingPath = path.join(RECORDINGS_ROOT, scenarioFolder, `${options.role}.json`);
    if (existsSync(recordingPath)) {
      try {
        const rawJson = JSON.parse(readFileSync(recordingPath, "utf8"));
        const parsed = options.schema.parse(rawJson);
        return {
          ok: true,
          model: `${config.modelId} (replay)`,
          data: parsed,
          abstainFallback: {
            verdict: "Abstain",
            confidence_bps: 0,
            tier: 0,
            reasoning: "unused"
          },
          attempts: 1
        };
      } catch (err) {
        return {
          ok: false,
          model: `${config.modelId} (replay)`,
          abstainFallback: {
            verdict: "Abstain",
            confidence_bps: 0,
            tier: 0,
            reasoning: `invalid_model_output: replay recording validation failed (${
              err instanceof Error ? err.message : String(err)
            })`
          },
          attempts: 1
        };
      }
    }
  }

  let lastErrorReason = "invalid_model_output";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      let rawText: string;

      if (options.customFetch) {
        rawText = await options.customFetch(options.systemPrompt, options.userPrompt, attempt);
      } else {
        if (!config.apiKey) {
          throw new Error(`Missing API key for provider ${config.provider}`);
        }
        const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.modelId,
            temperature: 0.1,
            max_tokens: 600,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: options.systemPrompt },
              { role: "user", content: options.userPrompt }
            ]
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (!response.ok) {
          throw new Error(`LLM HTTP ${response.status}`);
        }

        const body = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawText = body.choices?.[0]?.message?.content ?? "";
      }

      const jsonObj = extractJsonFromText(rawText);
      const validated = options.schema.parse(jsonObj);

      if (process.env.RECORD_LLM === "true" && options.scenarioId) {
        const dir = path.join(RECORDINGS_ROOT, options.scenarioId.toUpperCase());
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          path.join(dir, `${options.role}.json`),
          JSON.stringify(validated, null, 2),
          "utf8"
        );
      }

      return {
        ok: true,
        model: config.modelId,
        data: validated,
        abstainFallback: {
          verdict: "Abstain",
          confidence_bps: 0,
          tier: 0,
          reasoning: "unused"
        },
        attempts: attempt
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Timeout") ||
        msg.includes("abort") ||
        msg.includes("HTTP") ||
        msg.includes("Missing API key")
      ) {
        lastErrorReason = `llm_timeout_or_error: ${msg}`;
      } else {
        lastErrorReason = `invalid_model_output: ${msg}`;
      }
    }
  }

  return {
    ok: false,
    model: config.modelId,
    abstainFallback: {
      verdict: "Abstain",
      confidence_bps: 0,
      tier: 0,
      reasoning: lastErrorReason
    },
    attempts: 2
  };
}
