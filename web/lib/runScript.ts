import { sealFor } from "./caseView";
import { chain } from "./chain";
import { config } from "./config";
import { getEvidence } from "./evidence";
import { txUrl } from "./explorer";
import { formatAmount, formatAmountCompact, formatClock, incidentLabel, percent, ROLES, shortAccount, shortTx, sourceTypeLabel } from "./format";
import { RULES } from "./rules";
import { STUB_SCENARIO_CASES } from "./stub/data";
import { type RunScript, SCENARIOS } from "./scenarios";

export type { RunScript } from "./scenarios";
import type { Case, EvidenceBundle, VoteRecord } from "./types";

const big = (v: string | undefined) => BigInt(v || "0");

function findCase(cases: Case[], key: string): Case | undefined {
  const suffix = `-${key.toLowerCase()}`;
  const fromRunner = cases.filter((c) => c.id.toLowerCase().endsWith(suffix)).sort((a, b) => (big(String(b.opened_at)) > big(String(a.opened_at)) ? 1 : -1))[0];
  if (fromRunner) return fromRunner;
  return config.chainMode === "stub" ? cases.find((c) => c.id === STUB_SCENARIO_CASES[key]) : undefined;
}

async function buildScript(key: string, name: string, c: Case): Promise<RunScript> {
  const [votes, bids, delivery, cfg, bundle] = await Promise.all([
    chain.getVotes(c.id),
    chain.getBids(c.id),
    chain.getDeliveryVotes(c.id),
    chain.getConfig(),
    getEvidence(c.bundle_hash).catch(() => null) as Promise<EvidenceBundle | null>,
  ]);
  const records = await Promise.all(votes.map((v) => getEvidence(v.evidence_hash).catch(() => null) as Promise<VoteRecord | null>));
  const proof = c.proof_hash ? ((await getEvidence(c.proof_hash).catch(() => null)) as Record<string, unknown> | null) : null;

  const seal = sealFor(c, votes);
  const funded = !["Open", "Rejected", "NeedsReview"].includes(c.status);
  const yes = votes.filter((v) => v.verdict === "Yes").length;
  const no = votes.filter((v) => v.verdict === "No").length;
  const sources = bundle ? new Set(bundle.reports.map((r) => r.source_id_hash)).size : 0;
  const incident = bundle?.incident_type ? incidentLabel[bundle.incident_type] : "Incident";

  const events: RunScript["events"] = [];
  for (const b of [...bids].sort((a, z) => (big(String(a.at)) < big(String(z.at)) ? -1 : 1))) {
    events.push({ kind: "bid", title: `Bid · ${shortAccount(b.ngo, 22)}`, detail: `${b.eta_hours} hours${b.simulated ? " · simulated" : ""}`, amount: formatAmount(b.ask) });
  }
  if (c.winner && big(c.tranche1_paid) > BigInt(0)) {
    events.push({ kind: "pay", title: `Awarded to ${shortAccount(c.winner, 22)}`, detail: `First payment, ${percent(cfg.tranche1_bps)}`, amount: formatAmount(c.tranche1_paid) });
  }
  if (c.proof_hash) {
    const reached = typeof proof?.households_reached === "number" ? proof.households_reached : null;
    const plan = typeof proof?.planned_households === "number" ? proof.planned_households : null;
    events.push({
      kind: "proof",
      title: "Proof of delivery",
      detail: reached !== null ? `${reached.toLocaleString("en-US")} households reached${plan !== null ? ` · plan ${plan.toLocaleString("en-US")}` : ""}` : "Submitted",
      amount: null,
    });
  }
  if (delivery.length > 0) {
    const ok = delivery.filter((d) => d.ok).length;
    const bad = delivery.length - ok;
    if (ok >= RULES.deliveryAgree) {
      events.push({ kind: "ok", title: "Delivery checks out", detail: `${ok} of 4 verifiers agree · needs ${RULES.deliveryAgree}`, amount: null });
    } else if (bad > 4 - RULES.deliveryAgree) {
      events.push({ kind: "no", title: "Delivery doesn't check out", detail: `${bad} of 4 say no`, amount: null });
      events.push({ kind: "hold", title: "Second payment withheld", detail: `${formatAmount(big(c.award_amount) - big(c.tranche1_paid))} stays in the pool`, amount: null });
    }
  }
  if (c.status === "Delivered" && big(c.tranche2_paid) > BigInt(0)) {
    events.push({ kind: "pay", title: "Second payment", detail: "Case delivered", amount: formatAmount(c.tranche2_paid) });
  }

  return {
    key,
    name,
    caseId: c.id,
    title: `${incident}, ${bundle ? `${bundle.reports.length} reports` : "reports"}`,
    meta: bundle ? `${bundle.reports.length} reports · ${sources} ${sources === 1 ? "source" : "sources"}${bundle.requested_tier ? ` · tier ${bundle.requested_tier} requested` : ""}` : "Evidence not in storage",
    reports: (bundle?.reports ?? []).slice(0, 4).map((r) => ({ text: r.text, meta: `${sourceTypeLabel[r.source_type] ?? r.source_type} · anon-${r.source_id_hash.slice(0, 4)} · ${formatClock(r.ts)}` })),
    votes: ROLES.flatMap((role) => {
      const i = votes.findIndex((v) => v.role === role);
      if (i < 0) return [];
      const v = votes[i];
      return [{ role, verdict: v.verdict, confidence: Math.round(v.confidence_bps / 100), reason: records[i]?.reasoning ?? null, tx: v.tx_hash ? shortTx(v.tx_hash) : null, txUrl: txUrl(v.tx_hash) }];
    }),
    decision: {
      word: seal.word === "Delivered" ? "Funded" : seal.word,
      tone: funded ? "funded" : seal.tone,
      sub: funded ? `cap ${formatAmountCompact(c.cap)}` : c.status === "Rejected" ? "nothing paid" : seal.sub,
      funded,
      line: funded
        ? `Funded with ${yes} yes votes. Cap ${formatAmount(c.cap)}: the lowest of the tier limit, ${percent(cfg.max_case_bps)} of the pool and the daily limit left.`
        : c.status === "Rejected"
          ? `Rejected with ${no} no votes. No money was reserved or paid.`
          : c.status === "NeedsReview"
            ? "Neither rule was met. A coordinator decides."
            : "Still counting votes.",
    },
    events,
  };
}

export async function loadRunScripts(): Promise<{ scripts: RunScript[]; missing: string[] }> {
  const cases = await chain.listCases({ limit: 200 });
  const found = SCENARIOS.map((s) => ({ s, c: findCase(cases, s.key) }));
  const scripts = await Promise.all(found.filter((f) => f.c).map((f) => buildScript(f.s.key, f.s.name, f.c!)));
  return { scripts, missing: found.filter((f) => !f.c).map((f) => f.s.key) };
}
