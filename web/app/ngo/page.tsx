import Link from "next/link";
import { Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { NotConnected } from "@/components/NotConnected";
import { chain } from "@/lib/chain";
import { getEvidence } from "@/lib/evidence";
import { formatAmount, incidentLabel, nanosToDate } from "@/lib/format";
import type { EvidenceBundle } from "@/lib/types";

async function OpenForBids() {
  const [cases, cfg] = await Promise.all([chain.listCases({ status: "Bidding", limit: 50 }), chain.getConfig()]);
  if (cases.length === 0) {
    return <p className="rounded-md border border-dashed border-line bg-paper p-6 text-muted">No cases are open for bids right now.</p>;
  }
  const bundles = await Promise.all(cases.map((c) => getEvidence(c.bundle_hash) as Promise<EvidenceBundle | null>));
  const bidCounts = await Promise.all(cases.map((c) => chain.getBids(c.id).then((b) => b.length)));

  return (
    <ul className="space-y-4">
      {cases.map((c, i) => (
        <li key={c.id} className="rounded-md border border-line bg-paper p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Link href={`/cases/${c.id}`} className="font-display text-2xl font-bold text-tarp underline-offset-4 hover:underline">
              {c.id}
            </Link>
            <span className="text-sm font-semibold text-review">
              <Countdown endsAtMs={nanosToDate(c.bidding_ends_at).getTime()} endedText="Bidding closed" />
            </span>
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-muted">Incident</dt>
              <dd className="font-semibold">{bundles[i]?.incident_type ? incidentLabel[bundles[i]!.incident_type!] : "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-muted">Tier</dt>
              <dd className="font-semibold">{c.tier}</dd>
            </div>
            <div>
              <dt className="text-muted">Most you can ask</dt>
              <dd className="font-semibold">{formatAmount(c.cap)}</dd>
            </div>
            <div>
              <dt className="text-muted">Paid when awarded</dt>
              <dd className="font-semibold">{cfg.tranche1_bps / 100}%</dd>
            </div>
            <div>
              <dt className="text-muted">Bids so far</dt>
              <dd className="font-semibold">{bidCounts[i]}</dd>
            </div>
          </dl>
          <button type="button" disabled className="mt-4 rounded bg-tarp px-4 py-2 font-semibold text-white disabled:opacity-50">
            Place a bid
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function NgoPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-5xl font-extrabold">For responders</h1>
        <p className="mt-3 max-w-[65ch] text-muted">
          Registered NGOs bid to respond to verified cases. The lowest ask under the cap wins. You get part of the money
          when you win, and the rest after the verifiers check your proof of delivery.
        </p>
      </div>

      <NotConnected>
        Registering, bidding and sending proof need a NEAR wallet and the live contract. Those buttons stay off until
        then. In the demo, three simulated NGO bots do the bidding.
      </NotConnected>

      <section>
        <h2 className="font-display text-3xl font-bold">Open for bids</h2>
        <div className="mt-4">
          <Suspense fallback={<p className="text-muted">Reading open cases…</p>}>
            <OpenForBids />
          </Suspense>
        </div>
      </section>

      <section className="max-w-[65ch]">
        <h2 className="font-display text-3xl font-bold">How it works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed">
          <li>Register with a bond. Your reputation starts at a set value and moves with every case.</li>
          <li>Bid on a verified case: your ask, how fast you can deliver, and your plan.</li>
          <li>If you win, the first payment is sent to your account straight away.</li>
          <li>Deliver, then submit proof. Two of four verifiers must agree it checks out.</li>
          <li>The second payment follows. Miss the deadline and the rest goes back to the pool.</li>
        </ol>
      </section>
    </div>
  );
}
