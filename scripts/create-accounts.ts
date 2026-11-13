import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Resolve dependencies installed under @lifeline/agents even when invoked from repo root.
const requireFromAgents = createRequire(path.join(ROOT_DIR, "agents", "package.json"));
const dotenv = requireFromAgents("dotenv") as typeof import("../agents/node_modules/dotenv/lib/main.js");
const nearApi = requireFromAgents("near-api-js") as typeof import("../agents/node_modules/near-api-js");

const { connect, KeyPair, keyStores, utils } = nearApi;

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

interface AccountSpec {
  key: string;
  accountId: string;
  role: string;
  envIdKey: string;
  envPrivKey: string;
  accessKeyType: "FullAccess" | "FunctionCall";
  receiverId: string;
  methodNames: string[];
  allowanceNear: string;
  initialBalanceNear: string;
}

function parseFlags(argv: string[]) {
  return {
    offline: argv.includes("--offline"),
    writeEnv: argv.includes("--write-env"),
    lockDown: argv.includes("--lock-down"),
  };
}

function buildSpecs(contractId: string, ftContractId: string): AccountSpec[] {
  const specs: AccountSpec[] = [
    {
      key: "lifeline",
      accountId: contractId,
      role: "LifeLine relief pool & escrow contract",
      envIdKey: "CONTRACT_ID",
      envPrivKey: "NEAR_OWNER_PRIVATE_KEY",
      accessKeyType: "FullAccess",
      receiverId: contractId,
      methodNames: ["*"],
      allowanceNear: "unlimited",
      initialBalanceNear: "5",
    },
    {
      key: "mock-ft",
      accountId: ftContractId,
      role: "Mock USDC (NEP-141 + testnet faucet) contract",
      envIdKey: "NEXT_PUBLIC_POOL_TOKEN_ID",
      envPrivKey: "FT_OWNER_PRIVATE_KEY",
      accessKeyType: "FullAccess",
      receiverId: ftContractId,
      methodNames: ["*"],
      allowanceNear: "unlimited",
      initialBalanceNear: "2.6",
    },
    {
      key: "intake",
      accountId: process.env.INTAKE_ACCOUNT_ID || `intake.${contractId}`,
      role: "Intake oracle (submits clustered cases & closes bidding)",
      envIdKey: "INTAKE_ACCOUNT_ID",
      envPrivKey: "INTAKE_PRIVATE_KEY",
      accessKeyType: "FunctionCall",
      receiverId: contractId,
      methodNames: ["submit_case", "close_bidding"],
      allowanceNear: "0.25",
      initialBalanceNear: "0.2",
    },
    {
      key: "v-geo",
      accountId: process.env.V_GEO_ACCOUNT_ID || `v-geo.${contractId}`,
      role: "Verifier: Geo consistency (deterministic code)",
      envIdKey: "V_GEO_ACCOUNT_ID",
      envPrivKey: "V_GEO_PRIVATE_KEY",
      accessKeyType: "FunctionCall",
      receiverId: contractId,
      methodNames: ["vote", "vote_delivery"],
      allowanceNear: "0.25",
      initialBalanceNear: "0.2",
    },
    {
      key: "v-fact",
      accountId: process.env.V_FACT_ACCOUNT_ID || `v-fact.${contractId}`,
      role: "Verifier: External evidence & fact check",
      envIdKey: "V_FACT_ACCOUNT_ID",
      envPrivKey: "V_FACT_PRIVATE_KEY",
      accessKeyType: "FunctionCall",
      receiverId: contractId,
      methodNames: ["vote", "vote_delivery"],
      allowanceNear: "0.25",
      initialBalanceNear: "0.2",
    },
    {
      key: "v-sev",
      accountId: process.env.V_SEV_ACCOUNT_ID || `v-sev.${contractId}`,
      role: "Verifier: Severity tier classifier",
      envIdKey: "V_SEV_ACCOUNT_ID",
      envPrivKey: "V_SEV_PRIVATE_KEY",
      accessKeyType: "FunctionCall",
      receiverId: contractId,
      methodNames: ["vote", "vote_delivery"],
      allowanceNear: "0.25",
      initialBalanceNear: "0.2",
    },
    {
      key: "v-red",
      accountId: process.env.V_RED_ACCOUNT_ID || `v-red.${contractId}`,
      role: "Verifier: Adversarial red team & injection guard",
      envIdKey: "V_RED_ACCOUNT_ID",
      envPrivKey: "V_RED_PRIVATE_KEY",
      accessKeyType: "FunctionCall",
      receiverId: contractId,
      methodNames: ["vote", "vote_delivery"],
      allowanceNear: "0.25",
      initialBalanceNear: "0.2",
    },
    {
      key: "ngo-1",
      accountId: process.env.NGO_1_ACCOUNT_ID || `ngo-rapid.${contractId}`,
      role: "Responder NGO #1 (stake, place_bid, submit_proof)",
      envIdKey: "NGO_1_ACCOUNT_ID",
      envPrivKey: "NGO_1_PRIVATE_KEY",
      accessKeyType: "FullAccess",
      receiverId: "any (stake requires 0.1 NEAR attached deposit)",
      methodNames: ["register_ngo", "place_bid", "submit_proof"],
      allowanceNear: "unlimited",
      initialBalanceNear: "0.3",
    },
    {
      key: "ngo-2",
      accountId: process.env.NGO_2_ACCOUNT_ID || `ngo-balanced.${contractId}`,
      role: "Responder NGO #2 (stake, place_bid, submit_proof)",
      envIdKey: "NGO_2_ACCOUNT_ID",
      envPrivKey: "NGO_2_PRIVATE_KEY",
      accessKeyType: "FullAccess",
      receiverId: "any (stake requires 0.1 NEAR attached deposit)",
      methodNames: ["register_ngo", "place_bid", "submit_proof"],
      allowanceNear: "unlimited",
      initialBalanceNear: "0.3",
    },
    {
      key: "ngo-3",
      accountId: process.env.NGO_3_ACCOUNT_ID || `ngo-frugal.${contractId}`,
      role: "Responder NGO #3 (stake, place_bid, submit_proof)",
      envIdKey: "NGO_3_ACCOUNT_ID",
      envPrivKey: "NGO_3_PRIVATE_KEY",
      accessKeyType: "FullAccess",
      receiverId: "any (stake requires 0.1 NEAR attached deposit)",
      methodNames: ["register_ngo", "place_bid", "submit_proof"],
      allowanceNear: "unlimited",
      initialBalanceNear: "0.3",
    },
    {
      key: "coordinator",
      accountId: process.env.COORDINATOR_ACCOUNT_ID || `coord.${contractId}`,
      role: "Human tie-break coordinator (human_confirm / human_reject)",
      envIdKey: "COORDINATOR_ACCOUNT_ID",
      envPrivKey: "COORDINATOR_PRIVATE_KEY",
      accessKeyType: "FullAccess",
      receiverId: contractId,
      methodNames: ["human_confirm", "human_reject"],
      allowanceNear: "unlimited",
      initialBalanceNear: "0.2",
    },
  ];
  return specs;
}

function getOrGenerateKeyPair(envKey: string): ReturnType<typeof KeyPair.fromRandom> {
  const existing = process.env[envKey]?.trim();
  if (existing && existing.startsWith("ed25519:")) {
    return KeyPair.fromString(existing as `ed25519:${string}`);
  }
  return KeyPair.fromRandom("ed25519");
}

function updateEnvFile(updates: Record<string, string>): void {
  const envPath = path.join(ROOT_DIR, ".env");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const [k, v] of Object.entries(updates)) {
    const line = `${k}=${v}`;
    const regex = new RegExp(`^${k}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      if (content.length > 0 && !content.endsWith("\n")) content += "\n";
      content += `${line}\n`;
    }
  }
  fs.writeFileSync(envPath, content, { mode: 0o600 });
}

interface GeneratedEntry {
  spec: AccountSpec;
  publicKey: string;
  privateKey: string;
  status: string;
}

function renderAccountsMarkdown(
  entries: GeneratedEntry[],
  contractId: string,
  ftContractId: string,
  network: string,
  modeLabel: string,
): string {
  const rows = entries
    .map(({ spec, publicKey, status }) => {
      const methods = spec.methodNames.map((m) => `\`${m}\``).join(", ");
      const allowance = spec.allowanceNear === "unlimited" ? "FullAccess" : `${spec.allowanceNear} NEAR`;
      return `| \`${spec.accountId}\` | ${spec.role} | \`${spec.accessKeyType}\` | ${methods} | ${allowance} | \`${publicKey}\` | ${status} |`;
    })
    .join("\n");

  return `# NEAR Accounts & Restricted Access Keys

> Generated by \`scripts/create-accounts.ts\` (${modeLabel}).  
> **Security notice:** Only **public keys** are documented here. Private keys are stored exclusively in your local gitignored \`.env\` file and must **never** be committed to git.

## Network & Contracts

| Component | Account ID |
|---|---|
| Network | \`${network}\` |
| Relief Contract (\`CONTRACT_ID\`) | \`${contractId}\` |
| Pool Token (\`NEXT_PUBLIC_POOL_TOKEN_ID\`) | \`${ftContractId}\` |

## Account & Key Inventory

| Account ID | Role | Key Type | Allowed Methods | Allowance | Public Key | Provisioning Status |
|---|---|---|---|---|---|---|
${rows}

## Principle of Least Privilege

1. **Verifier accounts (\`v-geo\`, \`v-fact\`, \`v-sev\`, \`v-red\`)** hold **FunctionCall-only** access keys pinned to \`${contractId}\` and restricted strictly to \`vote\` and \`vote_delivery\` with a \`0.25 NEAR\` gas allowance. Because NEAR FunctionCall access keys cannot attach NEAR deposits and cannot call any other method, a leaked verifier key **cannot** drain the pool, register NGOs, override config, or confirm split votes.
2. **Intake oracle (\`intake\`)** holds a **FunctionCall-only** access key restricted strictly to \`submit_case\` and \`close_bidding\` with a \`0.25 NEAR\` gas allowance.
3. **NGO accounts (\`ngo-rapid\`, \`ngo-balanced\`, \`ngo-frugal\`)** hold FullAccess keys on their own isolated sub-accounts so they can attach the required \`1 NEAR\` anti-spam registration bond when calling \`register_ngo\`.

## Regenerating / Provisioning on Testnet

\`\`\`bash
# Offline keygen + docs/ACCOUNTS.md generation (writes private keys only when --write-env is passed):
pnpm --filter @lifeline/agents exec tsx ../scripts/create-accounts.ts --offline --write-env

# Provision accounts and restricted FunctionCall keys on NEAR testnet:
pnpm --filter @lifeline/agents exec tsx ../scripts/create-accounts.ts --lock-down
\`\`\`
`;
}

async function provisionOnTestnet(
  entries: GeneratedEntry[],
  ownerAccountId: string,
  ownerPrivateKey: string,
  rpcUrl: string,
  networkId: string,
  lockDown: boolean,
): Promise<void> {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(
    networkId,
    ownerAccountId,
    KeyPair.fromString(ownerPrivateKey as `ed25519:${string}`),
  );

  const near = await connect({
    networkId,
    nodeUrl: rpcUrl,
    keyStore,
  } as Parameters<typeof connect>[0]);
  const ownerAccount = await near.account(ownerAccountId);

  for (const entry of entries) {
    const { spec, publicKey, privateKey } = entry;
    if (spec.accountId === ownerAccountId) {
      entry.status = "Owner account (existing)";
      continue;
    }

    const exists = await near.connection.provider
      .query({ request_type: "view_account", finality: "final", account_id: spec.accountId })
      .then(() => true)
      .catch(() => false);

    // Sub-account creation requires calling createAccount from its immediate parent account.
    const parentId = spec.accountId.slice(spec.accountId.indexOf(".") + 1);
    let parentAccount = ownerAccount;
    if (parentId !== ownerAccountId) {
      const parentPriv = entries.find((e) => e.spec.accountId === parentId)?.privateKey;
      if (!parentPriv) {
        entry.status = `Skipped (missing parent key for ${parentId})`;
        continue;
      }
      await keyStore.setKey(networkId, parentId, KeyPair.fromString(parentPriv as `ed25519:${string}`));
      parentAccount = await near.account(parentId);
    }

    const tempFullKey = spec.accessKeyType === "FunctionCall" ? KeyPair.fromRandom("ed25519") : KeyPair.fromString(privateKey as `ed25519:${string}`);

    if (!exists) {
      const yocto = utils.format.parseNearAmount(spec.initialBalanceNear)!;
      await parentAccount.createAccount(spec.accountId, tempFullKey.getPublicKey(), BigInt(yocto));
    }

    if (spec.accessKeyType === "FunctionCall") {
      if (exists) {
        const keyExists = await near.connection.provider
          .query({
            request_type: "view_access_key",
            finality: "final",
            account_id: spec.accountId,
            public_key: publicKey,
          })
          .then(() => true)
          .catch(() => false);
        if (keyExists) {
          entry.status = "Existing on testnet (restricted FunctionCall key)";
          continue;
        }
      }
      const subKeyToSign = exists ? privateKey : tempFullKey.toString();
      await keyStore.setKey(networkId, spec.accountId, KeyPair.fromString(subKeyToSign as `ed25519:${string}`));
      const subAccount = await near.account(spec.accountId);
      const allowance = BigInt(utils.format.parseNearAmount(spec.allowanceNear)!);
      await subAccount.addKey(publicKey, spec.receiverId, spec.methodNames, allowance);

      if (!exists && lockDown) {
        await subAccount.deleteKey(tempFullKey.getPublicKey());
      }
      entry.status = exists ? "Updated FunctionCall key on testnet" : "Created with restricted FunctionCall key";
    } else {
      entry.status = exists ? "Existing on testnet" : "Created on testnet";
    }
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const network = process.env.NEAR_NETWORK || "testnet";
  const rpcUrl = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
  const contractId = process.env.CONTRACT_ID || process.env.NEXT_PUBLIC_CONTRACT_ID || "lifeline-demo.testnet";
  const ftContractId = process.env.NEXT_PUBLIC_POOL_TOKEN_ID || `usdc.${contractId}`;
  const ownerAccountId = process.env.NEAR_OWNER_ACCOUNT_ID || contractId;
  const ownerPrivateKey = process.env.NEAR_OWNER_PRIVATE_KEY?.trim();

  const specs = buildSpecs(contractId, ftContractId);
  const entries: GeneratedEntry[] = specs.map((spec) => {
    const kp = getOrGenerateKeyPair(spec.envPrivKey);
    return {
      spec,
      publicKey: kp.getPublicKey().toString(),
      privateKey: kp.toString(),
      status: flags.offline ? "Keypair prepared (offline)" : "Pending",
    };
  });

  let modeLabel = "offline dry-run";
  if (!flags.offline && ownerPrivateKey) {
    modeLabel = `live ${network}`;
    await provisionOnTestnet(entries, ownerAccountId, ownerPrivateKey, rpcUrl, network, flags.lockDown);
  } else if (!flags.offline && !ownerPrivateKey) {
    modeLabel = "offline dry-run (NEAR_OWNER_PRIVATE_KEY not set)";
    for (const e of entries) e.status = "Keypair prepared (missing NEAR_OWNER_PRIVATE_KEY)";
  }

  if (flags.writeEnv) {
    const envUpdates: Record<string, string> = {
      CONTRACT_ID: contractId,
      NEXT_PUBLIC_CONTRACT_ID: contractId,
      NEXT_PUBLIC_POOL_TOKEN_ID: ftContractId,
    };
    for (const e of entries) {
      envUpdates[e.spec.envIdKey] = e.spec.accountId;
      envUpdates[e.spec.envPrivKey] = e.privateKey;
    }
    updateEnvFile(envUpdates);
    console.log("Updated .env with account IDs and private keys (kept out of git).");
  }

  const docsPath = path.join(ROOT_DIR, "docs", "ACCOUNTS.md");
  const markdown = renderAccountsMarkdown(entries, contractId, ftContractId, network, modeLabel);
  fs.writeFileSync(docsPath, markdown, "utf8");
  console.log(`Wrote public account inventory (${entries.length} accounts, zero private keys) to docs/ACCOUNTS.md.`);
}

main().catch((err) => {
  console.error("Failed to create accounts:", err);
  process.exit(1);
});
