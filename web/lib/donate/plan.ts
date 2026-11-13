import { ftBalanceOf, ftMetadata, storageBalanceBounds, storageBalanceOf } from "../near/ft";
import { RpcError, type RpcOptions, viewAccount, viewFunction } from "../near/rpc";
import { AmountError, formatUnits, parseUnits, TGAS, YOCTO_PER_NEAR } from "../near/units";

// Same shape as NEAR Connect's ConnectorAction, kept local so this file has no wallet dependency.
export interface FunctionCallAction {
  type: "FunctionCall";
  params: { methodName: string; args: object; gas: string; deposit: string };
}
export interface PlannedTransaction {
  receiverId: string;
  actions: FunctionCallAction[];
}

export type Network = "mainnet" | "testnet";

export interface DonateSetup {
  rpc: RpcOptions;
  network: Network;
  relief: string;
  token: string;
  msg: string;
  gasTgas: number;
}

export interface TokenInfo {
  id: string;
  symbol: string;
  decimals: number;
}

export interface DonorState {
  accountId: string;
  exists: boolean;
  nearAvailable: bigint;
  tokenBalance: bigint;
  registeredOnToken: boolean;
}

export type BlockerCode =
  | "setup"
  | "network_mismatch"
  | "no_account"
  | "low_near"
  | "amount"
  | "insufficient_tokens";

export interface Blocker {
  code: BlockerCode;
  message: string;
}

const STORAGE_COST_PER_BYTE = BigInt(10) ** BigInt(19);
// ft_transfer_call at 150 TGas costs about 0.015 NEAR at the minimum gas price; keep headroom.
export const MIN_NEAR_FOR_GAS = YOCTO_PER_NEAR / BigInt(50);

export function accountNetwork(accountId: string): Network | "any" {
  if (accountId.endsWith(".near")) return "mainnet";
  if (accountId.endsWith(".testnet")) return "testnet";
  return "any";
}

export async function loadToken(setup: DonateSetup): Promise<TokenInfo> {
  const meta = await ftMetadata(setup.rpc, setup.token);
  return { id: setup.token, symbol: meta.symbol, decimals: meta.decimals };
}

// Problems with the deployment itself. Any of these would make every donation fail or bounce.
export async function checkSetup(setup: DonateSetup): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
  if (!setup.relief || !setup.token) {
    return [{ code: "setup", message: "The relief contract or pool token isn't configured on this site." }];
  }
  if (!(await viewAccount(setup.rpc, setup.relief))) {
    return [{ code: "setup", message: `The relief contract account ${setup.relief} doesn't exist on ${setup.network} yet, so donations are paused.` }];
  }
  const registered = await storageBalanceOf(setup.rpc, setup.token, setup.relief);
  if (!registered) {
    blockers.push({
      code: "setup",
      message: `The relief contract isn't registered with the token ${setup.token}, so the token would refuse the transfer. This is a deployment problem, not something you can fix.`,
    });
  }
  try {
    const cfg = await viewFunction<{ pool_token?: string } | null>(setup.rpc, setup.relief, "get_config");
    if (cfg?.pool_token && cfg.pool_token !== setup.token) {
      blockers.push({
        code: "setup",
        message: `The relief contract only accepts ${cfg.pool_token}, but this site is set up for ${setup.token}. The donation would be refunded.`,
      });
    }
  } catch (err) {
    if (err instanceof RpcError && err.kind === "no_contract") {
      blockers.push({ code: "setup", message: `${setup.relief} exists but has no contract deployed yet, so donations are paused.` });
    } else if (!(err instanceof RpcError) || err.kind !== "contract") {
      throw err;
    }
  }
  return blockers;
}

export async function loadDonor(setup: DonateSetup, accountId: string): Promise<DonorState> {
  const account = await viewAccount(setup.rpc, accountId);
  if (!account) return { accountId, exists: false, nearAvailable: BigInt(0), tokenBalance: BigInt(0), registeredOnToken: false };
  const [balance, storage] = await Promise.all([
    ftBalanceOf(setup.rpc, setup.token, accountId),
    storageBalanceOf(setup.rpc, setup.token, accountId),
  ]);
  const reservedForStorage = BigInt(account.storage_usage) * STORAGE_COST_PER_BYTE;
  const free = BigInt(account.amount) - reservedForStorage;
  return {
    accountId,
    exists: true,
    nearAvailable: free > BigInt(0) ? free : BigInt(0),
    tokenBalance: balance,
    registeredOnToken: storage !== null,
  };
}

export function evaluateDonation(input: {
  setup: DonateSetup;
  token: TokenInfo;
  donor: DonorState;
  amountText: string;
}): { amount: bigint | null; blockers: Blocker[] } {
  const { setup, token, donor } = input;
  const blockers: Blocker[] = [];

  const net = accountNetwork(donor.accountId);
  if (net !== "any" && net !== setup.network) {
    blockers.push({
      code: "network_mismatch",
      message: `${donor.accountId} is a ${net} account, but this site runs on ${setup.network}. Switch accounts in your wallet.`,
    });
  }
  if (!donor.exists) {
    blockers.push({ code: "no_account", message: `${donor.accountId} doesn't exist on ${setup.network} yet. Fund it with some NEAR first.` });
  } else if (donor.nearAvailable < MIN_NEAR_FOR_GAS) {
    blockers.push({
      code: "low_near",
      message: `You need at least ${formatUnits(MIN_NEAR_FOR_GAS, 24)} NEAR to pay the network fee. You have ${formatUnits(donor.nearAvailable, 24, 4)}.`,
    });
  }

  let amount: bigint | null = null;
  try {
    amount = parseUnits(input.amountText, token.decimals);
  } catch (err) {
    if (!(err instanceof AmountError)) throw err;
    blockers.push({ code: "amount", message: err.message });
  }
  if (amount !== null && amount > donor.tokenBalance) {
    blockers.push({
      code: "insufficient_tokens",
      message: `You have ${formatUnits(donor.tokenBalance, token.decimals)} ${token.symbol}, which is less than ${formatUnits(amount, token.decimals)}.`,
    });
  }
  return { amount, blockers };
}

export function buildDonateTransaction(setup: DonateSetup, amount: bigint): PlannedTransaction {
  return {
    receiverId: setup.token,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "ft_transfer_call",
          args: { receiver_id: setup.relief, amount: amount.toString(), msg: setup.msg },
          gas: (BigInt(setup.gasTgas) * TGAS).toString(),
          // NEP-141 requires exactly one yoctoNEAR so the call needs a full access key confirmation.
          deposit: "1",
        },
      },
    ],
  };
}

// Testnet only: register the donor on the test token if needed, then mint. One transaction, two actions.
export async function buildFaucetTransaction(setup: DonateSetup, donor: DonorState, amount: bigint): Promise<PlannedTransaction> {
  const actions: FunctionCallAction[] = [];
  if (!donor.registeredOnToken) {
    const bounds = await storageBalanceBounds(setup.rpc, setup.token);
    actions.push({
      type: "FunctionCall",
      params: {
        methodName: "storage_deposit",
        args: { account_id: donor.accountId, registration_only: true },
        gas: (BigInt(30) * TGAS).toString(),
        deposit: bounds.min,
      },
    });
  }
  actions.push({
    type: "FunctionCall",
    params: {
      methodName: "mint",
      args: { to: donor.accountId, amount: amount.toString() },
      gas: (BigInt(30) * TGAS).toString(),
      deposit: "0",
    },
  });
  return { receiverId: setup.token, actions };
}
