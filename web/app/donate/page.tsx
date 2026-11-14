import type { Metadata } from "next";
import { Suspense } from "react";
import { contractUrl, SourceAmount } from "@/components/ui/links";
import { SectionError } from "@/components/ui/PageError";
import { Skel } from "@/components/ui/tags";
import { attempt } from "@/lib/attempt";
import { chain } from "@/lib/chain";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { formatAmount, shortAccount } from "@/lib/format";
import { DonateForm } from "./DonateForm";

export const metadata: Metadata = { title: "Donate · LifeLine" };

async function RecentDonations() {
  const res = await attempt(() => chain.getDonations(0, 20));
  if (!res.ok) return <SectionError what="donations" message={res.message} />;
  const donations = res.value;
  if (donations.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center", borderStyle: "dashed", boxShadow: "none", background: "transparent" }}>
        <p className="muted">No donations yet. The first one will show here with its transaction.</p>
      </div>
    );
  }
  return (
    <div className="card rows overflow-hidden">
      {donations.map((d, i) => (
        <div key={`${d.donor}-${String(d.at)}-${i}`} className="row-item" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 14 }}>
          <span className="acct" title={d.donor}>
            {shortAccount(d.donor, 26)}
          </span>
          <SourceAmount tx={d.tx_hash} className="num" style={{ fontWeight: 650, textAlign: "right" }}>
            {formatAmount(d.amount)}
          </SourceAmount>
          <span className="cap" style={{ minWidth: 76, textAlign: "right" }}>
            <TimeAgo at={d.at} />
          </span>
        </div>
      ))}
    </div>
  );
}

async function PoolNow() {
  const res = await attempt(() => chain.getPool());
  if (!res.ok) return <SectionError what="the pool" message={res.message} />;
  const p = res.value;
  const href = contractUrl();
  const rows = [
    { k: "Available for new cases", v: formatAmount(p.available) },
    { k: "Held for awarded cases", v: formatAmount(p.reserved) },
    { k: "Paid out today", v: formatAmount(p.disbursed_today) },
    { k: "Donors", v: p.donors_count.toLocaleString("en-US") },
  ];
  return (
    <>
      {rows.map((r) => (
        <div key={r.k} className="flex items-baseline justify-between gap-3" style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
          <span className="body-s muted">{r.k}</span>
          <SourceAmount href={href} className="num" style={{ fontWeight: 700, fontSize: 17 }}>
            {r.v}
          </SourceAmount>
        </div>
      ))}
    </>
  );
}

export default function DonatePage() {
  return (
    <div className="wrap section flex flex-col gap-8">
      <div className="flex flex-col gap-2.5" style={{ maxWidth: 760 }}>
        <h1 className="h1">Add to the relief pool</h1>
        <p className="lead">
          Your donation joins one shared pool held by the relief contract. It can only go to a case that at least 3 of 4 verifiers approved, within the contract&apos;s limits, and the second
          payment is made only after delivery is checked.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-col gap-6" style={{ flex: "1.5 1 560px" }}>
          <DonateForm />
          <div className="flex flex-col gap-3.5">
            <h2 className="h2">Recent donations</h2>
            <Suspense fallback={<Skel h={240} r={20} />}>
              <RecentDonations />
            </Suspense>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" style={{ flex: "1 1 340px" }}>
          <div className="card card-p flex flex-col gap-4">
            <span className="eyebrow">The pool right now</span>
            <Suspense fallback={<Skel h={180} />}>
              <PoolNow />
            </Suspense>
          </div>
          <div className="card card-p flex flex-col gap-3.5">
            <span className="eyebrow">Where it can go</span>
            <ul className="flex flex-col gap-3.5">
              <li className="grid gap-2.5" style={{ gridTemplateColumns: "22px minmax(0, 1fr)" }}>
                <span className="ico ico-check" style={{ color: "var(--st-delivered)", marginTop: 3 }} />
                <span className="body-s">Only to a case at least 3 of 4 verifiers approved.</span>
              </li>
              <li className="grid gap-2.5" style={{ gridTemplateColumns: "22px minmax(0, 1fr)" }}>
                <span className="ico ico-shield" style={{ color: "var(--st-delivered)", marginTop: 3 }} />
                <span className="body-s">Never more than the tier limit, a set share of the pool, or what&apos;s left of the daily limit.</span>
              </li>
              <li className="grid gap-2.5" style={{ gridTemplateColumns: "22px minmax(0, 1fr)" }}>
                <span className="ico ico-box" style={{ color: "var(--st-delivered)", marginTop: 3 }} />
                <span className="body-s">Paid in two parts. The second waits until delivery is checked.</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
