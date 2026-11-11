import path from "node:path";
import { fileURLToPath } from "node:url";
import { type NearAccount, Worker } from "near-workspaces";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmDonation } from "@/lib/donate/confirm";
import { buildDonateTransaction, checkSetup, type DonateSetup, evaluateDonation, loadDonor, loadToken, type PlannedTransaction } from "@/lib/donate/plan";

// End to end on a local NEAR sandbox: the real NEP-141 token (near-sdk-rs example) and the "defi"
// receiver from near-workspaces stand in for the pool token and the relief contract. Every
// transaction sent here is the exact object our builders produce for the wallet.
// defi's ft_on_transfer keeps everything for msg "take-my-money", returns `msg` tokens for a number,
// and panics for anything else, which covers accepted, partial and refunded donations.

const CONTRACTS = fileURLToPath(new URL("./contracts", import.meta.url));
const STORAGE_DEPOSIT = BigInt("12500000000000000000000"); // 0.0125 NEAR, above the token's minimum

let worker: Worker;
let token: NearAccount;
let relief: NearAccount;
let unregistered: NearAccount;
let donor: NearAccount;
let rpcUrl: string;

async function send(signer: NearAccount, tx: PlannedTransaction): Promise<string> {
  let hash = "";
  for (const a of tx.actions) {
    const res = await signer.callRaw(tx.receiverId, a.params.methodName, a.params.args as Record<string, unknown>, {
      gas: BigInt(a.params.gas),
      attachedDeposit: BigInt(a.params.deposit),
    });
    hash = res.result.transaction.hash;
  }
  return hash;
}

function setupFor(receiver: string, msg: string): DonateSetup {
  return { rpc: { url: rpcUrl }, network: "testnet", relief: receiver, token: token.accountId, msg, gasTgas: 150 };
}

beforeAll(async () => {
  worker = await Worker.init();
  rpcUrl = (worker as unknown as { config: { rpcAddr: string } }).config.rpcAddr;
  const root = worker.rootAccount;

  token = await root.devDeploy(path.join(CONTRACTS, "fungible_token.wasm"), { initialBalance: BigInt(10) ** BigInt(25) * BigInt(3) });
  relief = await root.devDeploy(path.join(CONTRACTS, "defi.wasm"), { initialBalance: BigInt(10) ** BigInt(25) * BigInt(3) });
  unregistered = await root.devDeploy(path.join(CONTRACTS, "defi.wasm"), { initialBalance: BigInt(10) ** BigInt(25) * BigInt(3) });
  donor = await root.createSubAccount("donor", { initialBalance: BigInt(10) ** BigInt(24) * BigInt(5) });

  await token.call(token, "new_default_meta", { owner_id: root.accountId, total_supply: "1000000000000" });
  for (const r of [relief, unregistered]) await r.call(r, "new", { fungible_token_account_id: token.accountId });
  for (const a of [relief, donor]) {
    await root.call(token, "storage_deposit", { account_id: a.accountId }, { attachedDeposit: STORAGE_DEPOSIT });
  }
  await root.call(token, "ft_transfer", { receiver_id: donor.accountId, amount: "500000000" }, { attachedDeposit: BigInt(1) });
}, 180_000);

afterAll(async () => {
  await worker?.tearDown();
});

describe("donation flow on a local sandbox", () => {
  it("reads token metadata and the donor's balances", async () => {
    const setup = setupFor(relief.accountId, "take-my-money");
    const info = await loadToken(setup);
    expect(info.decimals).toBeGreaterThan(0);
    const state = await loadDonor(setup, donor.accountId);
    expect(state).toMatchObject({ exists: true, tokenBalance: BigInt(500000000), registeredOnToken: true });
  });

  it("passes setup checks when the relief contract is registered", async () => {
    expect(await checkSetup(setupFor(relief.accountId, ""))).toEqual([]);
  });

  it("blocks before sending when the relief contract isn't registered with the token", async () => {
    const blockers = await checkSetup(setupFor(unregistered.accountId, ""));
    expect(blockers[0].message).toMatch(/isn't registered/);
  });

  it("confirms a donation the relief contract kept", async () => {
    const setup = setupFor(relief.accountId, "take-my-money");
    const amount = BigInt(100_000_000);
    const hash = await send(donor, buildDonateTransaction(setup, amount));
    const r = await confirmDonation(setup.rpc, hash, { token: token.accountId, receiver: relief.accountId, signer: donor.accountId, amount });
    expect(r).toMatchObject({ kind: "accepted", used: amount, refunded: BigInt(0), receiverError: null });
  });

  it("reports the exact split when the contract refunds part of it", async () => {
    const setup = setupFor(relief.accountId, "30000000");
    const amount = BigInt(100_000_000);
    const hash = await send(donor, buildDonateTransaction(setup, amount));
    const r = await confirmDonation(setup.rpc, hash, { token: token.accountId, receiver: relief.accountId, signer: donor.accountId, amount });
    expect(r).toMatchObject({ kind: "partial", used: BigInt(70_000_000), refunded: BigInt(30_000_000) });
  });

  it("reports a full refund with the reason when the relief contract panics", async () => {
    const setup = setupFor(relief.accountId, "not a number");
    const amount = BigInt(50_000_000);
    const hash = await send(donor, buildDonateTransaction(setup, amount));
    const r = await confirmDonation(setup.rpc, hash, { token: token.accountId, receiver: relief.accountId, signer: donor.accountId, amount });
    expect(r.kind).toBe("refunded");
    if (r.kind === "refunded") expect(r.receiverError).toMatch(/ParseIntError|panicked/);
  });

  it("reports a failed transfer when the donor sends more than they hold", async () => {
    const setup = setupFor(relief.accountId, "take-my-money");
    const amount = BigInt(10_000_000_000);
    const before = await loadDonor(setup, donor.accountId);
    // The preflight would have stopped this; send it anyway to check the parser on a real failure.
    expect(evaluateDonation({ setup, token: await loadToken(setup), donor: before, amountText: "10000000000" }).blockers.length).toBeGreaterThan(0);
    const hash = await send(donor, buildDonateTransaction(setup, amount));
    const r = await confirmDonation(setup.rpc, hash, { token: token.accountId, receiver: relief.accountId, signer: donor.accountId, amount });
    expect(r.kind).toBe("failed");
    const after = await loadDonor(setup, donor.accountId);
    expect(after.tokenBalance).toBe(before.tokenBalance);
  });

  it("leaves the donor with exactly the tokens that weren't donated", async () => {
    const state = await loadDonor(setupFor(relief.accountId, ""), donor.accountId);
    // 500 start, minus 100 kept, minus 70 kept; the panic and the failed transfer moved nothing.
    expect(state.tokenBalance).toBe(BigInt(500_000_000 - 100_000_000 - 70_000_000));
  });
});
