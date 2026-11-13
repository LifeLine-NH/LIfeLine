import Link from "next/link";
import { Suspense } from "react";
import { BidForm } from "@/components/ngo/BidForm";
import { type AwardRow, NgoAccount } from "@/components/ngo/NgoAccount";
import { NgoProvider } from "@/components/ngo/NgoProvider";
import { BidClock } from "@/components/ui/BidClock";
import { AccountText, contractUrl, SourceAmount } from "@/components/ui/links";
import { SectionError } from "@/components/ui/PageError";
import { SimulatedTag, Skel } from "@/components/ui/tags";
import { attempt } from "@/lib/attempt";
import { chain } from "@/lib/chain";
import { getEvidence } from "@/lib/evidence";
import { formatAmount, incidentLabel, nanosToMs, percent } from "@/lib/format";
import { RULES } from "@/lib/rules";
import { config } from "@/lib/config";
import type { EvidenceBundle } from "@/lib/types";

async function OpenForBids() {
  const res = await attempt(async () => {
    const [cases, cfg] = await Promise.all([chain.listCases({ status: "Bidding", limit: 50 }), chain.getConfig()]);
    const [bundles, bidCounts] = await Promise.all([
      Promise.all(cases.map((c) => getEvidence(c.bundle_hash).catch(() => null) as Promise<EvidenceBundle | null>)),
      Promise.all(cases.map((c) => chain.getBids(c.id).then((b) => b.length))),
    ]);
    return { cases, cfg, bundles, bidCounts };
  });
  if (!res.ok) return <SectionError what="open cases" message={res.message} />;
  const { cases, cfg, bundles, bidCounts } = res.value;
  if (cases.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center", borderStyle: "dashed", boxShadow: "none", background: "transparent" }}>
        <p className="muted">No cases are open for bids right now.</p>
      </div>
    );
  }
  const href = contractUrl();

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))" }}>
      {cases.map((c, i) => {
        const incident = bundles[i]?.incident_type;
        const ends = nanosToMs(c.bidding_ends_at);
        return (
          <article key={c.id} className="card flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3" style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)" }}>
              <div className="flex min-w-0 flex-col gap-1">
                <span style={{ font: "650 19px/1.2 var(--font-display)" }}>{incident ? incidentLabel[incident] : "Incident"}</span>
                <Link className="mono truncate" href={`/cases/${encodeURIComponent(c.id)}`} style={{ fontSize: 12.5 }}>
                  {c.id}
                </Link>
              </div>
              <span className="tier">Tier {c.tier}</span>
            </div>
            <div className="grid grid-cols-2 gap-4" style={{ padding: "18px 22px" }}>
              <div>
                <span className="cap">Most you can ask</span>
                <SourceAmount href={href} className="num" style={{ display: "block", fontWeight: 700, fontSize: 20, marginTop: 2 }}>
                  {formatAmount(c.cap)}
                </SourceAmount>
              </div>
              <div>
                <span className="cap">Paid when awarded</span>
                <p className="num" style={{ fontWeight: 700, fontSize: 20, marginTop: 2 }}>
                  {percent(cfg.tranche1_bps)} of your ask
                </p>
              </div>
              <div>
                <span className="cap">Bids so far</span>
                <p className="num" style={{ fontWeight: 650, fontSize: 17, marginTop: 2 }}>
                  {bidCounts[i]}
                </p>
              </div>
              <BidClock endsAtMs={ends} />
            </div>
            <div className="mt-auto" style={{ padding: "16px 22px", background: "#FBFAF7", borderTop: "1px solid var(--line)" }}>
              <BidForm caseId={c.id} cap={c.cap} firstBps={cfg.tranche1_bps} endsAtMs={ends} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

async function Account() {
  const res = await attempt(async () => {
    const lists = await Promise.all((["Awarded", "ProofSubmitted", "Delivered"] as const).map((status) => chain.listCases({ status, limit: 100 })));
    return lists.flat().filter((c) => c.winner);
  });
  const awards: AwardRow[] = res.ok
    ? res.value.map((c) => ({ id: c.id, status: c.status, winner: c.winner!, award: c.award_amount, first: c.tranche1_paid, second: c.tranche2_paid }))
    : [];
  return <NgoAccount awards={awards} />;
}

async function HowItWorks() {
  const res = await attempt(() => chain.getConfig());
  const first = res.ok ? percent(res.value.tranche1_bps) : "Part";
  const rest = res.ok ? percent(10000 - res.value.tranche1_bps) : "the rest";
  const steps = [
    { t: "Register with a bond", d: "Lock a bond to join. Your reputation starts at a set value and moves with each delivery." },
    { t: "Bid on a verified case", d: "Give your ask, delivery time in hours and a short plan. The ask must be under the cap." },
    { t: `If you win, get ${first} at once`, d: "The first payment is sent the moment the case is awarded." },
    { t: "Deliver, then submit proof", d: `Summary, households reached, location and photos. ${RULES.deliveryAgree} of 4 verifiers must agree.` },
    { t: `Receive the other ${rest}`, d: "Paid when the delivery check passes. Miss the deadline and the rest goes back to the pool." },
  ];
  return (
    <ol className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))" }}>
      {steps.map((s, i) => (
        <li key={s.t} className="card flex flex-col gap-2.5" style={{ padding: 20, boxShadow: "none" }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--ink)", color: "#fff", display: "grid", placeItems: "center", font: "700 15px/1 var(--font-display)" }}>
            {i + 1}
          </span>
          <span style={{ fontWeight: 650 }}>{s.t}</span>
          <span className="body-s muted">{s.d}</span>
        </li>
      ))}
    </ol>
  );
}

// The demo bots are whoever placed simulated bids, read back from the contract.
async function DemoBidders() {
  const res = await attempt(async () => {
    const cases = await chain.listCases({ limit: 200 });
    const bids = (await Promise.all(cases.map((c) => chain.getBids(c.id)))).flat();
    const accounts = [...new Set(bids.filter((b) => b.simulated).map((b) => b.ngo))];
    const ngos = await Promise.all(accounts.map((a) => chain.getNgo(a)));
    return accounts.map((a, i) => ({ account: a, ngo: ngos[i] }));
  });
  if (!res.ok) return <SectionError what="the demo responders" message={res.message} />;
  if (res.value.length === 0) return <p className="muted">No simulated responders have bid yet.</p>;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
      {res.value.map(({ account, ngo }) => (
        <div key={account} className="card flex flex-col gap-2.5" style={{ padding: "18px 20px", boxShadow: "none" }}>
          <div className="flex items-center justify-between gap-2">
            <AccountText id={account} style={{ fontWeight: 650, fontFamily: "var(--font-body)", fontSize: 15 }} />
            <SimulatedTag />
          </div>
          {ngo ? (
            <div className="body-s flex flex-wrap gap-x-4.5 gap-y-1">
              <span>
                <span className="faint">Reputation</span> <b className="num">{ngo.reputation}</b>
              </span>
              <span>
                <span className="faint">Delivered</span> <b className="num">{ngo.delivered}</b>
              </span>
              <span>
                <span className="faint">Failed</span> <b className="num">{ngo.failed}</b>
              </span>
              <span>
                <span className="faint">Bond</span> <b className="num">{formatAmount(ngo.bond)}</b>
              </span>
            </div>
          ) : (
            <span className="cap">Not registered on the contract.</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function NgoPage() {
  return (
    <NgoProvider>
    <div className="wrap section flex flex-col gap-8">
      <div className="flex min-w-0 flex-col gap-2.5" style={{ maxWidth: 900 }}>
        <h1 className="h1">For responders</h1>
        <p className="lead">
          When verifiers approve a case, it opens for bids. Registered NGOs offer a price, a delivery time and a plan. The lowest ask under the cap wins if it meets the reputation and
          delivery time rules. The winner is paid part at once and the rest after proof of delivery checks out.
        </p>
      </div>

      {config.chainMode === "stub" ? (
        <div className="notice n-warn">
          <span>
            <b>This page is showing sample data.</b> Registering, bidding and submitting proof work from here once the site points at the live relief contract. In this demo, simulated NGO
            bots place the bids you see on case pages.
          </span>
        </div>
      ) : (
        <div className="notice n-info">
          <span>
            <b>Bids, awards and payments are real {config.network} transactions.</b> Simulated NGO bots also bid in the demo, and are labelled wherever they appear.
          </span>
        </div>
      )}

      <Suspense fallback={<Skel h={120} r={20} />}>
        <Account />
      </Suspense>

      <section className="flex flex-col gap-4">
        <div className="sec-head" style={{ margin: 0 }}>
          <h2 className="h2">Open for bids</h2>
          <span className="cap">Countdowns update every second.</span>
        </div>
        <Suspense fallback={<Skel h={260} r={20} />}>
          <OpenForBids />
        </Suspense>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="h2">How it works</h2>
        <Suspense fallback={<Skel h={200} r={20} />}>
          <HowItWorks />
        </Suspense>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="h2">Who&apos;s bidding in the demo</h2>
        <Suspense fallback={<Skel h={120} r={20} />}>
          <DemoBidders />
        </Suspense>
      </section>

    </div>
    </NgoProvider>
  );
}
