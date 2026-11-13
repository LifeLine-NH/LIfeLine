import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const requireFromAgents = createRequire(path.join(ROOT_DIR, "agents", "package.json"));
const dotenv = requireFromAgents("dotenv") as typeof import("../agents/node_modules/dotenv/lib/main.js");
const nearApi = requireFromAgents("near-api-js") as typeof import("../agents/node_modules/near-api-js");

const { connect, KeyPair, keyStores, utils } = nearApi;

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const GAS_30 = BigInt("30000000000000");
const GAS_100 = BigInt("100000000000000");
const ONE_YOCTO = BigInt("1");
const STORAGE_DEPOSIT = BigInt(utils.format.parseNearAmount("0.0125")!);
const NGO_STAKE = BigInt(utils.format.parseNearAmount("1")!);

function requireEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}. Run scripts/create-accounts.ts first or populate .env.`);
  }
  return val;
}

async function tryView<T>(account: Awaited<ReturnType<Awaited<ReturnType<typeof connect>>["account"]>>, contractId: string, methodName: string, args: Record<string, unknown> = {}): Promise<T | null> {
  try {
    return (await account.viewFunction({ contractId, methodName, args })) as T;
  } catch {
    return null;
  }
}

async function main() {
  const networkId = process.env.NEAR_NETWORK || "testnet";
  const nodeUrl = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
  const contractId = process.env.CONTRACT_ID || process.env.NEXT_PUBLIC_CONTRACT_ID || "lifeline-demo.testnet";
  const ftContractId = process.env.NEXT_PUBLIC_POOL_TOKEN_ID || `usdc.${contractId}`;
  const ownerId = process.env.NEAR_OWNER_ACCOUNT_ID || contractId;

  const ownerPriv = requireEnv("NEAR_OWNER_PRIVATE_KEY");
  const ftPriv = process.env.FT_OWNER_PRIVATE_KEY?.trim() || ownerPriv;

  const mockFtWasmPath = path.join(ROOT_DIR, "contracts", "res", "mock_ft.wasm");
  const lifelineWasmPath = path.join(ROOT_DIR, "contracts", "res", "lifeline.wasm");
  if (!fs.existsSync(mockFtWasmPath) || !fs.existsSync(lifelineWasmPath)) {
    throw new Error("Missing compiled WASM artifacts in contracts/res/. Run `pnpm build:contracts` first.");
  }

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(networkId, ownerId, KeyPair.fromString(ownerPriv as `ed25519:${string}`));
  await keyStore.setKey(networkId, contractId, KeyPair.fromString(ownerPriv as `ed25519:${string}`));
  await keyStore.setKey(networkId, ftContractId, KeyPair.fromString(ftPriv as `ed25519:${string}`));

  const ngoConfigs = [
    {
      id: process.env.NGO_1_ACCOUNT_ID || `ngo-rapid.${contractId}`,
      priv: process.env.NGO_1_PRIVATE_KEY?.trim(),
      profileHash: "11".repeat(32),
    },
    {
      id: process.env.NGO_2_ACCOUNT_ID || `ngo-balanced.${contractId}`,
      priv: process.env.NGO_2_PRIVATE_KEY?.trim(),
      profileHash: "22".repeat(32),
    },
    {
      id: process.env.NGO_3_ACCOUNT_ID || `ngo-frugal.${contractId}`,
      priv: process.env.NGO_3_PRIVATE_KEY?.trim(),
      profileHash: "33".repeat(32),
    },
  ];

  for (const ngo of ngoConfigs) {
    if (ngo.priv) {
      await keyStore.setKey(networkId, ngo.id, KeyPair.fromString(ngo.priv as `ed25519:${string}`));
    }
  }

  const near = await connect({
    networkId,
    nodeUrl,
    keyStore,
  } as Parameters<typeof connect>[0]);
  const ownerAccount = await near.account(ownerId);
  const contractAccount = await near.account(contractId);
  const ftAccount = await near.account(ftContractId);

  console.log(`[deploy-testnet] Deploying mock-ft to ${ftContractId}...`);
  await ftAccount.deployContract(fs.readFileSync(mockFtWasmPath));

  const ftMeta = await tryView(ownerAccount, ftContractId, "ft_metadata");
  if (!ftMeta) {
    console.log("[deploy-testnet] Initializing mock-ft (1,000,000 USDC supply)...");
    await ftAccount.functionCall({
      contractId: ftContractId,
      methodName: "new",
      args: {
        owner_id: ownerId,
        total_supply: "1000000000000", // 1,000,000 USDC (6 decimals)
      },
      gas: GAS_30,
    });
  } else {
    console.log("[deploy-testnet] mock-ft already initialized.");
  }

  console.log(`[deploy-testnet] Deploying lifeline to ${contractId}...`);
  await contractAccount.deployContract(fs.readFileSync(lifelineWasmPath));

  const existingCfg = await tryView(ownerAccount, contractId, "get_config");
  if (!existingCfg) {
    console.log("[deploy-testnet] Initializing lifeline contract...");
    await contractAccount.functionCall({
      contractId,
      methodName: "new",
      args: {
        owner: ownerId,
        pool_token: ftContractId,
      },
      gas: GAS_30,
    });
  } else {
    console.log("[deploy-testnet] lifeline already initialized.");
  }

  // Register token storage for relief contract, owner, and NGOs
  const storageTargets = [contractId, ownerId, ...ngoConfigs.map((n) => n.id)];
  for (const accountId of storageTargets) {
    const bal = await tryView<{ total: string } | null>(ownerAccount, ftContractId, "storage_balance_of", {
      account_id: accountId,
    });
    if (!bal) {
      console.log(`[deploy-testnet] Registering mock-ft storage for ${accountId}...`);
      await ownerAccount.functionCall({
        contractId: ftContractId,
        methodName: "storage_deposit",
        args: { account_id: accountId },
        gas: GAS_30,
        attachedDeposit: STORAGE_DEPOSIT,
      });
    }
  }

  // Register intake, coordinator, and 4 verifier roles
  const intakeId = process.env.INTAKE_ACCOUNT_ID || `intake.${contractId}`;
  const coordinatorId = process.env.COORDINATOR_ACCOUNT_ID || `coord.${contractId}`;
  const verifiers: Array<{ id: string; role: "geo" | "fact" | "sev" | "red" }> = [
    { id: process.env.V_GEO_ACCOUNT_ID || `v-geo.${contractId}`, role: "geo" },
    { id: process.env.V_FACT_ACCOUNT_ID || `v-fact.${contractId}`, role: "fact" },
    { id: process.env.V_SEV_ACCOUNT_ID || `v-sev.${contractId}`, role: "sev" },
    { id: process.env.V_RED_ACCOUNT_ID || `v-red.${contractId}`, role: "red" },
  ];

  console.log("[deploy-testnet] Registering intake, coordinator, and 4 verifiers...");
  await ownerAccount.functionCall({
    contractId,
    methodName: "register_intake",
    args: { account_id: intakeId },
    gas: GAS_30,
  });
  await ownerAccount.functionCall({
    contractId,
    methodName: "register_coordinator",
    args: { account_id: coordinatorId },
    gas: GAS_30,
  });
  for (const v of verifiers) {
    await ownerAccount.functionCall({
      contractId,
      methodName: "register_verifier",
      args: { account_id: v.id, role: v.role },
      gas: GAS_30,
    });
  }

  // Register NGOs on lifeline if their keys exist
  for (const ngo of ngoConfigs) {
    if (!ngo.priv) {
      console.log(`[deploy-testnet] Skipping register_ngo for ${ngo.id} (private key not in .env).`);
      continue;
    }
    const existingNgo = await tryView(ownerAccount, contractId, "get_ngo", { account_id: ngo.id });
    if (!existingNgo) {
      console.log(`[deploy-testnet] Registering NGO ${ngo.id} with 1 NEAR stake...`);
      const ngoAcct = await near.account(ngo.id);
      await ngoAcct.functionCall({
        contractId,
        methodName: "register_ngo",
        args: { profile_hash: ngo.profileHash },
        gas: GAS_30,
        attachedDeposit: NGO_STAKE,
      });
    }
  }

  // Seed pool if currently empty
  const pool = await tryView<{ balance: string }>(ownerAccount, contractId, "get_pool");
  if (!pool || BigInt(pool.balance) === BigInt(0)) {
    const seedAmount = process.env.SEED_POOL_AMOUNT || "100000000000"; // 100,000 USDC
    console.log(`[deploy-testnet] Seeding relief pool with ${seedAmount} base units...`);
    await ownerAccount.functionCall({
      contractId: ftContractId,
      methodName: "ft_transfer_call",
      args: {
        receiver_id: contractId,
        amount: seedAmount,
        msg: "Initial LifeLine relief pool seed",
      },
      gas: GAS_100,
      attachedDeposit: ONE_YOCTO,
    });
  } else {
    console.log(`[deploy-testnet] Pool already funded with ${pool.balance} base units.`);
  }

  console.log(`[deploy-testnet] Done. Explorer: https://testnet.nearblocks.io/address/${contractId}`);
}

main().catch((err) => {
  console.error("[deploy-testnet] Deployment failed:", err);
  process.exit(1);
});
