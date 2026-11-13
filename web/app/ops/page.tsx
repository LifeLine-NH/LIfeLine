import Link from "next/link";
import { Suspense } from "react";
import { OpsConsole } from "@/components/ops/LiveRun";
import { SectionError } from "@/components/ui/PageError";
import { ComingNextTag, Skel } from "@/components/ui/tags";
import { attempt } from "@/lib/attempt";
import { listCaseRows } from "@/lib/caseList";
import { tally } from "@/lib/caseView";
import { chain } from "@/lib/chain";
import { config } from "@/lib/config";
import { incidentLabel } from "@/lib/format";
import { loadRunScripts } from "@/lib/runScript";

async function Console() {
  const res = await attempt(() => loadRunScripts());
  if (!res.ok) return <SectionError what="the scenario runs" message={res.message} />;
  return <OpsConsole scripts={res.value.scripts} missing={res.value.missing} sample={config.chainMode === "stub"} chainLabel={config.network} />;
}

async function ReviewQueue() {
  const res = await attempt(async () => {
    const rows = (await listCaseRows(200)).filter((r) => r.c.status === "NeedsReview");
    const votes = await Promise.all(rows.map((r) => chain.getVotes(r.c.id)));
    return rows.map((r, i) => ({ ...r, t: tally(votes[i]) }));
  });
  if (!res.ok) return <SectionError what="the review queue" message={res.message} />;
  if (res.value.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center", borderStyle: "dashed", boxShadow: "none", background: "transparent" }}>
        <p className="muted">No cases are waiting for a coordinator.</p>
      </div>
    );
  }
  return (
    <div className="card rows">
      {res.value.map(({ c, incident, t }) => (
        <div key={c.id} className="row-item queue-row" style={{ gap: 16 }}>
          <span className="flex min-w-0 flex-col gap-0.5">
            <Link href={`/cases/${encodeURIComponent(c.id)}`} style={{ fontWeight: 650, color: "var(--ink)" }}>
              {incident ? incidentLabel[incident] : "Incident"}
              {c.tier > 0 ? ` · tier ${c.tier}` : ""}
            </Link>
            <span className="mono truncate" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {c.id}
            </span>
          </span>
          <span className="body-s muted">
            {t.yes} yes · {t.no} no · {t.abs} abstained. Neither rule was met.
          </span>
          <span className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled>
              Confirm
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled>
              Reject
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function OpsPage() {
  return (
    <div className="wrap section flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-2.5" style={{ flex: "1 1 520px" }}>
          <h1 className="h1">Ops console</h1>
          <p className="lead">Run a demo scenario and watch the four verifiers work, vote by vote, through to the contract decision and payments.</p>
        </div>
        <Link className="btn btn-primary" href="/ops/stage">
          Open the large screen view
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skel h={220} r={20} />
            <Skel h={420} r={20} />
          </div>
        }
      >
        <Console />
      </Suspense>

      <section className="flex flex-col gap-3.5">
        <div className="sec-head" style={{ margin: 0 }}>
          <div className="flex flex-col gap-1.5">
            <h2 className="h2">Waiting for a coordinator</h2>
            <p className="muted">Cases where neither rule was met.</p>
          </div>
          <ComingNextTag />
        </div>
        <Suspense fallback={<Skel h={90} r={20} />}>
          <ReviewQueue />
        </Suspense>
        <p className="cap">Confirm and Reject need the coordinator role on the live contract. Each decision will be its own transaction.</p>
      </section>
    </div>
  );
}
