import { txUrl } from "../explorer";
import { formatAmount, formatAmountCompact, formatClock, incidentLabel, percent, ROLES, shortAccount, shortTx, sourceTypeLabel } from "../format";
import { RULES } from "../rules";
import type { RunScript } from "../scenarios";
import type { CaseStatus, Role, Verdict } from "../types";

// The parts of B's SwarmTrace (agents/src/schemas) the run view reads.
export interface SwarmTrace {
  scenario_id?: string;
  case_id: string;
  mode: "replay" | "live";
  chain_mode: "stub" | "testnet" | "mainnet";
  bundle_hash: string;
  bundle: {
    incident_type?: string;
    requested_tier: number;
    reports: { source_type: string; source_id_hash: string; text: string; ts: string }[];
    source_diversity: number;
  };
  submit_tx_hash: string;
  verifier_steps: {
    role: Role;
    signer_account: string;
    vote_record: { model: string; verdict: Verdict; confidence_bps: number; tier: number; reasoning: string };
    evidence_hash: string;
    tx_hash: string;
  }[];
  post_vote_status: CaseStatus;
  cap_amount?: string;
  bidding_trace?: { bids: { ngo: string; ask: string; eta_hours: number; tx_hash: string; simulated: boolean }[]; winner?: string; award_amount?: string; tranche1_paid?: string };
  delivery_trace?: { proof_hash: string; votes: { role: Role; ok: boolean; reasoning: string; tx_hash: string }[]; tranche2_paid?: string };
  final_status: CaseStatus;
}

export interface ProofSummary {
  households_reached?: number;
  planned_households?: number;
}

const big = (v: string | undefined) => BigInt(v || "0");

// Verifiers that crashed fall back to Abstain with this model name. A run like that isn't a real result.
export function brokenVerifiers(trace: SwarmTrace): Role[] {
  return trace.verifier_steps.filter((s) => s.vote_record.model.includes("error-fallback")).map((s) => s.role);
}

export function traceToScript(trace: SwarmTrace, name: string, proof: ProofSummary | null = null): RunScript {
  const b = trace.bundle;
  const incident = b.incident_type ? incidentLabel[b.incident_type] ?? "Incident" : "Incident";
  const sources = new Set(b.reports.map((r) => r.source_id_hash)).size;
  const yes = trace.verifier_steps.filter((s) => s.vote_record.verdict === "Yes").length;
  const no = trace.verifier_steps.filter((s) => s.vote_record.verdict === "No").length;
  const status = trace.post_vote_status;
  const funded = status === "Bidding" || status === "Verified";

  const events: RunScript["events"] = [];
  const bt = trace.bidding_trace;
  if (bt) {
    for (const bid of bt.bids) {
      events.push({ kind: "bid", title: `Bid · ${shortAccount(bid.ngo, 22)}`, detail: `${bid.eta_hours} hours${bid.simulated ? " · simulated" : ""}`, amount: formatAmount(bid.ask) });
    }
    if (bt.winner && big(bt.tranche1_paid) > BigInt(0)) {
      const share = big(bt.award_amount) > BigInt(0) ? ` ${percent(Number((big(bt.tranche1_paid) * BigInt(10000)) / big(bt.award_amount)))}` : "";
      events.push({ kind: "pay", title: `Awarded to ${shortAccount(bt.winner, 22)}`, detail: `First payment,${share}`, amount: formatAmount(bt.tranche1_paid) });
    }
  }
  const dt = trace.delivery_trace;
  if (dt) {
    const reached = proof?.households_reached;
    const plan = proof?.planned_households;
    events.push({
      kind: "proof",
      title: "Proof of delivery",
      detail: reached !== undefined ? `${reached.toLocaleString("en-US")} households reached${plan !== undefined ? ` · plan ${plan.toLocaleString("en-US")}` : ""}` : "Submitted",
      amount: null,
    });
    const ok = dt.votes.filter((v) => v.ok).length;
    const bad = dt.votes.length - ok;
    if (ok >= RULES.deliveryAgree) {
      events.push({ kind: "ok", title: "Delivery checks out", detail: `${ok} of 4 verifiers agree · needs ${RULES.deliveryAgree}`, amount: null });
    } else {
      events.push({ kind: "no", title: "Delivery doesn't check out", detail: `${bad} of 4 say no`, amount: null });
    }
    if (big(dt.tranche2_paid) > BigInt(0)) {
      events.push({ kind: "pay", title: "Second payment", detail: "Case delivered", amount: formatAmount(dt.tranche2_paid) });
    } else if (bt?.award_amount && ok < RULES.deliveryAgree) {
      events.push({ kind: "hold", title: "Second payment withheld", detail: `${formatAmount(big(bt.award_amount) - big(bt.tranche1_paid))} stays in the pool`, amount: null });
    }
  }

  const cap = trace.cap_amount && big(trace.cap_amount) > BigInt(0) ? trace.cap_amount : null;
  return {
    key: trace.scenario_id ?? "custom",
    name,
    caseId: trace.case_id,
    title: `${incident}, ${b.reports.length} reports`,
    meta: `${b.reports.length} reports · ${sources} ${sources === 1 ? "source" : "sources"} · tier ${b.requested_tier} requested`,
    reports: b.reports.slice(0, 4).map((r) => ({ text: r.text, meta: `${sourceTypeLabel[r.source_type] ?? r.source_type} · anon-${r.source_id_hash.slice(0, 4)} · ${formatClock(r.ts)}` })),
    votes: ROLES.flatMap((role) => {
      const s = trace.verifier_steps.find((x) => x.role === role);
      if (!s) return [];
      return [{ role, verdict: s.vote_record.verdict, confidence: Math.round(s.vote_record.confidence_bps / 100), reason: s.vote_record.reasoning, tx: shortTx(s.tx_hash), txUrl: txUrl(s.tx_hash) }];
    }),
    decision: funded
      ? {
          word: "Funded",
          tone: "funded",
          sub: cap ? `cap ${formatAmountCompact(cap)}` : "funded",
          funded: true,
          line: `Funded with ${yes} yes votes.${cap ? ` Cap ${formatAmount(cap)}: the lowest of the tier limit, the pool share and the daily limit left.` : ""}`,
        }
      : status === "Rejected"
        ? { word: "Rejected", tone: "rejected", sub: "nothing paid", funded: false, line: `Rejected with ${no} no votes. No money was reserved or paid.` }
        : status === "NeedsReview"
          ? { word: "Review", tone: "review", sub: `${yes} yes · ${no} no`, funded: false, line: "Neither rule was met. A coordinator decides." }
          : { word: "Counting", tone: "progress", sub: `${trace.verifier_steps.length} of 4 voted`, funded: false, line: "Still counting votes." },
    events,
  };
}
