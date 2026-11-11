import Link from "next/link";
import { getEvidence } from "@/lib/evidence";
import { formatAmount, formatTime, incidentLabel } from "@/lib/format";
import type { Case, EvidenceBundle } from "@/lib/types";
import { StatusTag } from "./StatusTag";

export async function CaseTable({ cases }: { cases: Case[] }) {
  if (cases.length === 0) {
    return <p className="rounded-md border border-dashed border-line bg-paper p-6 text-muted">No cases match this filter.</p>;
  }

  const bundles = await Promise.all(cases.map((c) => getEvidence(c.bundle_hash) as Promise<EvidenceBundle | null>));

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-paper">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Case</th>
            <th scope="col" className="px-4 py-3 font-medium">Incident</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium">Tier</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
            <th scope="col" className="px-4 py-3 font-medium">Opened</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c, i) => {
            const incident = bundles[i]?.incident_type;
            const amount = BigInt(c.award_amount) > BigInt(0) ? c.award_amount : c.cap;
            return (
              <tr key={c.id} className="border-b border-line last:border-0 hover:bg-chalk/60">
                <td className="px-4 py-3">
                  <Link href={`/cases/${c.id}`} className="font-display text-lg font-bold whitespace-nowrap text-tarp underline-offset-4 hover:underline">
                    {c.id}
                  </Link>
                </td>
                <td className="px-4 py-3">{incident ? incidentLabel[incident] : "Unknown"}</td>
                <td className="px-4 py-3">
                  <StatusTag status={c.status} />
                </td>
                <td className="px-4 py-3">{c.tier > 0 ? c.tier : "Not set"}</td>
                <td className="px-4 py-3 text-right">{BigInt(amount) > BigInt(0) ? formatAmount(amount) : "None"}</td>
                <td className="px-4 py-3 text-muted">{formatTime(c.opened_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
