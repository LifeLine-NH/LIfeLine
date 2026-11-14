import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const requireFromAgents = createRequire(path.join(ROOT_DIR, "agents", "package.json"));
const dotenv = requireFromAgents("dotenv") as typeof import("../agents/node_modules/dotenv/lib/main.js");
const nearApi = requireFromAgents("near-api-js") as typeof import("../agents/node_modules/near-api-js");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const { connect, KeyPair, keyStores, utils } = nearApi;

type CheckStatus = "PASS" | "FAIL" | "SKIP";

interface CheckRow {
  check: string;
  status: CheckStatus;
  detail: string;
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function badge(status: CheckStatus): string {
  if (status === "PASS") return `${GREEN}PASS${RESET}`;
  if (status === "FAIL") return `${RED}FAIL${RESET}`;
  return `${YELLOW}SKIP${RESET}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const liveLlm = args.includes("--live") || process.env.SWARM_MODE === "live";

  const networkId = process.env.NEAR_NETWORK || "testnet";
  const nodeUrl = process.env.NEAR_RPC_URL || process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://rpc.testnet.near.org";
  const contractId = process.env.CONTRACT_ID || process.env.NEXT_PUBLIC_CONTRACT_ID || "lifeline-demo.testnet";
  const minAllowanceNear = process.env.PREFLIGHT_MIN_ALLOWANCE_NEAR || "0.02";
  const minAllowanceYocto = BigInt(utils.format.parseNearAmount(minAllowanceNear)!);
  const minPoolUnits = BigInt(process.env.PREFLIGHT_MIN_POOL_UNITS || "10000000000"); // 10,000 USDC @ 6 decimals

  const rows: CheckRow[] = [];

  const near = await connect({
    networkId,
    nodeUrl,
    keyStore: new keyStores.InMemoryKeyStore(),
  } as Parameters<typeof connect>[0]);

  // 1. RPC reachable
  try {
    const status = await near.connection.provider.status();
    rows.push({
      check: "RPC reachable",
      status: "PASS",
      detail: `${nodeUrl} (block #${status.sync_info.latest_block_height})`,
    });
  } catch (err) {
    rows.push({
      check: "RPC reachable",
      status: "FAIL",
      detail: `${nodeUrl}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const viewer = await near.account(contractId);

  // 2. Contract views (get_config, get_pool)
  let configData: {
    bidding_window_secs: number;
    proof_deadline_secs: number;
    tranche1_bps: number;
    tier_cap: string[];
    pool_token: string;
  } | null = null;
  let poolData: {
    balance: string;
    reserved: string;
    available: string;
    disbursed_today: string;
    donors_count: number;
  } | null = null;

  try {
    configData = await viewer.viewFunction({ contractId, methodName: "get_config", args: {} });
    poolData = await viewer.viewFunction({ contractId, methodName: "get_pool", args: {} });
    rows.push({
      check: "Contract views",
      status: "PASS",
      detail: `${contractId} (token: ${configData?.pool_token})`,
    });
  } catch (err) {
    rows.push({
      check: "Contract views",
      status: "FAIL",
      detail: `${contractId}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 3. Pool balance
  if (poolData) {
    const avail = BigInt(poolData.available);
    const ok = avail >= minPoolUnits;
    rows.push({
      check: "Pool balance",
      status: ok ? "PASS" : "FAIL",
      detail: `available=${(Number(avail) / 1e6).toLocaleString("en-US")} USDC, donors=${poolData.donors_count}`,
    });
  } else {
    rows.push({
      check: "Pool balance",
      status: "FAIL",
      detail: "Skipped because get_pool failed",
    });
  }

  // 4. Bidding and proof windows
  if (configData) {
    const ok = configData.bidding_window_secs > 0 && configData.proof_deadline_secs > 0;
    rows.push({
      check: "Bidding & proof windows",
      status: ok ? "PASS" : "FAIL",
      detail: `bidding=${configData.bidding_window_secs}s, proof=${configData.proof_deadline_secs}s, tranche1=${configData.tranche1_bps / 100}%`,
    });
  } else {
    rows.push({
      check: "Bidding & proof windows",
      status: "FAIL",
      detail: "Skipped because get_config failed",
    });
  }

  // 5. NGOs registered
  const ngoRoles = [
    { label: "NGO_1", id: process.env.NGO_1_ACCOUNT_ID || `ngo-rapid.${contractId}` },
    { label: "NGO_2", id: process.env.NGO_2_ACCOUNT_ID || `ngo-balanced.${contractId}` },
    { label: "NGO_3", id: process.env.NGO_3_ACCOUNT_ID || `ngo-frugal.${contractId}` },
  ];
  for (const ngo of ngoRoles) {
    try {
      const record = await viewer.viewFunction({
        contractId,
        methodName: "get_ngo",
        args: { account_id: ngo.id },
      });
      rows.push({
        check: `NGO registered (${ngo.label})`,
        status: record ? "PASS" : "FAIL",
        detail: record ? `${ngo.id} (rep=${(record as { reputation: number }).reputation})` : `${ngo.id} not registered`,
      });
    } catch (err) {
      rows.push({
        check: `NGO registered (${ngo.label})`,
        status: "FAIL",
        detail: `${ngo.id}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 6. Verifier & intake accounts + FunctionCall key allowances
  const keySpecs = [
    { label: "Intake", id: process.env.INTAKE_ACCOUNT_ID || `intake.${contractId}`, key: process.env.INTAKE_PRIVATE_KEY },
    { label: "Verifier Geo", id: process.env.V_GEO_ACCOUNT_ID || `v-geo.${contractId}`, key: process.env.V_GEO_PRIVATE_KEY },
    { label: "Verifier Fact", id: process.env.V_FACT_ACCOUNT_ID || `v-fact.${contractId}`, key: process.env.V_FACT_PRIVATE_KEY },
    { label: "Verifier Sev", id: process.env.V_SEV_ACCOUNT_ID || `v-sev.${contractId}`, key: process.env.V_SEV_PRIVATE_KEY },
    { label: "Verifier Red", id: process.env.V_RED_ACCOUNT_ID || `v-red.${contractId}`, key: process.env.V_RED_PRIVATE_KEY },
  ];

  for (const spec of keySpecs) {
    if (!spec.key) {
      rows.push({
        check: `Key (${spec.label})`,
        status: "FAIL",
        detail: `${spec.id}: private key missing in .env`,
      });
      continue;
    }
    try {
      const pubKey = KeyPair.fromString(spec.key as `ed25519:${string}`).getPublicKey().toString();
      const accessKey = (await near.connection.provider.query({
        request_type: "view_access_key",
        finality: "final",
        account_id: spec.id,
        public_key: pubKey,
      })) as unknown as {
        permission:
          | "FullAccess"
          | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };
      };

      if (accessKey.permission === "FullAccess") {
        rows.push({
          check: `Key (${spec.label})`,
          status: "PASS",
          detail: `${spec.id} (FullAccess)`,
        });
      } else {
        const fc = accessKey.permission.FunctionCall;
        const allowance = fc.allowance ? BigInt(fc.allowance) : null;
        const receiverOk = fc.receiver_id === contractId;
        const allowanceOk = allowance === null || allowance >= minAllowanceYocto;
        const allowanceNear = allowance !== null ? utils.format.formatNearAmount(allowance.toString(), 4) : "unlimited";
        rows.push({
          check: `Key (${spec.label})`,
          status: receiverOk && allowanceOk ? "PASS" : "FAIL",
          detail: `${spec.id} -> ${fc.receiver_id} [${fc.method_names.join(",")}] allowance=${allowanceNear} NEAR`,
        });
      }
    } catch (err) {
      rows.push({
        check: `Key (${spec.label})`,
        status: "FAIL",
        detail: `${spec.id}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 7. LLM keys (live mode only)
  if (!liveLlm) {
    rows.push({
      check: "LLM keys",
      status: "SKIP",
      detail: "SWARM_MODE=replay (pass --live to test 1-token completions)",
    });
  } else {
    const primaryUrl = (process.env.NEAR_AI_BASE_URL || process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const primaryKey = process.env.NEAR_AI_API_KEY || process.env.GROQ_API_KEY || "";
    const factModel = process.env.FACT_MODEL_ID || "openai/gpt-oss-120b";
    if (!primaryKey) {
      rows.push({ check: "LLM (primary)", status: "FAIL", detail: "NEAR_AI_API_KEY / GROQ_API_KEY is empty" });
    } else {
      try {
        const res = await fetch(`${primaryUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${primaryKey}` },
          body: JSON.stringify({
            model: factModel,
            max_tokens: 4,
            messages: [{ role: "user", content: "Reply with ok." }],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        rows.push({
          check: "LLM (primary)",
          status: res.ok ? "PASS" : "FAIL",
          detail: `${primaryUrl} (${factModel}) -> HTTP ${res.status}`,
        });
      } catch (err) {
        rows.push({
          check: "LLM (primary)",
          status: "FAIL",
          detail: `${primaryUrl}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  // 8. Evidence store write -> read hash check
  const evidenceDir = process.env.AGENT_EVIDENCE_DIR || path.resolve(ROOT_DIR, "storage/evidence");
  const probe = { kind: "preflight_probe", ts: new Date().toISOString() };
  const probeHash = sha256Hex(canonicalJson(probe));
  const probePath = path.join(evidenceDir, `${probeHash}.json`);
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(probePath, canonicalJson(probe), "utf8");
    const readBack = JSON.parse(fs.readFileSync(probePath, "utf8"));
    const readHash = sha256Hex(canonicalJson(readBack));
    fs.unlinkSync(probePath);
    rows.push({
      check: "Evidence store",
      status: readHash === probeHash ? "PASS" : "FAIL",
      detail: `${evidenceDir} (sha256 round-trip ok)`,
    });
  } catch (err) {
    rows.push({
      check: "Evidence store",
      status: "FAIL",
      detail: `${evidenceDir}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  console.log(`\nLifeLine Preflight (${networkId} / ${contractId})\n`);
  for (const r of rows) {
    console.log(`  [${badge(r.status)}] ${r.check.padEnd(26)} ${r.detail}`);
  }
  const failed = rows.filter((r) => r.status === "FAIL").length;
  console.log(`\nSummary: ${rows.filter((r) => r.status === "PASS").length} passed, ${rows.filter((r) => r.status === "SKIP").length} skipped, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Preflight error:", err);
  process.exit(1);
});
