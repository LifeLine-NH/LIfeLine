import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaseTable } from "@/components/case/CaseRows";
import { SectionError } from "@/components/ui/PageError";
import { Empty, Skel } from "@/components/ui/tags";
import { attempt } from "@/lib/attempt";
import { listCaseRows } from "@/lib/caseList";
import { config } from "@/lib/config";
import type { CaseStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Cases · LifeLine" };

const FILTERS: { key: string; label: string; status?: CaseStatus }[] = [
  { key: "all", label: "All" },
  { key: "verifying", label: "Verifying", status: "Open" },
  { key: "bidding", label: "Open for bids", status: "Bidding" },
  { key: "awarded", label: "Awarded", status: "Awarded" },
  { key: "proof", label: "Proof submitted", status: "ProofSubmitted" },
  { key: "delivered", label: "Delivered", status: "Delivered" },
  { key: "review", label: "Needs review", status: "NeedsReview" },
  { key: "rejected", label: "Rejected", status: "Rejected" },
  { key: "expired", label: "Expired", status: "Expired" },
];

function Chips({ active, counts }: { active: string; counts?: Record<string, number> }) {
  return (
    <nav aria-label="Filter by status" className="chips" style={{ overflowX: "auto", flexWrap: "nowrap", paddingBottom: 4 }}>
      {FILTERS.map((f) => {
        const on = f.key === active;
        return (
          <Link key={f.key} href={f.key === "all" ? "/cases" : `/cases?status=${f.key}`} className={`chip-btn inline-flex items-center${on ? " on" : ""}`} aria-current={on ? "page" : undefined} scroll={false}>
            {f.label}
            {counts && <span className="chip-count">{counts[f.key] ?? 0}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function ListSkeleton() {
  return (
    <>
      <Chips active="all" />
      <div className="card rows" aria-busy="true" aria-label="Loading cases">
        {[1, 2, 3, 4, 5, 6].map((k) => (
          <div key={k} className="row-item case-row">
            <span className="flex flex-col gap-2">
              <Skel w="40%" h={14} />
              <Skel w="70%" h={12} />
            </span>
            <Skel w={110} h={26} r={999} />
            <Skel w={60} className="c-hide" />
            <Skel w={90} className="c-hide" />
            <Skel w={100} className="c-hide" />
            <span />
          </div>
        ))}
      </div>
    </>
  );
}

async function FilteredCases({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const res = await attempt(() => listCaseRows(200));
  if (!res.ok) {
    return (
      <>
        <Chips active={active.key} />
        <SectionError what="cases" message={res.message} />
      </>
    );
  }
  const all = res.value;
  const counts: Record<string, number> = { all: all.length };
  for (const f of FILTERS) if (f.status) counts[f.key] = all.filter((r) => r.c.status === f.status).length;
  const rows = active.status ? all.filter((r) => r.c.status === active.status) : all;

  return (
    <>
      <Chips active={active.key} counts={counts} />
      {rows.length > 0 ? (
        <CaseTable rows={rows} />
      ) : (
        <Empty
          action={
            all.length > 0 ? (
              <Link className="btn btn-secondary btn-sm" href="/cases" scroll={false}>
                Show all cases
              </Link>
            ) : undefined
          }
        >
          {all.length > 0 ? "No cases match this filter." : "No cases yet. The first verified report will appear here."}
        </Empty>
      )}
    </>
  );
}

export default function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return (
    <div className="wrap section flex flex-col gap-7">
      <div className="flex flex-col gap-2.5" style={{ maxWidth: 720 }}>
        <h1 className="h1">Cases</h1>
        <p className="lead">Every report cluster the verifiers have looked at, including the ones they rejected.</p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <FilteredCases searchParams={searchParams} />
      </Suspense>
      <p className="cap">
        {config.chainMode === "stub" ? "Sample data. " : "Read from the relief contract. "}Amounts show the award, or the cap if the case hasn&apos;t been awarded yet. Times in UTC.
      </p>
    </div>
  );
}
