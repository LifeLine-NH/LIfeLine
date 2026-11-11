import { Suspense } from "react";
import { AccountLink, TxLink } from "@/components/Links";
import { PoolLedger } from "@/components/PoolLedger";
import { ReadError } from "@/components/ReadError";
import { attempt } from "@/lib/attempt";
import { chain } from "@/lib/chain";
import { formatAmount, formatTime } from "@/lib/format";
import { DonateForm } from "./DonateForm";

async function RecentDonations() {
  const res = await attempt(() => chain.getDonations(0, 20));
  if (!res.ok) return <ReadError what="donations" message={res.message} />;
  const donations = res.value;
  if (donations.length === 0) {
    return <p className="text-muted">No donations yet. The first one will show here with its transaction.</p>;
  }
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-paper">
      {donations.map((d, i) => (
        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <AccountLink id={d.donor} />
          <span className="font-semibold whitespace-nowrap">{formatAmount(d.amount)}</span>
          <span className="w-full text-muted sm:w-auto">{formatTime(d.at)}</span>
          {d.tx_hash && <TxLink hash={d.tx_hash} />}
        </li>
      ))}
    </ul>
  );
}

export default function DonatePage() {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        <h1 className="font-display text-5xl font-extrabold">Add to the relief pool</h1>
        <p className="mt-3 max-w-[60ch] text-muted">
          Your donation goes into one shared pool held by the relief contract. It can only leave the pool for a case the
          verifiers approved, within the limits written into the contract.
        </p>

        <div className="mt-8">
          <DonateForm />
        </div>

        <h2 className="mt-12 font-display text-3xl font-bold">Recent donations</h2>
        <div className="mt-4">
          <Suspense fallback={<p className="text-muted">Reading donations…</p>}>
            <RecentDonations />
          </Suspense>
        </div>
      </div>

      <aside>
        <h2 className="font-display text-2xl font-bold">The pool right now</h2>
        <Suspense fallback={<p className="py-3 text-muted">Reading the pool…</p>}>
          <PoolLedger />
        </Suspense>
        <h2 className="mt-10 font-display text-2xl font-bold">Where it can go</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>Only to a case at least 3 of 4 verifiers approved.</li>
          <li>Never more than the tier limit, a set share of the pool, or what&apos;s left of the daily limit.</li>
          <li>Paid in two parts. The second part waits until delivery is checked.</li>
        </ul>
      </aside>
    </div>
  );
}
