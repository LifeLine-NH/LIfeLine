import { connect, KeyPair, keyStores, type Near } from "near-api-js";
import type { CaseStatus, Verdict, VerifierRole } from "../schemas/index.js";
import { sha256Hex } from "../utils/hash.js";

export type AgentRoleKey =
  | "intake"
  | "geo"
  | "fact"
  | "sev"
  | "red"
  | "ngo-1"
  | "ngo-2"
  | "ngo-3";

export interface OnChainCase {
  id: string;
  geohash: string;
  bundle_hash: string;
  requested_tier: number;
  tier: number;
  status: CaseStatus;
  opened_at: number;
  cap: string;
  bidding_ends_at: number;
  winner: string | null;
  award_amount: string;
  tranche1_paid: string;
  tranche2_paid: string;
  proof_hash: string | null;
  proof_uri: string | null;
  proof_deadline: number;
  delivery_retry_count: number;
}

export interface OnChainVote {
  role: VerifierRole;
  verifier: string;
  verdict: Verdict;
  confidence_bps: number;
  tier: number;
  evidence_hash: string;
  attestation_hash: string | null;
  at: number;
}

export interface OnChainBid {
  ngo: string;
  ask: string;
  eta_hours: number;
  plan_hash: string;
  at: number;
}

export interface OnChainDeliveryVote {
  role: VerifierRole;
  verifier: string;
  ok: boolean;
  evidence_hash: string;
  at: number;
}

export interface TxOutcome {
  tx_hash: string;
  signer_id: string;
}

const DEFAULT_ACCOUNTS: Record<AgentRoleKey, string> = {
  intake: process.env.INTAKE_ACCOUNT_ID ?? "intake.lifeline-demo.testnet",
  geo: process.env.V_GEO_ACCOUNT_ID ?? "v-geo.lifeline-demo.testnet",
  fact: process.env.V_FACT_ACCOUNT_ID ?? "v-fact.lifeline-demo.testnet",
  sev: process.env.V_SEV_ACCOUNT_ID ?? "v-sev.lifeline-demo.testnet",
  red: process.env.V_RED_ACCOUNT_ID ?? "v-red.lifeline-demo.testnet",
  "ngo-1": process.env.NGO_1_ACCOUNT_ID ?? "ngo-rapid.lifeline-demo.testnet",
  "ngo-2": process.env.NGO_2_ACCOUNT_ID ?? "ngo-balanced.lifeline-demo.testnet",
  "ngo-3": process.env.NGO_3_ACCOUNT_ID ?? "ngo-frugal.lifeline-demo.testnet"
};

const ENV_PRIVATE_KEYS: Record<AgentRoleKey, string | undefined> = {
  intake: process.env.INTAKE_PRIVATE_KEY,
  geo: process.env.V_GEO_PRIVATE_KEY,
  fact: process.env.V_FACT_PRIVATE_KEY,
  sev: process.env.V_SEV_PRIVATE_KEY,
  red: process.env.V_RED_PRIVATE_KEY,
  "ngo-1": process.env.NGO_1_PRIVATE_KEY,
  "ngo-2": process.env.NGO_2_PRIVATE_KEY,
  "ngo-3": process.env.NGO_3_PRIVATE_KEY
};

/**
 * Multi-account NEAR Chain Client for Developer B (Section B.4.2 & Section 5).
 *
 * - Each role (`intake`, `geo`, `fact`, `sev`, `red`, `ngo-1..3`) uses its OWN NEAR account and key.
 * - In `testnet` / `mainnet` mode: signs and broadcasts real NEAR transactions via `near-api-js`.
 * - In `stub` mode (default when offline or in unit/replay tests): runs a faithful in-memory
 *   implementation of Developer A's contract state machine (Section 5 & A.3) so quorum, spending
 *   caps, bidding, tranche releases, and delivery verification are always computed by the contract
 *   layer, never hardcoded in the orchestrator.
 */
export class LifelineChainClient {
  public readonly mode: "stub" | "testnet" | "mainnet";
  public readonly contractId: string;
  public readonly networkId: string;
  public readonly rpcUrl: string;

  // Stub state machine storage (used when mode === "stub")
  private cases = new Map<string, OnChainCase>();
  private votes = new Map<string, OnChainVote[]>();
  private bids = new Map<string, OnChainBid[]>();
  private deliveryVotes = new Map<string, OnChainDeliveryVote[]>();
  private poolAvailable = BigInt("50000000000"); // 50,000 USDC (6 decimals)
  private disbursedToday = BigInt("0");
  private readonly tierCaps: Record<number, bigint> = {
    1: BigInt("0"),
    2: BigInt("2000000000"), // 2,000 USDC
    3: BigInt("5000000000"), // 5,000 USDC
    4: BigInt("10000000000") // 10,000 USDC
  };
  private readonly maxCaseBps = BigInt(2000); // 20% of pool
  private readonly dailyLimit = BigInt("25000000000"); // 25,000 USDC
  private readonly tranche1Bps = BigInt(4000); // 40%
  private txSequence = 0;

  private nearConnectionPromise?: Promise<Near>;

  constructor(options?: {
    mode?: "stub" | "testnet" | "mainnet";
    contractId?: string;
    networkId?: string;
    rpcUrl?: string;
  }) {
    const envMode = (process.env.CHAIN_MODE ?? "stub") as "stub" | "testnet" | "mainnet";
    this.mode = options?.mode ?? envMode;
    this.contractId = options?.contractId ?? process.env.CONTRACT_ID ?? "lifeline-demo.testnet";
    this.networkId = options?.networkId ?? process.env.NEAR_NETWORK ?? "testnet";
    this.rpcUrl = options?.rpcUrl ?? process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
  }

  public getAccountId(role: AgentRoleKey): string {
    return DEFAULT_ACCOUNTS[role];
  }

  private async getNear(): Promise<Near> {
    if (!this.nearConnectionPromise) {
      const keyStore = new keyStores.InMemoryKeyStore();
      for (const role of Object.keys(DEFAULT_ACCOUNTS) as AgentRoleKey[]) {
        const accountId = DEFAULT_ACCOUNTS[role];
        const privKey = ENV_PRIVATE_KEYS[role];
        if (privKey) {
          const kp = KeyPair.fromString(privKey as Parameters<typeof KeyPair.fromString>[0]);
          await keyStore.setKey(this.networkId, accountId, kp);
        }
      }
      this.nearConnectionPromise = connect({
        networkId: this.networkId,
        nodeUrl: this.rpcUrl,
        keyStore
      });
    }
    return this.nearConnectionPromise;
  }

  private async callContractMethod(
    role: AgentRoleKey,
    methodName: string,
    args: Record<string, unknown>
  ): Promise<TxOutcome> {
    const signerId = this.getAccountId(role);
    const near = await this.getNear();
    const account = await near.account(signerId);
    const outcome = await account.functionCall({
      contractId: this.contractId,
      methodName,
      args,
      gas: BigInt("30000000000000") // 30 TGas
    });
    return {
      tx_hash: outcome.transaction.hash,
      signer_id: signerId
    };
  }

  private async viewContractMethod<T>(
    methodName: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const near = await this.getNear();
    const account = await near.account(this.contractId);
    return (await account.viewFunction({
      contractId: this.contractId,
      methodName,
      args
    })) as T;
  }

  private makeDeterministicSandboxTxHash(
    signerId: string,
    method: string,
    args: Record<string, unknown>
  ): string {
    this.txSequence += 1;
    const digest = sha256Hex(
      `sandbox:${signerId}:${method}:${JSON.stringify(args)}:${this.txSequence}`
    );
    return `sbx_${digest.slice(0, 40)}`;
  }

  /**
   * 1. Intake oracle opens a case on-chain: `submit_case(case_id, geohash, bundle_hash, requested_tier)`
   */
  public async submitCase(params: {
    case_id: string;
    geohash: string;
    bundle_hash: string;
    requested_tier: number;
  }): Promise<TxOutcome> {
    const signerId = this.getAccountId("intake");

    if (this.mode !== "stub") {
      return this.callContractMethod("intake", "submit_case", params);
    }

    if (this.cases.has(params.case_id)) {
      throw new Error(`Contract error: duplicate case_id ${params.case_id}`);
    }

    const now = Date.now();
    this.cases.set(params.case_id, {
      id: params.case_id,
      geohash: params.geohash,
      bundle_hash: params.bundle_hash,
      requested_tier: params.requested_tier,
      tier: params.requested_tier,
      status: "Open",
      opened_at: now,
      cap: "0",
      bidding_ends_at: 0,
      winner: null,
      award_amount: "0",
      tranche1_paid: "0",
      tranche2_paid: "0",
      proof_hash: null,
      proof_uri: null,
      proof_deadline: 0,
      delivery_retry_count: 0
    });
    this.votes.set(params.case_id, []);
    this.bids.set(params.case_id, []);
    this.deliveryVotes.set(params.case_id, []);

    return {
      tx_hash: this.makeDeterministicSandboxTxHash(signerId, "submit_case", params),
      signer_id: signerId
    };
  }

  /**
   * 2. Verifier casts an on-chain vote using its own account key:
   * `vote(case_id, verdict, confidence_bps, tier, evidence_hash, attestation_hash)`
   */
  public async vote(
    role: VerifierRole,
    params: {
      case_id: string;
      verdict: Verdict;
      confidence_bps: number;
      tier: number;
      evidence_hash: string;
      attestation_hash: string | null;
    }
  ): Promise<TxOutcome> {
    const signerId = this.getAccountId(role);

    if (this.mode !== "stub") {
      return this.callContractMethod(role, "vote", params);
    }

    const c = this.cases.get(params.case_id);
    if (!c) throw new Error(`Contract error: case ${params.case_id} not found`);

    const caseVotes = this.votes.get(params.case_id) ?? [];
    if (caseVotes.some((v) => v.role === role || v.verifier === signerId)) {
      throw new Error(`Contract error: verifier ${signerId} (${role}) already voted`);
    }

    // Record the vote even if earlier quorum transitioned the state, or evaluate while Open
    caseVotes.push({
      role,
      verifier: signerId,
      verdict: params.verdict,
      confidence_bps: params.confidence_bps,
      tier: params.tier,
      evidence_hash: params.evidence_hash,
      attestation_hash: params.attestation_hash,
      at: Date.now()
    });
    this.votes.set(params.case_id, caseVotes);

    if (role === "sev" && params.tier >= 1 && params.tier <= 4) {
      c.tier = params.tier;
    }

    // Evaluate quorum inside vote() per Section 5 & A.3.2
    if (c.status === "Open") {
      const yesCount = caseVotes.filter((v) => v.verdict === "Yes").length;
      const noCount = caseVotes.filter((v) => v.verdict === "No").length;

      if (yesCount >= 3) {
        const effectiveTier = c.tier || c.requested_tier;
        if (effectiveTier === 1) {
          c.status = "Rejected";
        } else {
          const tierCap = this.tierCaps[effectiveTier] ?? BigInt(0);
          const poolPctCap = (this.poolAvailable * this.maxCaseBps) / BigInt(10000);
          const dailyRemaining =
            this.dailyLimit > this.disbursedToday
              ? this.dailyLimit - this.disbursedToday
              : BigInt(0);
          const computedCap = [tierCap, poolPctCap, dailyRemaining].reduce((m, e) =>
            e < m ? e : m
          );
          if (computedCap <= BigInt(0)) {
            c.status = "Rejected";
          } else {
            c.cap = computedCap.toString();
            c.status = "Bidding";
            c.bidding_ends_at = Date.now() + 90_000;
          }
        }
      } else if (noCount >= 2) {
        c.status = "Rejected";
      } else if (caseVotes.length >= 4) {
        c.status = "NeedsReview";
      }
    }

    return {
      tx_hash: this.makeDeterministicSandboxTxHash(signerId, "vote", params),
      signer_id: signerId
    };
  }

  /**
   * 3. NGO places bid on a case in `Bidding` state: `place_bid(case_id, ask, eta_hours, plan_hash)`
   */
  public async placeBid(
    ngoRole: "ngo-1" | "ngo-2" | "ngo-3",
    params: {
      case_id: string;
      ask: string;
      eta_hours: number;
      plan_hash: string;
    }
  ): Promise<TxOutcome> {
    const signerId = this.getAccountId(ngoRole);

    if (this.mode !== "stub") {
      return this.callContractMethod(ngoRole, "place_bid", params);
    }

    const c = this.cases.get(params.case_id);
    if (!c) throw new Error(`Contract error: case ${params.case_id} not found`);
    if (c.status !== "Bidding" && c.status !== "Verified") {
      throw new Error(`Contract error: case ${params.case_id} is not in Bidding state (${c.status})`);
    }

    const askVal = BigInt(params.ask);
    const capVal = BigInt(c.cap);
    if (askVal <= BigInt(0) || askVal > capVal) {
      throw new Error(`Contract error: bid ask ${params.ask} exceeds cap ${c.cap}`);
    }

    const caseBids = (this.bids.get(params.case_id) ?? []).filter((b) => b.ngo !== signerId);
    caseBids.push({
      ngo: signerId,
      ask: params.ask,
      eta_hours: params.eta_hours,
      plan_hash: params.plan_hash,
      at: Date.now()
    });
    this.bids.set(params.case_id, caseBids);

    return {
      tx_hash: this.makeDeterministicSandboxTxHash(signerId, "place_bid", params),
      signer_id: signerId
    };
  }

  /**
   * 4. Closes bidding, picks lowest-ask winner, reserves escrow, and pays tranche 1 (40%)
   */
  public async closeBidding(caseId: string): Promise<TxOutcome> {
    const signerId = this.getAccountId("intake");

    if (this.mode !== "stub") {
      return this.callContractMethod("intake", "close_bidding", { case_id: caseId });
    }

    const c = this.cases.get(caseId);
    if (!c) throw new Error(`Contract error: case ${caseId} not found`);
    const caseBids = this.bids.get(caseId) ?? [];

    if (caseBids.length === 0) {
      c.status = "Expired";
      return {
        tx_hash: this.makeDeterministicSandboxTxHash(signerId, "close_bidding", { case_id: caseId }),
        signer_id: signerId
      };
    }

    const sorted = [...caseBids].sort((a, b) => {
      const diff = BigInt(a.ask) - BigInt(b.ask);
      if (diff !== BigInt(0)) return diff < BigInt(0) ? -1 : 1;
      return a.eta_hours - b.eta_hours;
    });

    const winner = sorted[0];
    const awardAmount = BigInt(winner.ask);
    const tranche1 = (awardAmount * this.tranche1Bps) / BigInt(10000);

    c.winner = winner.ngo;
    c.award_amount = awardAmount.toString();
    c.tranche1_paid = tranche1.toString();
    c.status = "Awarded";
    c.proof_deadline = Date.now() + 300_000;
    this.poolAvailable -= awardAmount;
    this.disbursedToday += tranche1;

    return {
      tx_hash: this.makeDeterministicSandboxTxHash(signerId, "close_bidding", { case_id: caseId }),
      signer_id: signerId
    };
  }

  /**
   * 5. Winning NGO submits proof of delivery: `submit_proof(case_id, proof_hash, proof_uri)`
   */
  public async submitProof(
    ngoRole: "ngo-1" | "ngo-2" | "ngo-3",
    params: {
      case_id: string;
      proof_hash: string;
      proof_uri: string;
    }
  ): Promise<TxOutcome> {
    const signerId = this.getAccountId(ngoRole);

    if (this.mode !== "stub") {
      return this.callContractMethod(ngoRole, "submit_proof", params);
    }

    const c = this.cases.get(params.case_id);
    if (!c) throw new Error(`Contract error: case ${params.case_id} not found`);
    if (c.status !== "Awarded") {
      throw new Error(`Contract error: case ${params.case_id} is not in Awarded state`);
    }
    if (c.winner !== signerId) {
      throw new Error(`Contract error: ${signerId} is not the winning NGO (${c.winner})`);
    }

    c.proof_hash = params.proof_hash;
    c.proof_uri = params.proof_uri;
    c.status = "ProofSubmitted";
    this.deliveryVotes.set(params.case_id, []);

    return {
      tx_hash: this.makeDeterministicSandboxTxHash(signerId, "submit_proof", params),
      signer_id: signerId
    };
  }

  /**
   * 6. Verifier votes on proof of delivery: `vote_delivery(case_id, ok, evidence_hash)`
   * Rules (Section 5 & A.3.5):
   * - `ok >= 2` -> releases tranche 2, status becomes `Delivered`
   * - `not-ok >= 3` -> first time reverts to `Awarded` (NGO may retry once); second time -> `Expired`
   */
  public async voteDelivery(
    role: VerifierRole,
    params: {
      case_id: string;
      ok: boolean;
      evidence_hash: string;
    }
  ): Promise<TxOutcome> {
    const signerId = this.getAccountId(role);

    if (this.mode !== "stub") {
      return this.callContractMethod(role, "vote_delivery", params);
    }

    const c = this.cases.get(params.case_id);
    if (!c) throw new Error(`Contract error: case ${params.case_id} not found`);

    const dVotes = this.deliveryVotes.get(params.case_id) ?? [];
    if (dVotes.some((v) => v.role === role)) {
      throw new Error(`Contract error: verifier ${role} already voted on delivery`);
    }

    dVotes.push({
      role,
      verifier: signerId,
      ok: params.ok,
      evidence_hash: params.evidence_hash,
      at: Date.now()
    });
    this.deliveryVotes.set(params.case_id, dVotes);

    if (c.status === "ProofSubmitted") {
      const okCount = dVotes.filter((v) => v.ok).length;
      const notOkCount = dVotes.filter((v) => !v.ok).length;

      if (okCount >= 2) {
        const awardAmount = BigInt(c.award_amount);
        const tranche1 = BigInt(c.tranche1_paid);
        const tranche2 = awardAmount - tranche1;
        c.tranche2_paid = tranche2.toString();
        c.status = "Delivered";
        this.disbursedToday += tranche2;
      } else if (notOkCount >= 3) {
        if (c.delivery_retry_count === 0) {
          c.delivery_retry_count = 1;
          c.status = "Awarded";
        } else {
          c.status = "Expired";
        }
      }
    }

    return {
      tx_hash: this.makeDeterministicSandboxTxHash(signerId, "vote_delivery", params),
      signer_id: signerId
    };
  }

  /**
   * Contract Views
   */
  public async getCase(caseId: string): Promise<OnChainCase | null> {
    if (this.mode !== "stub") {
      return this.viewContractMethod<OnChainCase | null>("get_case", { case_id: caseId });
    }
    return this.cases.get(caseId) ?? null;
  }

  public async listCases(status?: CaseStatus): Promise<OnChainCase[]> {
    if (this.mode !== "stub") {
      return this.viewContractMethod<OnChainCase[]>("list_cases", {
        from: 0,
        limit: 50,
        ...(status ? { status } : {})
      });
    }
    const all = Array.from(this.cases.values());
    return status ? all.filter((c) => c.status === status) : all;
  }

  public async getVotes(caseId: string): Promise<OnChainVote[]> {
    if (this.mode !== "stub") {
      return this.viewContractMethod<OnChainVote[]>("get_votes", { case_id: caseId });
    }
    return this.votes.get(caseId) ?? [];
  }

  public async getBids(caseId: string): Promise<OnChainBid[]> {
    if (this.mode !== "stub") {
      return this.viewContractMethod<OnChainBid[]>("get_bids", { case_id: caseId });
    }
    return this.bids.get(caseId) ?? [];
  }
}
