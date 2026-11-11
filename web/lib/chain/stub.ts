import { hashCanonical } from "../hash";
import { ACCOUNTS, CASES, CONFIG, DONATIONS, NGOS, POOL_TOTALS, PROOFS, voteRecordFor } from "../stub/data";
import type { Bid, Case, DeliveryVote, EvidenceBundle, Pool, Vote, VoteRecord } from "../types";
import type { ChainReader } from "./index";

interface StubStore {
  cases: Case[];
  votes: Map<string, Vote[]>;
  bids: Map<string, Bid[]>;
  delivery: Map<string, DeliveryVote[]>;
  evidence: Map<string, EvidenceBundle | VoteRecord | Record<string, unknown>>;
}

const toNs = (iso: string) => (BigInt(Date.parse(iso)) * BigInt(1_000_000)).toString();
const sampleTx = (seed: string) => `sample-${seed}`;

let store: Promise<StubStore> | null = null;

async function build(): Promise<StubStore> {
  const s: StubStore = { cases: [], votes: new Map(), bids: new Map(), delivery: new Map(), evidence: new Map() };

  for (const seed of CASES) {
    const bundleHash = await hashCanonical(seed.bundle);
    s.evidence.set(bundleHash, seed.bundle);
    const proof = PROOFS[seed.case.id];
    const proofHash = proof ? await hashCanonical(proof) : null;
    if (proof && proofHash) s.evidence.set(proofHash, proof);
    s.cases.push({
      ...seed.case,
      bundle_hash: bundleHash,
      proof_hash: proofHash,
      proof_uri: proofHash ? `/api/evidence/${proofHash}` : null,
    });

    const votes: Vote[] = [];
    for (const v of seed.votes) {
      const record = voteRecordFor(seed.case.id, v, seed.bundle);
      const evidenceHash = await hashCanonical(record);
      s.evidence.set(evidenceHash, record);
      votes.push({
        role: v.role,
        verifier: ACCOUNTS[v.role],
        verdict: v.verdict,
        confidence_bps: v.confidence_bps,
        tier: v.tier ?? 0,
        evidence_hash: evidenceHash,
        attestation_hash: null,
        at: toNs(v.at),
        tx_hash: sampleTx(`${seed.case.id}-${v.role}`),
      });
    }
    s.votes.set(seed.case.id, votes);
    s.bids.set(seed.case.id, seed.bids.map((b) => ({ ...b, tx_hash: sampleTx(`${seed.case.id}-bid-${b.ngo}`) })));

    const delivery: DeliveryVote[] = [];
    for (const d of seed.delivery) {
      const record = { case_id: seed.case.id, agent: d.role, model: "sample", ok: d.ok, reasoning: d.reasoning };
      const evidenceHash = await hashCanonical(record);
      s.evidence.set(evidenceHash, record);
      delivery.push({
        role: d.role,
        verifier: ACCOUNTS[d.role],
        ok: d.ok,
        evidence_hash: evidenceHash,
        at: toNs(d.at),
        tx_hash: sampleTx(`${seed.case.id}-delivery-${d.role}`),
      });
    }
    s.delivery.set(seed.case.id, delivery);
  }

  s.cases.sort((a, b) => (BigInt(b.opened_at) > BigInt(a.opened_at) ? 1 : -1));
  return s;
}

function getStore(): Promise<StubStore> {
  store ??= build();
  return store;
}

export async function getStubEvidence(hash: string) {
  return (await getStore()).evidence.get(hash) ?? null;
}

export const stubChain: ChainReader = {
  async getConfig() {
    return CONFIG;
  },
  async getPool(): Promise<Pool> {
    const { cases } = await getStore();
    let paid = BigInt(0);
    let reserved = BigInt(0);
    for (const c of cases) {
      const casePaid = BigInt(c.tranche1_paid) + BigInt(c.tranche2_paid);
      paid += casePaid;
      if (c.status === "Awarded" || c.status === "ProofSubmitted") reserved += BigInt(c.award_amount) - casePaid;
    }
    const balance = BigInt(POOL_TOTALS.donated) - paid;
    return {
      balance: balance.toString(),
      reserved: reserved.toString(),
      available: (balance - reserved).toString(),
      disbursed_today: "600000000",
      donors_count: POOL_TOTALS.donors_count,
    };
  },
  async listCases({ from = 0, limit = 50, status } = {}) {
    const { cases } = await getStore();
    return cases.filter((c) => !status || c.status === status).slice(from, from + limit);
  },
  async getCase(id) {
    return (await getStore()).cases.find((c) => c.id === id) ?? null;
  },
  async getVotes(id) {
    return (await getStore()).votes.get(id) ?? [];
  },
  async getBids(id) {
    return (await getStore()).bids.get(id) ?? [];
  },
  async getDeliveryVotes(id) {
    return (await getStore()).delivery.get(id) ?? [];
  },
  async getNgo(accountId) {
    const ngo = NGOS[accountId];
    if (!ngo) return null;
    const { name: _name, ...rest } = ngo;
    return rest;
  },
  async getDonations(from = 0, limit = 20) {
    return DONATIONS.slice(from, from + limit);
  },
};
