import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgentRoleKey,
  executeSwarmScenario,
  LifelineChainClient,
  type OnChainBid,
  type OnChainCase,
  type OnChainVote,
  type SwarmTrace,
  type TxOutcome,
  type Verdict,
  type VerifierRole,
} from "@lifeline/agents";
import { KeyPair, type NearAccount, Worker } from "near-workspaces";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_RES_DIR = path.resolve(__dirname, "../../contracts/res");
const MOCK_FT_WASM = path.join(CONTRACT_RES_DIR, "mock_ft.wasm");
const LIFELINE_WASM = path.join(CONTRACT_RES_DIR, "lifeline.wasm");

const requireFromWorkspaces = createRequire(
  path.resolve(__dirname, "../node_modules/near-workspaces/package.json"),
);
const { functionCallAccessKey } = requireFromWorkspaces("near-api-js/lib/transaction") as {
  functionCallAccessKey: (receiverId: string, methodNames: string[], allowance?: bigint) => unknown;
};

const STORAGE_DEPOSIT = BigInt("12500000000000000000000"); // 0.0125 NEAR
const NGO_STAKE = BigInt("1000000000000000000000000"); // 1 NEAR
const ONE_YOCTO = BigInt("1");
const GAS_30 = BigInt("30000000000000");
const GAS_100 = BigInt("100000000000000");
const FC_ALLOWANCE = BigInt("250000000000000000000000"); // 0.25 NEAR

interface PoolView {
  balance: string;
  reserved: string;
  available: string;
  disbursed_today: string;
  donors_count: number;
}

interface NgoView {
  bond: string;
  reputation: number;
  delivered: number;
  failed: number;
  profile_hash: string;
}

export interface SandboxActors {
  worker: Worker;
  root: NearAccount;
  mockFt: NearAccount;
  wrongFt: NearAccount;
  lifeline: NearAccount;
  owner: NearAccount;
  donor: NearAccount;
  intake: NearAccount;
  vGeo: NearAccount;
  vFact: NearAccount;
  vSev: NearAccount;
  vRed: NearAccount;
  ngo1: NearAccount;
  ngo2: NearAccount;
  ngo3: NearAccount;
  ngoUnreg: NearAccount;
  coord: NearAccount;
  forger: NearAccount;
  vGeoRestrictedKp: KeyPair;
}

export class NearWorkspaceChainAdapter extends LifelineChainClient {
  private readonly signers: Record<AgentRoleKey, NearAccount>;

  constructor(private readonly actors: SandboxActors) {
    super({
      mode: "stub",
      contractId: actors.lifeline.accountId,
      networkId: "sandbox",
    });
    this.signers = {
      intake: actors.intake,
      geo: actors.vGeo,
      fact: actors.vFact,
      sev: actors.vSev,
      red: actors.vRed,
      "ngo-1": actors.ngo1,
      "ngo-2": actors.ngo2,
      "ngo-3": actors.ngo3,
    };
  }

  public override getAccountId(role: AgentRoleKey): string {
    return this.signers[role].accountId;
  }

  private async exec(
    role: AgentRoleKey,
    methodName: string,
    args: Record<string, unknown>,
    gas = GAS_30,
  ): Promise<TxOutcome> {
    const signer = this.signers[role];
    const signWithKey =
      role === "geo" ? this.actors.vGeoRestrictedKp : undefined;
    const res = await signer.callRaw(
      this.actors.lifeline,
      methodName,
      args,
      { gas, ...(signWithKey ? { signWithKey } : {}) },
    );
    if (res.failed) {
      throw new Error(`Contract failure on ${methodName}: ${res.Failure?.error_message ?? JSON.stringify(res.Failure)}`);
    }
    return {
      tx_hash: res.result.transaction.hash,
      signer_id: signer.accountId,
    };
  }

  public override submitCase(params: {
    case_id: string;
    geohash: string;
    bundle_hash: string;
    requested_tier: number;
  }): Promise<TxOutcome> {
    return this.exec("intake", "submit_case", params);
  }

  public override vote(
    role: VerifierRole,
    params: {
      case_id: string;
      verdict: Verdict;
      confidence_bps: number;
      tier: number;
      evidence_hash: string;
      attestation_hash: string | null;
    },
  ): Promise<TxOutcome> {
    return this.exec(role, "vote", params);
  }

  public override placeBid(
    ngoRole: "ngo-1" | "ngo-2" | "ngo-3",
    params: {
      case_id: string;
      ask: string;
      eta_hours: number;
      plan_hash: string;
    },
  ): Promise<TxOutcome> {
    return this.exec(ngoRole, "place_bid", { ...params, simulated: true });
  }

  public override closeBidding(caseId: string): Promise<TxOutcome> {
    return this.exec("intake", "close_bidding", { case_id: caseId }, GAS_100);
  }

  public override submitProof(
    ngoRole: "ngo-1" | "ngo-2" | "ngo-3",
    params: {
      case_id: string;
      proof_hash: string;
      proof_uri: string;
    },
  ): Promise<TxOutcome> {
    return this.exec(ngoRole, "submit_proof", params);
  }

  public override voteDelivery(
    role: VerifierRole,
    params: {
      case_id: string;
      ok: boolean;
      evidence_hash: string;
    },
  ): Promise<TxOutcome> {
    return this.exec(role, "vote_delivery", params, GAS_100);
  }

  public override getCase(caseId: string): Promise<OnChainCase | null> {
    return this.actors.lifeline.view("get_case", { case_id: caseId });
  }

  public override listCases(status?: OnChainCase["status"]): Promise<OnChainCase[]> {
    return this.actors.lifeline.view("list_cases", {
      from: 0,
      limit: 50,
      ...(status ? { status } : {}),
    });
  }

  public override getVotes(caseId: string): Promise<OnChainVote[]> {
    return this.actors.lifeline.view("get_votes", { case_id: caseId });
  }

  public override getBids(caseId: string): Promise<OnChainBid[]> {
    return this.actors.lifeline.view("get_bids", { case_id: caseId });
  }
}

export async function runScenario(
  name: "S1" | "S2" | "S3" | "S4" | "S5",
  actors: SandboxActors,
): Promise<{ scenario: string; caseData: OnChainCase | null; trace?: SwarmTrace }> {
  const chain = new NearWorkspaceChainAdapter(actors);

  if (name === "S4") {
    const caseId = `case-s4-split-${Date.now()}`;
    await chain.submitCase({
      case_id: caseId,
      geohash: "s1w2e",
      bundle_hash: "44".repeat(32),
      requested_tier: 2,
    });
    await chain.vote("geo", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 7200,
      tier: 0,
      evidence_hash: "a1".repeat(32),
      attestation_hash: null,
    });
    await chain.vote("fact", {
      case_id: caseId,
      verdict: "Abstain",
      confidence_bps: 5000,
      tier: 0,
      evidence_hash: "a2".repeat(32),
      attestation_hash: null,
    });
    await chain.vote("sev", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 6800,
      tier: 2,
      evidence_hash: "a3".repeat(32),
      attestation_hash: null,
    });
    await chain.vote("red", {
      case_id: caseId,
      verdict: "No",
      confidence_bps: 6500,
      tier: 0,
      evidence_hash: "a4".repeat(32),
      attestation_hash: null,
    });
    const beforeConfirm = await chain.getCase(caseId);
    expect(beforeConfirm?.status).toBe("NeedsReview");

    await actors.coord.call(actors.lifeline, "human_confirm", { case_id: caseId });
    const afterConfirm = await chain.getCase(caseId);
    return { scenario: "S4", caseData: afterConfirm };
  }

  const trace = await executeSwarmScenario({ scenarioId: name, mode: "replay" }, chain);
  const caseData = await chain.getCase(trace.case_id);
  return { scenario: name, caseData, trace };
}

let actors: SandboxActors;

beforeAll(async () => {
  expect(fs.existsSync(MOCK_FT_WASM)).toBe(true);
  expect(fs.existsSync(LIFELINE_WASM)).toBe(true);

  const worker = await Worker.init();
  const root = worker.rootAccount;
  const near = BigInt(10) ** BigInt(24);

  const owner = await root.createSubAccount("owner", { initialBalance: near * BigInt(15) });
  const donor = await root.createSubAccount("donor", { initialBalance: near * BigInt(5) });
  const intake = await root.createSubAccount("intake", { initialBalance: near * BigInt(3) });
  const vGeo = await root.createSubAccount("v-geo", { initialBalance: near * BigInt(3) });
  const vFact = await root.createSubAccount("v-fact", { initialBalance: near * BigInt(3) });
  const vSev = await root.createSubAccount("v-sev", { initialBalance: near * BigInt(3) });
  const vRed = await root.createSubAccount("v-red", { initialBalance: near * BigInt(3) });
  const ngo1 = await root.createSubAccount("ngo-1", { initialBalance: near * BigInt(5) });
  const ngo2 = await root.createSubAccount("ngo-2", { initialBalance: near * BigInt(5) });
  const ngo3 = await root.createSubAccount("ngo-3", { initialBalance: near * BigInt(5) });
  const ngoUnreg = await root.createSubAccount("ngo-unreg", { initialBalance: near * BigInt(5) });
  const coord = await root.createSubAccount("coord", { initialBalance: near * BigInt(3) });
  const forger = await root.createSubAccount("forger", { initialBalance: near * BigInt(3) });

  const mockFt = await root.devDeploy(MOCK_FT_WASM, { initialBalance: near * BigInt(10) });
  const wrongFt = await root.devDeploy(MOCK_FT_WASM, { initialBalance: near * BigInt(10) });
  const lifeline = await root.devDeploy(LIFELINE_WASM, { initialBalance: near * BigInt(15) });

  // Initialize mock-ft & wrong-ft
  await mockFt.call(mockFt, "new_default_meta", {
    owner_id: owner.accountId,
    total_supply: "1000000000000", // 1,000,000 USDC (6 decimals)
  });
  await wrongFt.call(wrongFt, "new_default_meta", {
    owner_id: owner.accountId,
    total_supply: "1000000000000",
  });

  // Initialize lifeline
  await lifeline.call(lifeline, "new", {
    owner: owner.accountId,
    pool_token: mockFt.accountId,
  });

  // Storage deposits on mock-ft (deliberately omit ngoUnreg for rollback callback test!)
  for (const a of [lifeline, owner, donor, ngo1, ngo2, ngo3]) {
    await owner.call(
      mockFt,
      "storage_deposit",
      { account_id: a.accountId },
      { attachedDeposit: STORAGE_DEPOSIT },
    );
  }
  for (const a of [lifeline, donor]) {
    await owner.call(
      wrongFt,
      "storage_deposit",
      { account_id: a.accountId },
      { attachedDeposit: STORAGE_DEPOSIT },
    );
  }

  // Register intake, coordinator, verifiers, NGOs
  await owner.call(lifeline, "register_intake", { account: intake.accountId });
  await owner.call(lifeline, "register_coordinator", { account: coord.accountId });
  await owner.call(lifeline, "register_verifier", { account: vGeo.accountId, role: "geo" });
  await owner.call(lifeline, "register_verifier", { account: vFact.accountId, role: "fact" });
  await owner.call(lifeline, "register_verifier", { account: vSev.accountId, role: "sev" });
  await owner.call(lifeline, "register_verifier", { account: vRed.accountId, role: "red" });

  for (const ngo of [ngo1, ngo2, ngo3, ngoUnreg]) {
    await ngo.call(
      lifeline,
      "register_ngo",
      { profile_hash: "de".repeat(32) },
      { attachedDeposit: NGO_STAKE },
    );
  }

  // Add restricted FunctionCall access key to v-geo (vote + vote_delivery only)
  const vGeoRestrictedKp = KeyPair.fromRandom("ed25519");
  await vGeo
    .batch(vGeo)
    .addKey(
      vGeoRestrictedKp.getPublicKey().toString(),
      functionCallAccessKey(lifeline.accountId, ["vote", "vote_delivery"], FC_ALLOWANCE) as never,
    )
    .transact();

  // Fund donor via mock-ft faucet & wrong-ft transfer, seed pool with 50,000 USDC
  await donor.call(mockFt, "mint", { to: donor.accountId, amount: "10000000000" }); // 10,000 USDC
  await owner.call(
    wrongFt,
    "ft_transfer",
    { receiver_id: donor.accountId, amount: "500000000" },
    { attachedDeposit: ONE_YOCTO },
  );
  await owner.call(
    mockFt,
    "ft_transfer_call",
    {
      receiver_id: lifeline.accountId,
      amount: "50000000000", // 50,000 USDC
      msg: "Initial relief pool seed",
    },
    { gas: GAS_100, attachedDeposit: ONE_YOCTO },
  );

  actors = {
    worker,
    root,
    mockFt,
    wrongFt,
    lifeline,
    owner,
    donor,
    intake,
    vGeo,
    vFact,
    vSev,
    vRed,
    ngo1,
    ngo2,
    ngo3,
    ngoUnreg,
    coord,
    forger,
    vGeoRestrictedKp,
  };
}, 240_000);

afterAll(async () => {
  await actors?.worker?.tearDown();
});

describe("LifeLine & mock-ft NEAR Sandbox E2E Suite", () => {
  it("accepts NEP-141 donations, logs DonationRecord, and refunds non-pool tokens", async () => {
    const beforePool = await actors.lifeline.view<PoolView>("get_pool");
    const donateAmt = "1000000000"; // 1,000 USDC

    await actors.donor.call(
      actors.mockFt,
      "ft_transfer_call",
      {
        receiver_id: actors.lifeline.accountId,
        amount: donateAmt,
        msg: "Direct relief contribution",
      },
      { gas: GAS_100, attachedDeposit: ONE_YOCTO },
    );

    const afterPool = await actors.lifeline.view<PoolView>("get_pool");
    expect(BigInt(afterPool.balance) - BigInt(beforePool.balance)).toBe(BigInt(donateAmt));
    expect(BigInt(afterPool.available) - BigInt(beforePool.available)).toBe(BigInt(donateAmt));
    expect(afterPool.donors_count).toBeGreaterThanOrEqual(2);

    const donations = await actors.lifeline.view<Array<{ donor: string; amount: string; note: string | null }>>(
      "get_donations",
      { from: 0, limit: 10 },
    );
    expect(donations.some((d) => d.donor === actors.donor.accountId && d.amount === donateAmt)).toBe(true);

    // Wrong token is rejected by ft_on_transfer and 100% refunded to donor
    const wrongBefore = await actors.wrongFt.view<string>("ft_balance_of", {
      account_id: actors.donor.accountId,
    });
    await actors.donor.call(
      actors.wrongFt,
      "ft_transfer_call",
      {
        receiver_id: actors.lifeline.accountId,
        amount: "250000000",
        msg: "Spoof token",
      },
      { gas: GAS_100, attachedDeposit: ONE_YOCTO },
    );
    const wrongAfter = await actors.wrongFt.view<string>("ft_balance_of", {
      account_id: actors.donor.accountId,
    });
    expect(wrongAfter).toBe(wrongBefore);
  });

  it("enforces NEAR protocol FunctionCall access-key restrictions on verifier keys", async () => {
    // Restricted key on v-geo can call vote(), but protocol rejects register_ngo() or submit_case()
    await expect(
      actors.vGeo.call(
        actors.lifeline,
        "register_ngo",
        { profile_hash: "aa".repeat(32) },
        { attachedDeposit: NGO_STAKE, signWithKey: actors.vGeoRestrictedKp },
      ),
    ).rejects.toThrow();

    await expect(
      actors.vGeo.call(
        actors.lifeline,
        "submit_case",
        {
          case_id: "forbidden-submit",
          geohash: "s1x",
          bundle_hash: "aa".repeat(32),
          requested_tier: 2,
        },
        { gas: GAS_30, signWithKey: actors.vGeoRestrictedKp },
      ),
    ).rejects.toThrow();
  });

  it("blocks forged verifiers, duplicate votes, and out-of-cap bids; enforces cap governor formula", async () => {
    const caseId = "case-neg-security";
    await actors.intake.call(actors.lifeline, "submit_case", {
      case_id: caseId,
      geohash: "s1pwx",
      bundle_hash: "11".repeat(32),
      requested_tier: 2,
    });

    // Unregistered verifier fails
    await expect(
      actors.forger.call(actors.lifeline, "vote", {
        case_id: caseId,
        verdict: "Yes",
        confidence_bps: 9000,
        tier: 0,
        evidence_hash: "aa".repeat(32),
        attestation_hash: null,
      }),
    ).rejects.toThrow(/not a registered verifier/);

    // Restricted FunctionCall key SUCCEEDS on vote()
    await actors.vGeo.call(
      actors.lifeline,
      "vote",
      {
        case_id: caseId,
        verdict: "Yes",
        confidence_bps: 9000,
        tier: 0,
        evidence_hash: "bb".repeat(32),
        attestation_hash: null,
      },
      { gas: GAS_30, signWithKey: actors.vGeoRestrictedKp },
    );

    // Double vote fails
    await expect(
      actors.vGeo.call(
        actors.lifeline,
        "vote",
        {
          case_id: caseId,
          verdict: "Yes",
          confidence_bps: 9000,
          tier: 0,
          evidence_hash: "cc".repeat(32),
          attestation_hash: null,
        },
        { gas: GAS_30, signWithKey: actors.vGeoRestrictedKp },
      ),
    ).rejects.toThrow(/already voted/);

    await actors.vFact.call(actors.lifeline, "vote", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 8800,
      tier: 0,
      evidence_hash: "dd".repeat(32),
      attestation_hash: null,
    });
    await actors.vSev.call(actors.lifeline, "vote", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 8500,
      tier: 2,
      evidence_hash: "ee".repeat(32),
      attestation_hash: null,
    });

    const opened = await actors.lifeline.view<OnChainCase>("get_case", { case_id: caseId });
    expect(opened.status).toBe("Bidding");
    // Tier 2 cap is 2,000 USDC (2_000_000_000), below 20% of 51,000 USDC = 10,200 USDC and 25,000 daily limit
    expect(opened.cap).toBe("2000000000");

    // Bid exceeding cap is rejected
    await expect(
      actors.ngo1.call(actors.lifeline, "place_bid", {
        case_id: caseId,
        ask: "2000000001",
        eta_hours: 6,
        plan_hash: "ff".repeat(32),
        simulated: true,
      }),
    ).rejects.toThrow(/exceeds case spending cap/);
  });

  it("rolls back case state and pool accounting when Tranche 1 ft_transfer fails in callback", async () => {
    const caseId = "case-rollback-tranche1";
    await actors.intake.call(actors.lifeline, "submit_case", {
      case_id: caseId,
      geohash: "s1pwx",
      bundle_hash: "77".repeat(32),
      requested_tier: 3,
    });

    await actors.vGeo.call(
      actors.lifeline,
      "vote",
      {
        case_id: caseId,
        verdict: "Yes",
        confidence_bps: 9000,
        tier: 0,
        evidence_hash: "b1".repeat(32),
        attestation_hash: null,
      },
      { gas: GAS_30, signWithKey: actors.vGeoRestrictedKp },
    );
    await actors.vFact.call(actors.lifeline, "vote", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 9000,
      tier: 0,
      evidence_hash: "b2".repeat(32),
      attestation_hash: null,
    });
    await actors.vSev.call(actors.lifeline, "vote", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 9000,
      tier: 3,
      evidence_hash: "b3".repeat(32),
      attestation_hash: null,
    });

    // ngoUnreg has NO storage_deposit on mock-ft -> ft_transfer will fail cleanly
    await actors.ngoUnreg.call(actors.lifeline, "place_bid", {
      case_id: caseId,
      ask: "2500000000",
      eta_hours: 5,
      plan_hash: "c1".repeat(32),
      simulated: true,
    });

    const poolBefore = await actors.lifeline.view<PoolView>("get_pool");
    await actors.intake.call(
      actors.lifeline,
      "close_bidding",
      { case_id: caseId },
      { gas: GAS_100 },
    );

    const caseAfter = await actors.lifeline.view<OnChainCase>("get_case", { case_id: caseId });
    const poolAfter = await actors.lifeline.view<PoolView>("get_pool");

    expect(caseAfter.status).toBe("Bidding");
    expect(caseAfter.winner).toBeNull();
    expect(caseAfter.award_amount).toBe("0");
    expect(caseAfter.tranche1_paid).toBe("0");
    expect(poolAfter.balance).toBe(poolBefore.balance);
    expect(poolAfter.reserved).toBe(poolBefore.reserved);
    expect(poolAfter.disbursed_today).toBe(poolBefore.disbursed_today);
  });

  it("executes S1 (full lifecycle & Tranche 1+2 payout), S2, S3, S4, and S5 via @lifeline/agents", async () => {
    // S1: Genuine Maiduguri flood -> Awarded -> Delivered (40% + 60% transferred on mock-ft)
    const winnerBeforeBal = BigInt(
      await actors.mockFt.view<string>("ft_balance_of", { account_id: actors.ngo3.accountId }),
    );
    const s1 = await runScenario("S1", actors);
    expect(s1.trace?.post_vote_status).toBe("Bidding");
    expect(s1.caseData?.status).toBe("Delivered");
    expect(s1.caseData?.winner).toBe(actors.ngo3.accountId);
    const totalAward = BigInt(s1.caseData!.award_amount);
    expect(BigInt(s1.caseData!.tranche1_paid) + BigInt(s1.caseData!.tranche2_paid)).toBe(totalAward);

    const winnerAfterBal = BigInt(
      await actors.mockFt.view<string>("ft_balance_of", { account_id: actors.ngo3.accountId }),
    );
    expect(winnerAfterBal - winnerBeforeBal).toBe(totalAward);

    const ngo3AfterS1 = await actors.lifeline.view<NgoView>("get_ngo", {
      account_id: actors.ngo3.accountId,
    });
    expect(ngo3AfterS1.reputation).toBe(110);
    expect(ngo3AfterS1.delivered).toBe(1);

    // S2: Keyword stuffing + prompt injection -> Rejected, 0 USDC leaves pool
    const poolBeforeS2 = await actors.lifeline.view<PoolView>("get_pool");
    const s2 = await runScenario("S2", actors);
    const poolAfterS2 = await actors.lifeline.view<PoolView>("get_pool");
    expect(s2.caseData?.status).toBe("Rejected");
    expect(poolAfterS2.balance).toBe(poolBeforeS2.balance);

    // S3: Single-sender flood of fakes -> Rejected, voting after Rejected fails
    const poolBeforeS3 = await actors.lifeline.view<PoolView>("get_pool");
    const s3 = await runScenario("S3", actors);
    const poolAfterS3 = await actors.lifeline.view<PoolView>("get_pool");
    expect(s3.caseData?.status).toBe("Rejected");
    expect(poolAfterS3.balance).toBe(poolBeforeS3.balance);

    // S4: Split vote -> NeedsReview -> human_confirm -> Bidding
    const s4 = await runScenario("S4", actors);
    expect(s4.caseData?.status).toBe("Bidding");
    expect(BigInt(s4.caseData!.cap)).toBeGreaterThan(BigInt(0));

    // S5: Fraudulent delivery proof -> retry #1 stays Awarded; retry #2 expires & unreserves escrow
    const s5 = await runScenario("S5", actors);
    expect(s5.caseData?.status).toBe("Awarded");
    expect(s5.caseData?.delivery_retry_count).toBe(1);
    expect(s5.caseData?.tranche2_paid).toBe("0");

    // Submit a second bad proof & trigger 3 not-ok votes -> Expired, Tranche 2 returned to available
    const poolBeforeSecondBad = await actors.lifeline.view<PoolView>("get_pool");
    const s5Id = s5.caseData!.id;
    const tranche2Locked = BigInt(s5.caseData!.award_amount) - BigInt(s5.caseData!.tranche1_paid);
    await actors.ngo3.call(actors.lifeline, "submit_proof", {
      case_id: s5Id,
      proof_hash: "badproof2",
      proof_uri: "/api/evidence/badproof2",
    });
    await actors.vGeo.call(
      actors.lifeline,
      "vote_delivery",
      { case_id: s5Id, ok: false, evidence_hash: "f1".repeat(32) },
      { gas: GAS_100, signWithKey: actors.vGeoRestrictedKp },
    );
    await actors.vFact.call(
      actors.lifeline,
      "vote_delivery",
      { case_id: s5Id, ok: false, evidence_hash: "f2".repeat(32) },
      { gas: GAS_100 },
    );
    await actors.vRed.call(
      actors.lifeline,
      "vote_delivery",
      { case_id: s5Id, ok: false, evidence_hash: "f3".repeat(32) },
      { gas: GAS_100 },
    );

    const s5Final = await actors.lifeline.view<OnChainCase>("get_case", { case_id: s5Id });
    const poolAfterSecondBad = await actors.lifeline.view<PoolView>("get_pool");
    const ngo3AfterS5 = await actors.lifeline.view<NgoView>("get_ngo", {
      account_id: actors.ngo3.accountId,
    });
    expect(s5Final.status).toBe("Expired");
    expect(BigInt(poolAfterSecondBad.reserved)).toBe(
      BigInt(poolBeforeSecondBad.reserved) - tranche2Locked,
    );
    expect(BigInt(poolAfterSecondBad.available)).toBe(
      BigInt(poolBeforeSecondBad.available) + tranche2Locked,
    );
    expect(poolAfterSecondBad.balance).toBe(poolBeforeSecondBad.balance);
    expect(ngo3AfterS5.reputation).toBe(90); // 110 after S1 - 20 penalty on S5 expiry
  });

  it("expires an Awarded case past proof_deadline, unreserves Tranche 2, and penalizes NGO", async () => {
    // Configure short proof deadline (1s) so expire() triggers deterministically in sandbox
    await actors.owner.call(actors.lifeline, "set_config", {
      config: { proof_deadline_secs: 1 },
    });

    const caseId = "case-expire-deadline";
    await actors.intake.call(actors.lifeline, "submit_case", {
      case_id: caseId,
      geohash: "s1ex",
      bundle_hash: "99".repeat(32),
      requested_tier: 2,
    });
    await actors.vGeo.call(
      actors.lifeline,
      "vote",
      {
        case_id: caseId,
        verdict: "Yes",
        confidence_bps: 9000,
        tier: 0,
        evidence_hash: "e1".repeat(32),
        attestation_hash: null,
      },
      { gas: GAS_30, signWithKey: actors.vGeoRestrictedKp },
    );
    await actors.vFact.call(actors.lifeline, "vote", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 9000,
      tier: 0,
      evidence_hash: "e2".repeat(32),
      attestation_hash: null,
    });
    await actors.vSev.call(actors.lifeline, "vote", {
      case_id: caseId,
      verdict: "Yes",
      confidence_bps: 9000,
      tier: 2,
      evidence_hash: "e3".repeat(32),
      attestation_hash: null,
    });

    await actors.ngo1.call(actors.lifeline, "place_bid", {
      case_id: caseId,
      ask: "1000000000", // 1,000 USDC -> Tranche 1 = 400, Tranche 2 = 600
      eta_hours: 6,
      plan_hash: "p9".repeat(32),
      simulated: true,
    });

    await actors.intake.call(
      actors.lifeline,
      "close_bidding",
      { case_id: caseId },
      { gas: GAS_100 },
    );
    const poolAwarded = await actors.lifeline.view<PoolView>("get_pool");
    const ngoBefore = await actors.lifeline.view<NgoView>("get_ngo", {
      account_id: actors.ngo1.accountId,
    });

    // Wait past the 1s proof_deadline then expire()
    await new Promise((r) => setTimeout(r, 3000));
    await actors.donor.call(actors.lifeline, "expire", { case_id: caseId });

    const expiredCase = await actors.lifeline.view<OnChainCase>("get_case", { case_id: caseId });
    const poolExpired = await actors.lifeline.view<PoolView>("get_pool");
    const ngoAfter = await actors.lifeline.view<NgoView>("get_ngo", {
      account_id: actors.ngo1.accountId,
    });

    expect(expiredCase.status).toBe("Expired");
    expect(BigInt(poolExpired.reserved)).toBe(BigInt(poolAwarded.reserved) - BigInt("600000000"));
    expect(BigInt(poolExpired.available)).toBe(BigInt(poolAwarded.available) + BigInt("600000000"));
    expect(poolExpired.balance).toBe(poolAwarded.balance);
    expect(ngoAfter.reputation).toBe(ngoBefore.reputation - 20);
  });
});
