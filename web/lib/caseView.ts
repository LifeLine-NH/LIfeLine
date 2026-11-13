import { config } from "./config";
import { formatAmount, formatClock, formatShort, nanosToMs, percent, ROLES, statusTone, type StatusTone } from "./format";
import { RULES } from "./rules";
import type { Bid, Case, CaseStatus, ContractConfig, DeliveryVote, EvidenceBundle, Verdict, Vote } from "./types";

export const FUNDED: CaseStatus[] = ["Verified", "Bidding", "Awarded", "ProofSubmitted", "Delivered"];
const AWARDED: CaseStatus[] = ["Awarded", "ProofSubmitted", "Delivered"];

const big = (v: string | undefined) => BigInt(v || "0");

// " (40%)": the share of the award a payment was, computed from the amounts themselves.
function shareOf(part: string, whole: string): string {
  const w = big(whole);
  return w > BigInt(0) ? ` (${percent(Number((big(part) * BigInt(10000)) / w))})` : "";
}

export function tally(votes: Vote[]) {
  const verdicts: (Verdict | null)[] = ROLES.map((r) => votes.find((v) => v.role === r)?.verdict ?? null);
  return {
    verdicts,
    yes: votes.filter((v) => v.verdict === "Yes").length,
    no: votes.filter((v) => v.verdict === "No").length,
    abs: votes.filter((v) => v.verdict === "Abstain").length,
    count: votes.length,
  };
}

export function tierCap(cfg: ContractConfig, tier: number): string | null {
  return tier > 0 ? (cfg.tier_cap[tier - 1] ?? null) : null;
}

// The word in the centre of the seal and the line under it.
export function sealFor(c: Case, votes: Vote[]): { word: string; tone: StatusTone; sub: string } {
  const t = tally(votes);
  const tone = statusTone[c.status];
  switch (c.status) {
    case "Open":
      return { word: "Verifying", tone, sub: `${t.count} of 4 voted` };
    case "Rejected":
      return { word: "Rejected", tone, sub: `${t.no} of 4 no · ${RULES.rejectAtNo} reject` };
    case "NeedsReview":
      return { word: "Review", tone, sub: `${t.yes} yes · ${t.no} no · ${t.abs} abstained` };
    case "Expired":
      return { word: "Expired", tone, sub: "Returned to pool" };
    case "Delivered":
      return { word: "Delivered", tone, sub: `${t.yes} of 4 yes · needs ${RULES.fundAtYes}` };
    case "Bidding":
      return { word: "Funded", tone, sub: "Open for bids" };
    default:
      return { word: "Funded", tone, sub: `${t.yes} of 4 yes · needs ${RULES.fundAtYes}` };
  }
}

// What the amount column shows: the award, or the cap until there is one.
export function amountFor(c: Case): { amount: string | null; kind: string } {
  if (c.status === "Rejected") return { amount: formatAmount("0", false), kind: "nothing paid" };
  if (big(c.award_amount) > BigInt(0)) return { amount: formatAmount(c.award_amount, false), kind: `${config.tokenSymbol} award` };
  if (big(c.cap) > BigInt(0)) {
    return { amount: formatAmount(c.cap, false), kind: c.status === "Expired" ? "returned to pool" : `${config.tokenSymbol} cap` };
  }
  return { amount: null, kind: c.status === "NeedsReview" ? "waiting for a coordinator" : "not funded yet" };
}

export type Panel = "cap" | "caught" | "rules" | null;

export interface Explanation {
  title: string;
  lines: string[];
  panel: Panel;
}

export function explain(c: Case, votes: Vote[], cfg: ContractConfig, bundle: EvidenceBundle | null): Explanation {
  const t = tally(votes);
  const share = percent(cfg.max_case_bps);
  const first = percent(cfg.tranche1_bps);

  if (FUNDED.includes(c.status)) {
    const tc = tierCap(cfg, c.tier);
    const paidNote =
      c.status === "Delivered"
        ? " Both payments have been made."
        : c.status === "Awarded" || c.status === "ProofSubmitted"
          ? " The first payment has been made."
          : "";
    return {
      title: "Why was this funded?",
      panel: "cap",
      lines: [
        `${t.yes} of 4 verifiers voted yes. The contract needs ${RULES.fundAtYes}.`,
        `The severity verifier set tier ${c.tier}. The contract capped spending at ${formatAmount(c.cap)}: the lowest of the tier ${c.tier} limit${tc ? ` (${formatAmount(tc)})` : ""}, ${share} of the available pool, and what was left of the daily limit (${formatAmount(cfg.daily_limit)} a day).`,
        `The money is paid in two parts: ${first} when the case is awarded, the rest after the delivery check passes.${paidNote}`,
      ],
    };
  }

  if (c.status === "Rejected") {
    const contra = bundle?.external_evidence.filter((e) => e.supports === "no") ?? [];
    return {
      title: "Why was this rejected?",
      panel: "caught",
      lines: [
        `${t.no} of 4 verifiers voted no. ${RULES.rejectAtNo} no votes are enough to reject a case.`,
        contra.length > 0
          ? `${contra.length === 1 ? "One outside source contradicts" : `${contra.length} outside sources contradict`} the reports: ${contra.map((e) => e.tool).join(", ")}.`
          : "The reasons each verifier gave are in the votes below.",
        "No money was reserved or paid.",
      ],
    };
  }

  if (c.status === "NeedsReview") {
    return {
      title: "Why does this need a person?",
      panel: "rules",
      lines: [
        `${t.yes} ${t.yes === 1 ? "verifier" : "verifiers"} voted yes, ${t.no} voted no and ${t.abs} abstained.`,
        `A case needs ${RULES.fundAtYes} yes votes to be funded or ${RULES.rejectAtNo} no votes to be rejected. Neither rule was met.`,
        "A coordinator must decide. No money moves until they do.",
      ],
    };
  }

  if (c.status === "Open") {
    return {
      title: "Waiting for votes",
      panel: null,
      lines: [
        `Waiting for votes. ${t.count} of 4 verifiers have voted.`,
        `The contract decides as soon as ${RULES.fundAtYes} yes votes or ${RULES.rejectAtNo} no votes arrive. Until then no money is reserved.`,
        config.chainMode === "stub" ? "This is sample data, so no new votes will arrive." : "New votes appear here on their own. You don't need to reload.",
      ],
    };
  }

  // Expired: either nobody bid, or the winner missed the proof deadline.
  if (!c.winner) {
    return {
      title: "Why did this expire?",
      panel: null,
      lines: [
        `${t.yes} of 4 verifiers voted yes, and the contract capped spending at ${formatAmount(c.cap)}.`,
        `No responder placed a bid before the deadline (${formatShort(c.bidding_ends_at)} UTC).`,
        `The deadline passed, so the ${formatAmount(c.cap)} went back to the pool. Nothing was paid out.`,
      ],
    };
  }
  const held = big(c.award_amount) - big(c.tranche1_paid);
  return {
    title: "Why did this expire?",
    panel: null,
    lines: [
      `The case was awarded to ${c.winner} for ${formatAmount(c.award_amount)}, and the first payment of ${formatAmount(c.tranche1_paid)} was made.`,
      `No proof of delivery arrived before the deadline (${formatShort(c.proof_deadline)} UTC).`,
      `The remaining ${formatAmount(held)} went back to the pool.`,
    ],
  };
}

export type StepState = "done" | "now" | "todo" | "stop" | "halt" | "back";

export interface TrailStep {
  t: string;
  m?: string;
  state: StepState;
  link?: { label: string; href: string };
  countdownTo?: number;
}

export function trail(
  c: Case,
  votes: Vote[],
  bids: Bid[],
  delivery: DeliveryVote[],
  bundle: EvidenceBundle | null,
): { steps: TrailStep[]; note?: string } {
  const t = tally(votes);
  const lastVote = votes.reduce<Vote | null>((a, v) => (!a || big(String(v.at)) > big(String(a.at)) ? v : a), null);
  const reports = bundle?.reports.length;
  const steps: TrailStep[] = [
    {
      t: "Reports clustered into a case",
      m: `${reports !== undefined ? `${reports} reports · ` : ""}${formatShort(c.opened_at)}`,
      state: "done",
      link: { label: "Evidence", href: "#evidence" },
    },
    {
      t: "Four verifiers vote",
      m: `${t.count} of 4 voted${lastVote ? ` · ${formatClock(lastVote.at)}` : ""}`,
      state: c.status === "Open" ? "now" : "done",
      link: t.count > 0 ? { label: "Votes", href: "#votes" } : undefined,
    },
  ];

  if (c.status === "Open") {
    steps.push({ t: "Contract decision", state: "todo" });
  } else if (c.status === "Rejected") {
    steps.push({ t: "Contract decision", m: "Rejected · nothing reserved", state: "stop" });
    return { steps, note: "Stopped here. A rejected case never opens for bids, and no money left the pool." };
  } else if (c.status === "NeedsReview") {
    steps.push({ t: "Contract decision", m: "Needs a coordinator", state: "halt" });
    return { steps, note: "Waiting for a coordinator to confirm or reject this case." };
  } else {
    steps.push({ t: "Contract decision", m: `Funded · cap ${formatAmount(c.cap)}`, state: "done" });
  }

  const awarded = AWARDED.includes(c.status) || (c.status === "Expired" && !!c.winner);
  if (c.status === "Bidding" || c.status === "Verified") {
    steps.push({ t: "NGOs bid", m: `${bids.length} ${bids.length === 1 ? "bid" : "bids"} so far`, state: "now", countdownTo: c.status === "Bidding" ? nanosToMs(c.bidding_ends_at) : undefined });
  } else if (c.status === "Expired" && !c.winner) {
    steps.push({ t: "NGOs bid", m: "No bids before the deadline", state: "back" });
    return { steps, note: `${formatAmount(c.cap)} went back to the pool on ${formatShort(c.bidding_ends_at)} UTC.` };
  } else if (c.status === "Open") {
    steps.push({ t: "NGOs bid", state: "todo" });
  } else {
    steps.push({ t: "NGOs bid", m: `${bids.length} ${bids.length === 1 ? "bid" : "bids"} · closed ${formatClock(c.bidding_ends_at)}`, state: "done", link: bids.length ? { label: "Bids", href: "#bids" } : undefined });
  }

  steps.push(
    awarded
      ? { t: "Award and first payment", m: `${formatAmount(c.tranche1_paid)}${shareOf(c.tranche1_paid, c.award_amount)}`, state: "done", link: { label: "Bids", href: "#bids" } }
      : { t: "Award and first payment", state: "todo" },
  );

  const proofIn = !!c.proof_hash;
  if (c.status === "Expired") {
    steps.push({ t: "Proof of delivery", m: "Not delivered before the deadline", state: "back" });
    const held = big(c.award_amount) - big(c.tranche1_paid);
    return { steps, note: `${formatAmount(held)} went back to the pool after the proof deadline (${formatShort(c.proof_deadline)} UTC).` };
  }
  steps.push(
    proofIn
      ? { t: "Proof of delivery", m: delivery.length ? formatShort(delivery[0].at) : "Submitted", state: "done", link: { label: "Proof", href: "#proof" } }
      : c.status === "Awarded"
        ? { t: "Proof of delivery", m: `Due ${formatShort(c.proof_deadline)}`, state: "now" }
        : { t: "Proof of delivery", state: "todo" },
  );

  const ok = delivery.filter((d) => d.ok).length;
  const bad = delivery.length - ok;
  const failed = bad > 4 - RULES.deliveryAgree;
  if (c.status === "Delivered") {
    steps.push({ t: "Delivery check", m: `${ok} of 4 agree · needs ${RULES.deliveryAgree}`, state: "done", link: { label: "Votes", href: "#proof" } });
    steps.push({ t: "Second payment", m: `${formatAmount(c.tranche2_paid)}${shareOf(c.tranche2_paid, c.award_amount)}`, state: "done" });
    return { steps };
  }
  if (proofIn && failed) {
    steps.push({ t: "Delivery check", m: `${bad} of ${delivery.length} say it doesn't check out`, state: "stop", link: { label: "Votes", href: "#proof" } });
    steps.push({ t: "Second payment", m: "Withheld", state: "stop" });
    return { steps, note: "The delivery check failed, so the second payment is withheld and stays in the pool." };
  }
  steps.push(
    proofIn ? { t: "Delivery check", m: `${ok} of 4 agree · needs ${RULES.deliveryAgree}`, state: "now" } : { t: "Delivery check", state: "todo" },
    { t: "Second payment", state: "todo" },
  );
  return { steps };
}

// Live cases refresh every few seconds once a real contract is behind the page.
export function isLive(c: Case): boolean {
  return config.chainMode !== "stub" && (c.status === "Open" || c.status === "Bidding" || c.status === "Verified" || c.status === "ProofSubmitted");
}
