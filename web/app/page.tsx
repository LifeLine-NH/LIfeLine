import Link from "next/link";
import { Suspense } from "react";
import { CaseLines } from "@/components/case/CaseRows";
import { HeroReplay, type ReplayCase } from "@/components/home/HeroReplay";
import { MoneyFlowStepper } from "@/components/home/MoneyFlowStepper";
import { PoolStats } from "@/components/home/PoolStats";
import { contractUrl } from "@/components/ui/links";
import { SectionError } from "@/components/ui/PageError";
import { Skel } from "@/components/ui/tags";
import { attempt } from "@/lib/attempt";
import { listCaseRows } from "@/lib/caseList";
import { FUNDED, sealFor } from "@/lib/caseView";
import { chain } from "@/lib/chain";
import { config } from "@/lib/config";
import { getEvidence } from "@/lib/evidence";
import { amountToNumber, formatAmountCompact, percent, ROLES } from "@/lib/format";
import { RULES } from "@/lib/rules";
import type { Case, EvidenceBundle, VoteRecord } from "@/lib/types";

const SAMPLE = config.chainMode === "stub";

async function replayFor(c: Case, key: string, label: string): Promise<ReplayCase> {
  const [votes, bundle] = await Promise.all([chain.getVotes(c.id), getEvidence(c.bundle_hash).catch(() => null) as Promise<EvidenceBundle | null>]);
  const records = await Promise.all(votes.map((v) => getEvidence(v.evidence_hash).catch(() => null) as Promise<VoteRecord | null>));
  const seal = sealFor(c, votes);
  const sources = bundle ? new Set(bundle.reports.map((r) => r.source_id_hash)).size : 0;
  const first = bundle?.reports[0]?.text;
  const sub =
    c.status === "Rejected"
      ? `${votes.filter((v) => v.verdict === "No").length} of 4 no · nothing paid`
      : `${votes.filter((v) => v.verdict === "Yes").length} of 4 yes · cap ${formatAmountCompact(c.cap)}`;
  return {
    key,
    label,
    id: c.id,
    input: bundle ? `${bundle.reports.length} reports, ${sources} ${sources === 1 ? "source" : "sources"}${first ? `: "${first}"` : ""}` : "The evidence record isn't in storage.",
    word: c.status === "Rejected" ? "Rejected" : "Funded",
    tone: c.status === "Rejected" ? "rejected" : seal.tone === "delivered" ? "funded" : seal.tone,
    sub,
    votes: ROLES.map((role) => {
      const i = votes.findIndex((v) => v.role === role);
      const v = votes[i];
      return { verdict: v?.verdict ?? null, confidence: v ? Math.round(v.confidence_bps / 100) : null, reason: (i >= 0 ? records[i]?.reasoning : null) ?? null };
    }),
  };
}

async function Hero() {
  const res = await attempt(() => chain.listCases({ limit: 100 }));
  const cases = res.ok ? res.value : [];
  const decidedWithFour = async (list: Case[]) => {
    for (const c of list) if ((await chain.getVotes(c.id)).length === 4) return c;
    return list[0];
  };
  const funded = await decidedWithFour(cases.filter((c) => c.status === "Delivered").concat(cases.filter((c) => FUNDED.includes(c.status) && c.status !== "Delivered")));
  const rejected = await decidedWithFour(cases.filter((c) => c.status === "Rejected"));
  const replay = (await Promise.all([funded && replayFor(funded, "funded", "A funded case"), rejected && replayFor(rejected, "rejected", "A rejected case")])).filter(Boolean) as ReplayCase[];

  const footnote = SAMPLE ? "Sample case" : config.dataMode === "live" ? "Votes recorded on chain" : "Replay of votes recorded on chain";

  return (
    <section className="hero">
      <div className="hero-dots" aria-hidden />
      <div className="wrap relative flex flex-wrap items-center gap-x-16 gap-y-14" style={{ paddingTop: 72, paddingBottom: 88 }}>
        <div className="flex min-w-0 flex-col gap-7" style={{ flex: "1 1 500px" }}>
          <span className="kicker">
            <i />
            Public disaster relief fund on NEAR
          </span>
          <h1 className="display" style={{ fontSize: "clamp(40px, 5.6vw, 72px)" }}>
            Relief money that moves only when <span className="hl-accent">four checks agree.</span>
          </h1>
          <p className="lead" style={{ maxWidth: 540 }}>
            Four independent verifiers check every disaster report against outside data, and one of them argues it&apos;s fake. The contract sets the limit. Responders are paid in two
            parts: the first on award, the rest against proof of delivery.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-primary btn-lg" href="/donate">
              Add to the relief pool
            </Link>
            <Link className="btn btn-ghost btn-lg" href="/cases">
              Browse every case →
            </Link>
          </div>
          <p className="cap hero-rules">
            <span>
              {RULES.fundAtYes} of 4 yes to fund
            </span>
            <span>{RULES.rejectAtNo} no to reject</span>
            <span>{SAMPLE ? "Sample data: no money moves" : "Every amount links to its record"}</span>
          </p>
        </div>
        {replay.length > 0 ? (
          <HeroReplay cases={replay} footnote={footnote} />
        ) : (
          <div className="mx-auto flex min-w-0 flex-col items-center gap-4 text-center" style={{ flex: "1 1 440px", maxWidth: 520 }}>
            {res.ok ? <p className="muted">No decided cases yet. The first verdict will replay here.</p> : <SectionError what="cases" message={res.message} />}
          </div>
        )}
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <section className="hero">
      <div className="wrap flex flex-wrap items-center gap-16" style={{ paddingTop: 72, paddingBottom: 88 }}>
        <div className="flex min-w-0 flex-col gap-6" style={{ flex: "1 1 500px" }}>
          <Skel w={240} />
          <Skel w="90%" h={150} />
          <Skel w="80%" h={60} />
        </div>
        <div className="mx-auto flex w-full flex-col items-center gap-6" style={{ flex: "1 1 440px", maxWidth: 520 }}>
          <Skel w={280} h={36} r={999} />
          <Skel w={330} h={330} r="50%" />
        </div>
      </div>
    </section>
  );
}

async function Flow() {
  const res = await attempt(() => chain.getConfig());
  const first = res.ok ? percent(res.value.tranche1_bps) : "part";
  const rest = res.ok ? percent(10000 - res.value.tranche1_bps) : "the rest";
  const share = res.ok ? percent(res.value.max_case_bps) : "a set share";
  return (
    <MoneyFlowStepper
      steps={[
        {
          short: "Reports",
          title: "Reports become a case",
          text: "Field reports arrive by SMS, partner relays and a web form. Reports about the same place and time are grouped into one case. Senders stay anonymous.",
        },
        {
          short: "Four checks",
          title: "Four verifiers vote in public",
          text: "Geo checks spread and timing without AI. Fact checks outside data like rainfall and alerts. Severity proposes a tier. The red team argues it's fake. Each signs its vote with its own key.",
        },
        {
          short: "Contract",
          title: "The contract decides, not an AI",
          text: `${RULES.fundAtYes} of 4 yes votes fund the case. ${RULES.rejectAtNo} no votes reject it. Spending is capped at the lowest of the tier limit, ${share} of the pool and what's left of the daily limit.`,
        },
        {
          short: "Bids",
          title: "Responders bid to deliver",
          text: `Registered NGOs offer a price, a delivery time and a plan. The lowest ask under the cap wins if it meets the reputation and delivery time rules, and ${first} is paid at once.`,
        },
        {
          short: "Proof",
          title: "The rest waits for proof",
          text: `The responder submits proof of delivery. If ${RULES.deliveryAgree} of 4 verifiers agree it checks out, the other ${rest} is paid. Miss the deadline and it returns to the pool.`,
        },
      ]}
    />
  );
}

async function Pool() {
  const res = await attempt(() => chain.getPool());
  if (!res.ok) return <SectionError what="the pool" message={res.message} />;
  const p = res.value;
  const href = contractUrl();
  const sym = config.tokenSymbol;
  return (
    <PoolStats
      figures={[
        { value: amountToNumber(p.available), decimals: 2, label: `${sym} available for new cases`, note: "Can be reserved by the next verified case", href, sample: SAMPLE },
        { value: amountToNumber(p.reserved), decimals: 2, label: `${sym} held for awarded cases`, note: "Waiting on proof of delivery", href, sample: SAMPLE },
        { value: amountToNumber(p.disbursed_today), decimals: 2, label: `${sym} paid out today`, note: "Since 00:00 UTC", href, sample: SAMPLE },
        { value: p.donors_count, decimals: 0, label: "Donors", note: "Distinct accounts since launch", href, sample: SAMPLE },
      ]}
    />
  );
}

async function Recent() {
  const res = await attempt(() => listCaseRows(5));
  if (!res.ok) return <SectionError what="cases" message={res.message} />;
  if (res.value.length === 0) return <p className="muted">No cases yet. The first verified report will appear here.</p>;
  return <CaseLines rows={res.value.slice(0, 5)} />;
}

export default function Home() {
  return (
    <>
      <Suspense fallback={<HeroSkeleton />}>
        <Hero />
      </Suspense>

      <Suspense fallback={<div style={{ height: 420, borderTop: "1px solid var(--line)", background: "var(--surface)" }} />}>
        <Flow />
      </Suspense>

      <section style={{ borderTop: "1px solid var(--line)" }}>
        <div className="wrap flex flex-col gap-10" style={{ paddingTop: 80, paddingBottom: 80 }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="eyebrow">{SAMPLE ? "Relief pool, sample data" : "Relief pool, live from the contract"}</span>
              <h2 className="h1">Where the money is right now</h2>
            </div>
            <Link className="rec" href="/donate" style={{ fontSize: 15 }}>
              Add to the pool
            </Link>
          </div>
          <Suspense
            fallback={
              <div className="grid gap-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} className="flex flex-col gap-3">
                    <Skel w="80%" h={44} />
                    <Skel w="60%" />
                  </div>
                ))}
              </div>
            }
          >
            <Pool />
          </Suspense>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--line)" }}>
        <div className="wrap flex flex-col gap-7" style={{ paddingTop: 80, paddingBottom: 88 }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Recent cases</span>
              <h2 className="h1">Funded or rejected, all in the open</h2>
            </div>
            <Link className="rec" href="/cases" style={{ fontSize: 15 }}>
              See all cases
            </Link>
          </div>
          <Suspense fallback={<Skel h={300} />}>
            <Recent />
          </Suspense>
        </div>
      </section>

      <section className="band">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-12 gap-y-7" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <div className="flex min-w-0 flex-col gap-3" style={{ flex: "1 1 480px" }}>
            <h2 className="display" style={{ fontSize: "clamp(32px, 4vw, 48px)", color: "#F2F1EC" }}>
              Don&apos;t trust us. Check the hash.
            </h2>
            <p className="lead muted" style={{ maxWidth: 560 }}>
              Every vote, bid and payment links to its record on NEAR. Evidence fingerprints can be recomputed in your browser.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-lg btn-light" href="/cases">
              Open a case file
            </Link>
            <Link className="btn btn-lg btn-outline" href="/ops">
              Watch the agents run
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
