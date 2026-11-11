import { Suspense } from "react";
import { CaseTable } from "@/components/CaseTable";
import { NotConnected } from "@/components/NotConnected";
import { chain } from "@/lib/chain";

// Scenario ids match agents/scenarios. Expected outcomes come from those files.
const SCENARIOS = [
  { id: "S1", name: "Genuine report", expect: "Verified, funded and delivered" },
  { id: "S2", name: "Keyword attack", expect: "Rejected: reports repeat \"flood\" with no outside evidence" },
  { id: "S3", name: "Flood of fakes", expect: "Rejected: many reports from one sender" },
  { id: "S5", name: "Inflated proof", expect: "Second payment withheld: the delivery claim doesn't add up" },
];

async function ReviewQueue() {
  const cases = await chain.listCases({ status: "NeedsReview", limit: 20 });
  return <CaseTable cases={cases} />;
}

export default function OpsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-5xl font-extrabold">Ops console</h1>
        <p className="mt-3 max-w-[65ch] text-muted">
          Run a scenario through the verifier swarm and watch each agent vote on chain.
        </p>
      </div>

      <NotConnected>
        Scenario runs go through the agent runner at /api/swarm/run, which isn&apos;t connected yet.
      </NotConnected>

      <section>
        <h2 className="font-display text-3xl font-bold">Scenarios</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <li key={s.id} className="flex flex-col justify-between rounded-md border border-line bg-paper p-5">
              <div>
                <p className="font-display text-xl font-bold">
                  {s.id}: {s.name}
                </p>
                <p className="mt-1 text-sm text-muted">Expected: {s.expect}</p>
              </div>
              <button type="button" disabled className="mt-4 self-start rounded bg-tarp px-4 py-2 font-semibold text-white disabled:opacity-50">
                Run {s.id}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-3xl font-bold">Waiting for a coordinator</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Cases where the verifiers split. A person has to confirm or reject them.</p>
        <Suspense fallback={<p className="text-muted">Reading cases…</p>}>
          <ReviewQueue />
        </Suspense>
      </section>
    </div>
  );
}
