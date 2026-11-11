import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Countdown } from "@/components/Countdown";
import { HashCheck } from "@/components/HashCheck";
import { AccountLink, TxLink } from "@/components/Links";
import { SimulatedTag } from "@/components/ModeBadges";
import { Stamp } from "@/components/Stamp";
import { StatusTag } from "@/components/StatusTag";
import { VoteSlip } from "@/components/VoteSlip";
import { chain } from "@/lib/chain";
import { config } from "@/lib/config";
import { getEvidence } from "@/lib/evidence";
import { formatAmount, formatTime, incidentLabel, nanosToDate, roleLabel, shortHash } from "@/lib/format";
import type { Bid, Case, ContractConfig, DeliveryVote, EvidenceBundle, Role, Vote, VoteRecord } from "@/lib/types";

const ROLES: Role[] = ["geo", "fact", "sev", "red"];
const FUNDED: Case["status"][] = ["Verified", "Bidding", "Awarded", "ProofSubmitted", "Delivered"];

function Explanation({ c, votes, cfg }: { c: Case; votes: Vote[]; cfg: ContractConfig }) {
  const yes = votes.filter((v) => v.verdict === "Yes").length;
  const no = votes.filter((v) => v.verdict === "No").length;
  const tierCap = cfg.tier_cap[c.tier - 1];

  let title: string;
  let lines: string[];
  if (FUNDED.includes(c.status)) {
    title = "Why was this funded?";
    lines = [
      `${yes} of 4 verifiers voted yes. The contract needs 3.`,
      `The severity verifier set tier ${c.tier}. The contract capped spending at ${formatAmount(c.cap)}: the lowest of the tier ${c.tier} limit (${formatAmount(tierCap)}), ${cfg.max_case_bps / 100}% of the available pool, and what was left of the daily limit (${formatAmount(cfg.daily_limit)}).`,
      `The money is paid in two parts: ${cfg.tranche1_bps / 100}% when the case is awarded, the rest after the delivery check passes.`,
    ];
  } else if (c.status === "Rejected") {
    title = "Why was this rejected?";
    lines = [
      `${no} of 4 verifiers voted no. Two no votes are enough to reject a case.`,
      "No money was reserved or paid. The reasons each verifier gave are below.",
    ];
  } else if (c.status === "NeedsReview") {
    title = "Why does this need a person?";
    lines = [
      `All four verifiers voted, but neither rule was met: ${yes} yes (3 needed to fund) and ${no} no (2 needed to reject).`,
      "A registered coordinator now has to confirm or reject it. No money moves until then.",
    ];
  } else if (c.status === "Open") {
    title = "Waiting for votes";
    lines = [`${votes.length} of 4 verifiers have voted. The contract decides as soon as a rule is met.`];
  } else {
    title = "Expired";
    lines = ["The deadline passed. Any money held for this case went back to the pool."];
  }

  return (
    <section className="rounded-md border-l-4 border-tarp bg-paper p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <ul className="mt-3 max-w-[70ch] space-y-2 leading-relaxed">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

interface Step {
  title: string;
  done: boolean;
  detail?: React.ReactNode;
}

function Timeline({ c, votes, bids, delivery }: { c: Case; votes: Vote[]; bids: Bid[]; delivery: DeliveryVote[] }) {
  const reachedBidding = FUNDED.includes(c.status) && c.status !== "Verified";
  const awarded = ["Awarded", "ProofSubmitted", "Delivered"].includes(c.status);
  const proofIn = ["ProofSubmitted", "Delivered"].includes(c.status);
  const decided = c.status !== "Open";

  const steps: Step[] = [
    { title: "Reports clustered into a case", done: true, detail: <>Opened {formatTime(c.opened_at)}</> },
    {
      title: "Four verifiers vote",
      done: votes.length === 4 || decided,
      detail: <>{votes.length} of 4 votes in</>,
    },
    {
      title: decided ? `Contract decision: ${c.status === "Rejected" ? "rejected" : c.status === "NeedsReview" ? "needs human review" : "verified"}` : "Contract decision",
      done: decided,
    },
  ];

  if (c.status !== "Rejected" && c.status !== "NeedsReview") {
    steps.push(
      {
        title: "NGOs bid to respond",
        done: reachedBidding,
        detail: reachedBidding ? (
          c.status === "Bidding" ? (
            <>
              {bids.length} bids so far. Bidding <Countdown endsAtMs={nanosToDate(c.bidding_ends_at).getTime()} endedText="closed, waiting for someone to close it" />
            </>
          ) : (
            <>{bids.length} bids</>
          )
        ) : undefined,
      },
      {
        title: "Award and first payment",
        done: awarded,
        detail: awarded ? (
          <>
            Awarded {formatAmount(c.award_amount)} to <AccountLink id={c.winner!} />. Paid {formatAmount(c.tranche1_paid)} now.
          </>
        ) : undefined,
      },
      { title: "NGO submits proof of delivery", done: proofIn },
      {
        title: "Verifiers check delivery",
        done: delivery.length > 0,
        detail: delivery.length > 0 ? <>{delivery.filter((d) => d.ok).length} of {delivery.length} said delivery checks out. 2 needed.</> : undefined,
      },
      {
        title: "Second payment",
        done: c.status === "Delivered",
        detail: c.status === "Delivered" ? <>Paid {formatAmount(c.tranche2_paid)}</> : undefined,
      },
    );
  }

  return (
    <ol className="relative ml-3 border-l-2 border-line">
      {steps.map((s, i) => (
        <li key={s.title} className="relative pb-6 pl-6 last:pb-0">
          <span
            className={`absolute top-0.5 -left-[0.8rem] flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              s.done ? "bg-tarp text-white" : "border-2 border-line bg-chalk text-muted"
            }`}
            aria-hidden
          >
            {i + 1}
          </span>
          <p className={`font-semibold ${s.done ? "" : "text-muted"}`}>
            {s.title}
            {!s.done && <span className="sr-only"> (not reached yet)</span>}
          </p>
          {s.detail && <p className="mt-0.5 text-sm text-muted">{s.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

function Bids({ c, bids }: { c: Case; bids: Bid[] }) {
  if (bids.length === 0) return null;
  const sorted = [...bids].sort((a, b) => (BigInt(a.ask) < BigInt(b.ask) ? -1 : 1));
  return (
    <section>
      <h2 className="font-display text-3xl font-bold">Bids</h2>
      <p className="mt-1 text-sm text-muted">
        The lowest ask under the cap wins, if the NGO meets the reputation and delivery time rules.
      </p>
      <div className="mt-4 overflow-x-auto rounded-md border border-line bg-paper">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Responder</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Ask</th>
              <th scope="col" className="px-4 py-3 font-medium">Can deliver in</th>
              <th scope="col" className="px-4 py-3 font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.ngo} className={`border-b border-line last:border-0 ${b.ngo === c.winner ? "bg-verified/10" : ""}`}>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <AccountLink id={b.ngo} />
                    {b.simulated && <SimulatedTag />}
                    {b.ngo === c.winner && <span className="font-semibold text-verified">Won</span>}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatAmount(b.ask)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{b.eta_hours} hours</td>
                <td className="px-4 py-3">
                  <TxLink hash={b.tx_hash} label="Bid tx" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Delivery({ c, delivery }: { c: Case; delivery: DeliveryVote[] }) {
  if (!c.proof_hash) return null;
  return (
    <section>
      <h2 className="font-display text-3xl font-bold">Proof of delivery</h2>
      <div className="mt-4 rounded-md border border-line bg-paper p-5">
        <p className="text-sm">
          Proof record <span className="font-semibold">{shortHash(c.proof_hash, 10)}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {c.proof_uri && (
            <a href={c.proof_uri} className="text-tarp underline underline-offset-2">
              Open the proof
            </a>
          )}
          <HashCheck hash={c.proof_hash} />
        </div>
        {delivery.length > 0 ? (
          <ul className="mt-4 divide-y divide-line">
            {delivery.map((d) => (
              <li key={d.role} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-semibold">{roleLabel[d.role].name}</span>
                <span className={d.ok ? "font-semibold text-verified" : "font-semibold text-stamp"}>
                  {d.ok ? "Delivery checks out" : "Doesn't check out"}
                </span>
                <span className="flex gap-4">
                  <TxLink hash={d.tx_hash} label="Vote tx" />
                  <HashCheck hash={d.evidence_hash} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">The verifiers haven&apos;t checked this proof yet.</p>
        )}
      </div>
    </section>
  );
}

function Evidence({ c, bundle }: { c: Case; bundle: EvidenceBundle | null }) {
  return (
    <section>
      <h2 className="font-display text-3xl font-bold">Evidence</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Reports stay off chain to protect the people who sent them. Only this record&apos;s hash is stored on NEAR, so
        anyone can check that it hasn&apos;t been changed since the vote.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span>
          Bundle hash <span className="font-semibold break-all">{c.bundle_hash}</span>
        </span>
        <HashCheck hash={c.bundle_hash} label="Check the evidence bundle" />
      </div>

      {bundle ? (
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-xl font-bold">
              Field reports ({bundle.reports.length} from {bundle.source_diversity} sources)
            </h3>
            <ul className="mt-3 space-y-3">
              {bundle.reports.map((r, i) => (
                <li key={i} className="rounded border border-line bg-paper p-3 text-sm">
                  <p className="leading-relaxed">{r.text}</p>
                  <p className="mt-1 text-xs text-muted">
                    {r.source_type.replace("_", " ")}, sender {r.source_id_hash.slice(0, 8)}, {new Date(r.ts).toUTCString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-xl font-bold">Outside sources checked</h3>
            <ul className="mt-3 space-y-3">
              {bundle.external_evidence.map((e) => (
                <li key={e.tool + e.raw_hash} className="rounded border border-line bg-paper p-3 text-sm">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{e.tool}</span>
                    <span
                      className={
                        e.supports === "yes" ? "text-verified" : e.supports === "no" ? "text-stamp" : "text-muted"
                      }
                    >
                      {e.supports === "yes" ? "Supports" : e.supports === "no" ? "Contradicts" : "Unclear"}
                    </span>
                  </p>
                  <p className="mt-1 leading-relaxed">{e.claim}</p>
                  <a href={e.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-tarp underline">
                    Source
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-line bg-paper p-4 text-sm text-muted">
          The evidence record isn&apos;t in storage, so it can&apos;t be shown or checked here.
        </p>
      )}
    </section>
  );
}

async function CaseFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chain.getCase(decodeURIComponent(id));
  if (!c) notFound();

  const [votes, bids, delivery, cfg, bundle] = await Promise.all([
    chain.getVotes(c.id),
    chain.getBids(c.id),
    chain.getDeliveryVotes(c.id),
    chain.getConfig(),
    getEvidence(c.bundle_hash) as Promise<EvidenceBundle | null>,
  ]);
  const records = await Promise.all(votes.map((v) => getEvidence(v.evidence_hash) as Promise<VoteRecord | null>));

  return (
    <div className="space-y-12">
      <AutoRefresh enabled={config.chainMode !== "stub"} />
      <header className="relative">
        <Link href="/cases" className="text-sm font-semibold text-tarp underline underline-offset-4">
          All cases
        </Link>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-extrabold break-all sm:text-5xl">{c.id}</h1>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-muted">Incident</dt>
                <dd className="font-semibold">{bundle?.incident_type ? incidentLabel[bundle.incident_type] : "Unknown"}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusTag status={c.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tier</dt>
                <dd className="font-semibold">{c.tier > 0 ? c.tier : `Requested ${c.requested_tier}`}</dd>
              </div>
              <div>
                <dt className="text-muted">Area</dt>
                <dd className="font-semibold">Geohash {c.geohash}</dd>
              </div>
              <div>
                <dt className="text-muted">Opened</dt>
                <dd className="font-semibold">{formatTime(c.opened_at)}</dd>
              </div>
            </dl>
          </div>
          <div className="shrink-0 sm:pt-2 sm:pr-4">
            <Stamp status={c.status} land />
          </div>
        </div>
      </header>

      <Explanation c={c} votes={votes} cfg={cfg} />

      <section>
        <h2 className="font-display text-3xl font-bold">The four votes</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">
          Each verifier signs with its own NEAR account and key. In this demo the LifeLine team runs all four.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {ROLES.map((role) => {
            const i = votes.findIndex((v) => v.role === role);
            return <VoteSlip key={role} role={role} vote={votes[i]} record={i >= 0 ? records[i] : null} />;
          })}
        </div>
      </section>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section>
          <h2 className="font-display text-3xl font-bold">What happened</h2>
          <div className="mt-5">
            <Timeline c={c} votes={votes} bids={bids} delivery={delivery} />
          </div>
        </section>
        <div className="space-y-12">
          <Bids c={c} bids={bids} />
          <Delivery c={c} delivery={delivery} />
        </div>
      </div>

      <Evidence c={c} bundle={bundle} />
    </div>
  );
}

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted">Reading the case from the contract…</p>}>
      <CaseFile params={params} />
    </Suspense>
  );
}
