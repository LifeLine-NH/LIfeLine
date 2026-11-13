import { describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "../near/rpc";
import { YOCTO_PER_NEAR } from "../near/units";
import {
  buildDonateTransaction,
  buildFaucetTransaction,
  checkSetup,
  type DonateSetup,
  type DonorState,
  evaluateDonation,
  loadDonor,
  loadToken,
  type TokenInfo,
} from "./plan";

type Handler = (args: Record<string, unknown>) => unknown;

// A stand-in NEAR RPC node: answers view calls and view_account the way the real node shapes them.
type FakeAccount = { amount: string; storage_usage: number; noCode?: boolean };

function fakeRpc(views: Record<string, Handler>, accounts: Record<string, FakeAccount>) {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const { params } = JSON.parse(String(init.body));
    let result: unknown;
    let error: unknown;
    if (params.request_type === "view_account") {
      const acc = accounts[params.account_id];
      if (acc) result = { amount: acc.amount, storage_usage: acc.storage_usage, locked: "0" };
      else error = { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: {} } };
    } else {
      const key = `${params.account_id}.${params.method_name}`;
      const handler = views[key];
      if (accounts[params.account_id]?.noCode) {
        result = { result: [], logs: [], error: `wasm execution failed with error: CompilationError(CodeDoesNotExist { account_id: "${params.account_id}" })` };
      } else if (!handler) result = { result: [], logs: [], error: `wasm execution failed: MethodNotFound (${key})` };
      else {
        const value = handler(JSON.parse(fromBase64(params.args_base64)));
        result = { result: Array.from(new TextEncoder().encode(JSON.stringify(value))), logs: [] };
      }
    }
    return new Response(JSON.stringify(error ? { jsonrpc: "2.0", id: 1, error } : { jsonrpc: "2.0", id: 1, result }));
  }) as unknown as typeof fetch;
  return { url: "http://fake-rpc", fetchImpl, retries: 0 };
}

const TOKEN = "usdc.lifeline.testnet";
const RELIEF = "relief.lifeline.testnet";
const near = (n: number) => (YOCTO_PER_NEAR * BigInt(Math.round(n * 1000))) / BigInt(1000);

const reliefAccount = { [RELIEF]: { amount: near(5).toString(), storage_usage: 300_000 } };

function setupWith(views: Record<string, Handler>, accounts: Record<string, FakeAccount> = reliefAccount): DonateSetup {
  return { rpc: fakeRpc(views, accounts), network: "testnet", relief: RELIEF, token: TOKEN, msg: "", gasTgas: 150 };
}

const tokenViews: Record<string, Handler> = {
  [`${TOKEN}.ft_metadata`]: () => ({ spec: "ft-1.0.0", name: "Test USDC", symbol: "tUSDC", decimals: 6 }),
  [`${TOKEN}.storage_balance_of`]: (a) => (a.account_id === RELIEF || a.account_id === "amina.testnet" ? { total: "1250000000000000000000", available: "0" } : null),
  [`${TOKEN}.ft_balance_of`]: (a) => (a.account_id === "amina.testnet" ? "75000000" : "0"),
  [`${TOKEN}.storage_balance_bounds`]: () => ({ min: "1250000000000000000000", max: "1250000000000000000000" }),
};

const token: TokenInfo = { id: TOKEN, symbol: "tUSDC", decimals: 6 };
const donor = (over: Partial<DonorState> = {}): DonorState => ({
  accountId: "amina.testnet",
  exists: true,
  nearAvailable: near(5),
  tokenBalance: BigInt(75_000_000),
  registeredOnToken: true,
  ...over,
});

describe("loadToken and loadDonor", () => {
  it("reads symbol and decimals from the token, not from site config", async () => {
    expect(await loadToken(setupWith(tokenViews))).toEqual(token);
  });

  it("subtracts storage staking from the NEAR available for gas", async () => {
    const setup = setupWith(tokenViews, { ...reliefAccount, "amina.testnet": { amount: near(1).toString(), storage_usage: 10_000 } });
    const state = await loadDonor(setup, "amina.testnet");
    expect(state.nearAvailable).toBe(near(1) - BigInt(10_000) * BigInt(10) ** BigInt(19));
    expect(state.tokenBalance).toBe(BigInt(75_000_000));
    expect(state.registeredOnToken).toBe(true);
  });

  it("reports an account that doesn't exist yet", async () => {
    const state = await loadDonor(setupWith(tokenViews), "ghost.testnet");
    expect(state.exists).toBe(false);
  });
});

describe("checkSetup", () => {
  it("passes when the relief contract is registered and accepts this token", async () => {
    const setup = setupWith({ ...tokenViews, [`${RELIEF}.get_config`]: () => ({ pool_token: TOKEN }) });
    expect(await checkSetup(setup)).toEqual([]);
  });

  it("blocks when the relief contract isn't registered with the token", async () => {
    const views = { ...tokenViews, [`${TOKEN}.storage_balance_of`]: () => null };
    const blockers = await checkSetup(setupWith(views));
    expect(blockers.map((b) => b.code)).toEqual(["setup"]);
    expect(blockers[0].message).toMatch(/isn't registered/);
  });

  it("blocks when the contract's pool token differs from the site's token", async () => {
    const setup = setupWith({ ...tokenViews, [`${RELIEF}.get_config`]: () => ({ pool_token: "other.testnet" }) });
    expect((await checkSetup(setup))[0].message).toMatch(/only accepts other.testnet/);
  });

  it("tolerates a contract without get_config", async () => {
    expect(await checkSetup(setupWith(tokenViews))).toEqual([]);
  });

  it("pauses donations when the relief account doesn't exist yet", async () => {
    const blockers = await checkSetup(setupWith(tokenViews, {}));
    expect(blockers).toHaveLength(1);
    expect(blockers[0].message).toMatch(/doesn't exist on testnet yet/);
  });

  it("pauses donations when the relief account has no contract deployed", async () => {
    const blockers = await checkSetup(setupWith(tokenViews, { [RELIEF]: { ...reliefAccount[RELIEF], noCode: true } }));
    expect(blockers.map((b) => b.message).join(" ")).toMatch(/no contract deployed/);
  });
});

describe("evaluateDonation", () => {
  const setup = setupWith(tokenViews);

  it("accepts a valid donation", () => {
    expect(evaluateDonation({ setup, token, donor: donor(), amountText: "25.5" })).toEqual({ amount: BigInt(25_500_000), blockers: [] });
  });

  it("blocks a mainnet account on the testnet site", () => {
    const r = evaluateDonation({ setup, token, donor: donor({ accountId: "amina.near" }), amountText: "1" });
    expect(r.blockers.map((b) => b.code)).toContain("network_mismatch");
  });

  it("allows implicit accounts on any network", () => {
    const r = evaluateDonation({ setup, token, donor: donor({ accountId: "a".repeat(64) }), amountText: "1" });
    expect(r.blockers).toEqual([]);
  });

  it("blocks when there isn't enough NEAR for gas", () => {
    const r = evaluateDonation({ setup, token, donor: donor({ nearAvailable: near(0.001) }), amountText: "1" });
    expect(r.blockers.map((b) => b.code)).toEqual(["low_near"]);
  });

  it("blocks more than the token balance and says how much there is", () => {
    const r = evaluateDonation({ setup, token, donor: donor(), amountText: "100" });
    expect(r.blockers[0]).toMatchObject({ code: "insufficient_tokens", message: expect.stringContaining("75 tUSDC") });
  });

  it("explains bad amounts", () => {
    expect(evaluateDonation({ setup, token, donor: donor(), amountText: "1.1234567" }).blockers[0].code).toBe("amount");
    expect(evaluateDonation({ setup, token, donor: donor(), amountText: "" }).amount).toBeNull();
  });
});

describe("transaction builders", () => {
  const setup = setupWith(tokenViews);

  it("builds an ft_transfer_call to the token with exactly one yoctoNEAR", () => {
    expect(buildDonateTransaction({ ...setup, msg: "donate" }, BigInt(25_500_000))).toEqual({
      receiverId: TOKEN,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args: { receiver_id: RELIEF, amount: "25500000", msg: "donate" },
            gas: "150000000000000",
            deposit: "1",
          },
        },
      ],
    });
  });

  it("registers storage before minting test tokens for a new holder", async () => {
    const tx = await buildFaucetTransaction(setup, donor({ registeredOnToken: false }), BigInt(100_000_000));
    expect(tx.actions.map((a) => a.params.methodName)).toEqual(["storage_deposit", "mint"]);
    expect(tx.actions[0].params.deposit).toBe("1250000000000000000000");
  });

  it("skips storage registration when the holder is already registered", async () => {
    const tx = await buildFaucetTransaction(setup, donor(), BigInt(100_000_000));
    expect(tx.actions.map((a) => a.params.methodName)).toEqual(["mint"]);
  });
});

describe("base64 helpers", () => {
  it("round trip unicode", () => {
    expect(fromBase64(toBase64('{"msg":"doné"}'))).toBe('{"msg":"doné"}');
  });
});
