import { AccountText, RecLink } from "@/components/ui/links";
import { HashCheckCompact } from "@/components/ui/HashCheck";
import { ConfidenceMeter, Skel, TierChip, VerdictMark } from "@/components/ui/tags";
import { roleLabel } from "@/lib/format";
import type { Role, Vote, VoteRecord } from "@/lib/types";

export function VoteCard({ role, vote, record }: { role: Role; vote?: Vote; record?: VoteRecord | null }) {
  const label = roleLabel[role];
  return (
    <article className="card vote arrive" aria-label={`${label.name} verifier`}>
      <div className="vote-head">
        <div className="vote-role">
          <span className={`role-glyph${role === "red" ? " red" : ""}`} aria-hidden>
            {label.glyph}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="h3">{label.name}</h3>
            <span className="cap">{label.job}</span>
          </div>
        </div>
        <VerdictMark verdict={vote?.verdict ?? null} style={{ fontSize: 15 }} />
      </div>

      {vote ? (
        <div className="flex flex-col gap-4">
          <ConfidenceMeter bps={vote.confidence_bps} />
          {record?.reasoning ? (
            <p className="quote">{record.reasoning}</p>
          ) : (
            <p className="body-s muted">The vote record isn&apos;t in evidence storage, so its reasoning can&apos;t be shown. The verdict above is from the contract.</p>
          )}
          {record?.strongest_objection && (
            <p className="objection">
              <b>Strongest objection.</b> {record.strongest_objection}
            </p>
          )}
          {role === "sev" && vote.tier > 0 && (
            <p className="body-s flex items-center gap-2">
              <span className="faint">Proposed tier</span> <TierChip tier={vote.tier} />
            </p>
          )}
          <dl className="kv">
            <dt>Signed by</dt>
            <dd className="min-w-0">
              <AccountText id={vote.verifier} />
            </dd>
            {record?.model && (
              <>
                <dt>Model</dt>
                <dd className="mono" style={{ fontSize: 12.5 }}>
                  {record.model}
                </dd>
              </>
            )}
          </dl>
          <div className="vote-foot">
            <RecLink label="Vote transaction" tx={vote.tx_hash} />
            <RecLink label="Vote record" href={`/api/evidence/${vote.evidence_hash}`} external={false} />
            <HashCheckCompact hash={vote.evidence_hash} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="meter" aria-hidden>
            {Array.from({ length: 10 }, (_, k) => (
              <Skel key={k} h={6} />
            ))}
          </div>
          <p className="body-s muted">Hasn&apos;t voted yet. The vote will appear here, with its transaction, as soon as it&apos;s signed.</p>
        </div>
      )}
    </article>
  );
}
