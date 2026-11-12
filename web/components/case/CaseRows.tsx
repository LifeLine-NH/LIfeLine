import Link from "next/link";
import { StatusLabel, TierChip } from "@/components/ui/tags";
import { amountFor } from "@/lib/caseView";
import { formatDate, formatShort, incidentGlyph, incidentLabel } from "@/lib/format";
import type { Case } from "@/lib/types";

export interface CaseRowData {
  c: Case;
  incident: string | null;
}

// Cases page table: glyph + type + id, status, tier, amount, opened.
export function CaseTable({ rows }: { rows: CaseRowData[] }) {
  return (
    <div className="card rows overflow-hidden">
      <div className="row-item case-row row-head" aria-hidden>
        <span>Case</span>
        <span>Status</span>
        <span>Severity</span>
        <span>Amount</span>
        <span>Opened (UTC)</span>
        <span />
      </div>
      {rows.map(({ c, incident }) => {
        const amt = amountFor(c);
        const type = incident ? incidentLabel[incident] : "Incident";
        return (
          <Link key={c.id} className="row-item case-row" href={`/cases/${encodeURIComponent(c.id)}`}>
            <span className="flex min-w-0 items-center gap-3.5">
              <span className="role-glyph" aria-hidden style={{ width: 38, height: 38, fontSize: 13 }}>
                {incident ? incidentGlyph[incident] : "?"}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span style={{ fontWeight: 650 }}>{type}</span>
                <span className="mono truncate" style={{ color: "var(--ink-3)", fontSize: 12.5 }}>
                  {c.id}
                </span>
              </span>
            </span>
            <span className="flex flex-col items-start gap-1">
              <StatusLabel status={c.status} />
              <span className="show-sm cap">{amt.amount ? `${amt.amount} ${amt.kind}` : amt.kind}</span>
            </span>
            <span className="c-hide">
              <TierChip tier={c.tier} />
            </span>
            <span className="c-hide num" style={{ fontWeight: 600 }}>
              {amt.amount ?? "–"}
              <span className="cap" style={{ display: "block", fontWeight: 400 }}>
                {amt.kind}
              </span>
            </span>
            <span className="c-hide body-s muted">{formatDate(c.opened_at)}</span>
            <span className="c-hide chev" aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}

// Home page list: open layout, rows separated by hairlines.
export function CaseLines({ rows }: { rows: CaseRowData[] }) {
  return (
    <div className="flex flex-col" style={{ borderBottom: "1px solid var(--line)" }}>
      {rows.map(({ c, incident }) => {
        const amt = amountFor(c);
        return (
          <Link key={c.id} className="case-line" href={`/cases/${encodeURIComponent(c.id)}`}>
            <span className="flex min-w-0 flex-col gap-1">
              <span style={{ font: "650 18px/1.2 var(--font-display)", letterSpacing: "-0.01em" }}>{incident ? incidentLabel[incident] : "Incident"}</span>
              <span className="mono truncate" style={{ color: "var(--ink-3)", fontSize: 12.5 }}>
                {c.id}
              </span>
            </span>
            <span>
              <StatusLabel status={c.status} />
            </span>
            <span className="c-hide num" style={{ fontWeight: 600 }}>
              {amt.amount ?? "–"}
              <span className="cap" style={{ display: "block", fontWeight: 400 }}>
                {amt.kind}
              </span>
            </span>
            <span className="c-hide body-s muted">{formatShort(c.opened_at)}</span>
            <span className="c-hide chev" aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}
