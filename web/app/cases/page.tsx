import Link from "next/link";
import { Suspense } from "react";
import { CaseTable } from "@/components/CaseTable";
import { ReadError } from "@/components/ReadError";
import { attempt } from "@/lib/attempt";
import { chain } from "@/lib/chain";
import type { CaseStatus } from "@/lib/types";

const FILTERS: { label: string; status?: CaseStatus }[] = [
  { label: "All" },
  { label: "Verifying", status: "Open" },
  { label: "Open for bids", status: "Bidding" },
  { label: "Awarded", status: "Awarded" },
  { label: "Proof submitted", status: "ProofSubmitted" },
  { label: "Delivered", status: "Delivered" },
  { label: "Needs review", status: "NeedsReview" },
  { label: "Rejected", status: "Rejected" },
];

async function FilteredCases({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = FILTERS.find((f) => f.status === status) ?? FILTERS[0];
  const res = await attempt(() => chain.listCases({ limit: 100, status: active.status }));

  return (
    <>
      <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = f === active;
          return (
            <Link
              key={f.label}
              href={f.status ? `/cases?status=${f.status}` : "/cases"}
              aria-current={isActive ? "page" : undefined}
              className={`rounded border px-3 py-1 text-sm font-medium ${
                isActive ? "border-tarp bg-tarp text-white" : "border-line bg-paper text-ink hover:border-tarp"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>
      {res.ok ? <CaseTable cases={res.value} /> : <ReadError what="cases" message={res.message} />}
    </>
  );
}

export default function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return (
    <div>
      <h1 className="font-display text-5xl font-extrabold">Cases</h1>
      <p className="mt-3 mb-8 max-w-[70ch] text-muted">
        Every report cluster the verifiers have looked at, including the ones they rejected. A rejected case is the
        system doing its job.
      </p>
      <Suspense fallback={<p className="text-muted">Reading cases…</p>}>
        <FilteredCases searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
