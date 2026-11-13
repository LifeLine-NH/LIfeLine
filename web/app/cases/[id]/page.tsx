import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ExplanationCard } from "@/components/case/Explanation";
import { QuorumSeal } from "@/components/case/QuorumSeal";
import { BidsSection, EvidenceSection, PayoutPreview, ProofSection } from "@/components/case/Sections";
import { Trail } from "@/components/case/Trail";
import { VoteCard } from "@/components/case/VoteCard";
import { PageError } from "@/components/ui/PageError";
import { StatusLabel, TierChip } from "@/components/ui/tags";
import { attempt } from "@/lib/attempt";
import { explain, isLive, sealFor, tally, trail } from "@/lib/caseView";
import { chain } from "@/lib/chain";
import { getEvidence } from "@/lib/evidence";
import { formatTime, incidentLabel, ROLES } from "@/lib/format";
import type { Case, EvidenceBundle, VoteRecord } from "@/lib/types";
import { CaseSkeleton } from "./CaseSkeleton";

function headline(c: Case, incident: string): string {
  switch (c.status) {
    case "Rejected":
      return `${incident} report rejected`;
    case "NeedsReview":
      return `${incident} report needs a person`;
    case "Open":
      return `${incident} report being verified`;
    case "Expired":
      return `${incident} case expired`;
    case "Delivered":
      return `${incident} relief delivered`;
    case "Bidding":
    case "Verified":
      return `${incident} relief open for bids`;
    default:
      return `${incident} relief under way`;
  }
}

function tierLabel(c: Case): string {
  if (c.tier > 0) return `Tier ${c.tier}`;
  return c.requested_tier > 0 ? `Tier ${c.requested_tier} requested, not set` : "Tier not set";
}

async function CaseFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await attempt(async () => {
    const c = await chain.getCase(decodeURIComponent(id));
    if (!c) return null;
    const [votes, bids, delivery, cfg] = await Promise.all([chain.getVotes(c.id), chain.getBids(c.id), chain.getDeliveryVotes(c.id), chain.getConfig()]);
    return { c, votes, bids, delivery, cfg };
  });
  if (!res.ok) return <PageError message={res.message} />;
  if (!res.value) notFound();
  const { c, votes, bids, delivery, cfg } = res.value;

  // Evidence lives off chain. If storage is down the onchain record still renders.
  const safe = <T,>(hash: string | null | undefined) => (hash ? (getEvidence(hash).catch(() => null) as Promise<T | null>) : Promise.resolve(null));
  const [bundle, records, proof, deliveryRecords] = await Promise.all([
    safe<EvidenceBundle>(c.bundle_hash),
    Promise.all(votes.map((v) => safe<VoteRecord>(v.evidence_hash))),
    safe<Record<string, unknown>>(c.proof_hash),
    Promise.all(delivery.map((d) => safe<{ reasoning?: string }>(d.evidence_hash))),
  ]);

  const incident = bundle?.incident_type ? incidentLabel[bundle.incident_type] : "Incident";
  const seal = sealFor(c, votes);
  const ex = explain(c, votes, cfg, bundle);
  const path = trail(c, votes, bids, delivery, bundle);
  const live = isLive(c);
  const sources = bundle ? new Set(bundle.reports.map((r) => r.source_id_hash)).size : null;

  return (
    <>
      <AutoRefresh enabled={live} />
      <section style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="wrap flex flex-col gap-6" style={{ paddingTop: 28, paddingBottom: 40 }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Breadcrumb" className="body-s flex min-w-0 items-center gap-2">
              <Link href="/cases">Cases</Link>
              <span className="faint" aria-hidden>
                /
              </span>
              <span className="mono truncate" style={{ color: "var(--ink-2)" }}>
                {c.id}
              </span>
            </nav>
            {live && (
              <span className="cap inline-flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "ll-blink 1.6s infinite" }} />
                Refreshes every 5 seconds
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-12 gap-y-8">
            <div className="flex min-w-0 flex-col gap-4.5" style={{ flex: "1 1 520px" }}>
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusLabel status={c.status} large />
                <TierChip tier={c.tier} label={tierLabel(c)} />
              </div>
              <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 56px)" }}>
                {headline(c, incident)}
              </h1>
              <dl className="m-0 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
                <div>
                  <dt className="cap">Case id</dt>
                  <dd className="mono" style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>
                    {c.id}
                  </dd>
                </div>
                <div>
                  <dt className="cap">Area (geohash)</dt>
                  <dd className="mono" style={{ margin: "4px 0 0" }}>
                    {c.geohash}
                  </dd>
                </div>
                <div>
                  <dt className="cap">Opened</dt>
                  <dd style={{ margin: "4px 0 0", fontWeight: 550 }}>{formatTime(c.opened_at)}</dd>
                </div>
                <div>
                  <dt className="cap">Reports</dt>
                  <dd style={{ margin: "4px 0 0", fontWeight: 550 }}>
                    {bundle ? `${bundle.reports.length} reports, ${sources} ${sources === 1 ? "source" : "sources"}` : "Not in storage"}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="case-seal">
              <QuorumSeal verdicts={tally(votes).verdicts} word={seal.word} tone={seal.tone} sub={seal.sub} size={260} />
            </div>
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 40 }}>
        <ExplanationCard ex={ex} c={c} cfg={cfg} votes={votes} records={records} bundle={bundle} />
      </section>

      <section id="votes" className="wrap section scroll-mt-16">
        <div className="sec-head">
          <div className="flex flex-col gap-1.5">
            <h2 className="h1">The four votes</h2>
            <p className="muted" style={{ maxWidth: 700 }}>
              Each verifier signs with its own NEAR account and key. In this demo the LifeLine team runs all four.
            </p>
          </div>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(500px, 100%), 1fr))" }}>
          {ROLES.map((role) => {
            const i = votes.findIndex((v) => v.role === role);
            return <VoteCard key={role} role={role} vote={votes[i]} record={i >= 0 ? records[i] : null} />;
          })}
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 56 }}>
        <Trail steps={path.steps} note={path.note} />
      </section>

      <BidsSection c={c} bids={bids} />
      <ProofSection c={c} proof={proof} delivery={delivery} deliveryReasons={deliveryRecords.map((r) => r?.reasoning ?? null)} />
      <PayoutPreview c={c} cfg={cfg} />
      <EvidenceSection c={c} bundle={bundle} />
    </>
  );
}

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<CaseSkeleton />}>
      <CaseFile params={params} />
    </Suspense>
  );
}
