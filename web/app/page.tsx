import Link from "next/link";
import { Suspense } from "react";
import { CaseTable } from "@/components/CaseTable";
import { PoolLedger } from "@/components/PoolLedger";
import { Stamp } from "@/components/Stamp";
import { chain } from "@/lib/chain";
import { getEvidence } from "@/lib/evidence";
import { formatTime, incidentLabel, roleLabel } from "@/lib/format";
import type { EvidenceBundle, Role, Verdict } from "@/lib/types";

const ROLES: Role[] = ["geo", "fact", "sev", "red"];
const verdictCls: Record<Verdict, string> = {
  Yes: "border-verified text-verified",
  No: "border-stamp text-stamp",
  Abstain: "border-line text-muted",
};

async function FeaturedCase() {
  const cases = await chain.listCases({ limit: 20 });
  const featured = cases.find((c) => c.status !== "Open") ?? cases[0];
  if (!featured) {
    return <p className="text-muted">No cases yet. The first verified report will appear here.</p>;
  }
  const [votes, bundle] = await Promise.all([
    chain.getVotes(featured.id),
    getEvidence(featured.bundle_hash) as Promise<EvidenceBundle | null>,
  ]);

  return (
    <div className="relative rounded-md border border-line bg-paper p-5 sm:p-7">
      <div className="absolute top-5 right-5 sm:top-7 sm:right-7">
        <Stamp status={featured.status} land />
      </div>
      <p className="text-sm text-muted">Latest decision</p>
      <h2 className="mt-1 max-w-[70%] font-display text-3xl font-extrabold break-all sm:text-4xl">{featured.id}</h2>
      <p className="mt-2 text-muted">
        {bundle?.incident_type ? incidentLabel[bundle.incident_type] : "Incident"} reported by{" "}
        {bundle?.source_diversity ?? "?"} independent sources. Opened {formatTime(featured.opened_at)}.
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ROLES.map((role) => {
          const vote = votes.find((v) => v.role === role);
          return (
            <li
              key={role}
              className={`rounded border-2 px-3 py-2 ${vote ? verdictCls[vote.verdict] : "border-dashed border-line text-muted"}`}
            >
              <span className="block text-sm font-semibold text-ink">{roleLabel[role].name}</span>
              <span className="text-lg font-bold">{vote ? (vote.verdict === "Abstain" ? "Abstained" : vote.verdict) : "Waiting"}</span>
            </li>
          );
        })}
      </ul>

      <Link
        href={`/cases/${featured.id}`}
        className="mt-6 inline-block rounded bg-tarp px-4 py-2 font-semibold text-white hover:bg-tarp-deep"
      >
        Open the case file
      </Link>
    </div>
  );
}

async function RecentCases() {
  const cases = await chain.listCases({ limit: 5 });
  return <CaseTable cases={cases} />;
}

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="max-w-3xl">
        <h1 className="font-display text-5xl leading-none font-extrabold sm:text-6xl">
          Relief money that moves only when four checks agree.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          People fund a shared relief pool on NEAR. When reports of a disaster come in, four verifiers check them
          independently and vote onchain. A contract, not an AI, decides how much can be spent. NGOs bid to respond,
          and they get the second half of the money only after delivery is checked.
        </p>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Suspense fallback={<div className="h-72 rounded-md border border-line bg-paper" />}>
          <FeaturedCase />
        </Suspense>
        <div>
          <h2 className="font-display text-2xl font-bold">Relief pool</h2>
          <Suspense fallback={<p className="py-3 text-muted">Reading the pool…</p>}>
            <PoolLedger />
          </Suspense>
          <Link href="/donate" className="mt-4 inline-block font-semibold text-tarp underline underline-offset-4">
            Add to the pool
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-3xl font-bold">Recent cases</h2>
          <Link href="/cases" className="font-semibold text-tarp underline underline-offset-4">
            All cases
          </Link>
        </div>
        <Suspense fallback={<p className="text-muted">Reading cases…</p>}>
          <RecentCases />
        </Suspense>
      </section>
    </div>
  );
}
