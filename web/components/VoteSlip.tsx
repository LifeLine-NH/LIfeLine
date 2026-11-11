import { roleLabel } from "@/lib/format";
import type { Role, Verdict, Vote, VoteRecord } from "@/lib/types";
import { HashCheck } from "./HashCheck";
import { AccountLink, TxLink } from "./Links";

const verdictStyle: Record<Verdict, { strip: string; text: string; word: string }> = {
  Yes: { strip: "bg-verified", text: "text-verified", word: "Yes" },
  No: { strip: "bg-stamp", text: "text-stamp", word: "No" },
  Abstain: { strip: "bg-line", text: "text-muted", word: "Abstained" },
};

// One verifier's vote, styled like a triage tag: the colored strip is the verdict.
export function VoteSlip({ role, vote, record }: { role: Role; vote?: Vote; record?: VoteRecord | null }) {
  const label = roleLabel[role];

  if (!vote) {
    return (
      <article className="flex rounded-md border border-dashed border-line bg-paper">
        <div className="w-2 shrink-0 rounded-l-md bg-chalk" aria-hidden />
        <div className="p-4">
          <h3 className="font-display text-2xl font-bold">{label.name}</h3>
          <p className="mt-1 text-sm text-muted">{label.job}</p>
          <p className="mt-3 text-sm font-medium text-muted">Hasn&apos;t voted yet.</p>
        </div>
      </article>
    );
  }

  const style = verdictStyle[vote.verdict];
  return (
    <article className="flex rounded-md border border-line bg-paper">
      <div className={`w-2 shrink-0 rounded-l-md ${style.strip}`} aria-hidden />
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-2xl font-bold">{label.name}</h3>
          <span className={`text-lg font-bold ${style.text}`}>{style.word}</span>
        </div>
        <p className="text-sm text-muted">{label.job}</p>

        <div className="mt-3" title={`Confidence ${(vote.confidence_bps / 100).toFixed(0)}%`}>
          <div className="h-1.5 rounded bg-chalk">
            <div className={`h-1.5 rounded ${style.strip}`} style={{ width: `${vote.confidence_bps / 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">Confidence {(vote.confidence_bps / 100).toFixed(0)}%</p>
        </div>

        {record?.reasoning && <p className="mt-3 text-[0.95rem] leading-relaxed">{record.reasoning}</p>}
        {record?.strongest_objection && (
          <p className="mt-2 text-sm text-muted">Strongest objection: {record.strongest_objection}</p>
        )}
        {role === "sev" && vote.tier > 0 && <p className="mt-2 text-sm font-semibold">Proposed tier {vote.tier}</p>}

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted">Signed by</dt>
            <dd className="min-w-0">
              <AccountLink id={vote.verifier} />
            </dd>
          </div>
          {record?.model && (
            <div className="flex gap-2">
              <dt className="text-muted">Model</dt>
              <dd>{record.model}</dd>
            </div>
          )}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <TxLink hash={vote.tx_hash} label="Vote tx" />
          <a href={`/api/evidence/${vote.evidence_hash}`} className="text-tarp underline underline-offset-2">
            Vote record
          </a>
          <HashCheck hash={vote.evidence_hash} />
        </div>
      </div>
    </article>
  );
}
