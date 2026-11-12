import { contractUrl, SourceAmount } from "@/components/ui/links";
import { amountToNumber, formatAmount, percent, roleLabel } from "@/lib/format";
import { type Explanation as Ex, tally, tierCap } from "@/lib/caseView";
import { RULES } from "@/lib/rules";
import type { Case, ContractConfig, EvidenceBundle, Vote, VoteRecord } from "@/lib/types";

const SIDE: React.CSSProperties = {
  flex: "1 1 420px",
  minWidth: 0,
  background: "#FBFAF7",
  borderLeft: "1px solid var(--line)",
  padding: 28,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

// The cap is the lowest of three limits. Only the tier limit is stored on its own; the pool share and
// the daily limit left at decision time are not, so when the tier limit wasn't the lowest we say so
// instead of guessing numbers.
function CapCalculator({ c, cfg }: { c: Case; cfg: ContractConfig }) {
  const cap = BigInt(c.cap || "0");
  const tc = tierCap(cfg, c.tier);
  const tierWins = tc !== null && BigInt(tc) === cap;
  const href = contractUrl();
  const max = Math.max(amountToNumber(tc ?? "0"), amountToNumber(c.cap)) * 1.25 || 1;
  const width = (raw: string) => `${Math.max(4, Math.round((amountToNumber(raw) / max) * 100))}%`;

  const rows = [
    { label: `Tier ${c.tier} limit`, value: tc ? formatAmount(tc) : "Not set", w: tc ? width(tc) : "0%", min: tierWins },
    { label: `${percent(cfg.max_case_bps)} of available pool`, value: tierWins ? "Not lower" : "Not stored", w: "100%", min: false, unknown: true },
    { label: "Daily limit left", value: tierWins ? "Not lower" : "Not stored", w: "100%", min: false, unknown: true },
  ];

  return (
    <div style={SIDE}>
      <span className="eyebrow">How the contract set the cap</span>
      <span className="cap">The lowest of these three wins.</span>
      {rows.map((r) => (
        <div key={r.label} className={`capbar${r.min ? " min" : ""}`}>
          <span>{r.label}</span>
          <span className="bar">
            <i style={{ width: r.w, opacity: r.unknown ? 0.45 : 1 }} />
          </span>
          {r.unknown ? (
            <span className="cap v" style={{ textAlign: "right" }}>
              {r.value}
            </span>
          ) : (
            <SourceAmount href={href} className="v num" style={{ textAlign: "right" }}>
              {r.value}
            </SourceAmount>
          )}
        </div>
      ))}
      {!tierWins && (
        <p className="cap">The cap is below the tier limit, so the pool share or the daily limit left was lower. The contract doesn&apos;t store which.</p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-3" style={{ paddingTop: 14, borderTop: "1px dashed var(--line-2)" }}>
        <span style={{ fontWeight: 650 }}>Spending cap</span>
        <SourceAmount href={href} className="big-num" style={{ fontSize: 28 }}>
          {formatAmount(c.cap)}
        </SourceAmount>
      </div>
    </div>
  );
}

function Caught({ votes, records, bundle }: { votes: Vote[]; records: (VoteRecord | null)[]; bundle: EvidenceBundle | null }) {
  // The no vote the verifiers were most sure of, quoted from its signed record.
  const noVotes = votes.map((v, i) => ({ v, r: records[i] })).filter((x) => x.v.verdict === "No");
  const strongest = noVotes.sort((a, b) => b.v.confidence_bps - a.v.confidence_bps)[0];
  const contra = bundle?.external_evidence.filter((e) => e.supports === "no") ?? [];

  return (
    <div style={{ ...SIDE, gap: 14 }}>
      <span className="eyebrow">What the verifiers caught</span>
      {strongest?.r?.reasoning ? (
        <div style={{ background: "var(--surface)", border: "1px solid #EBB4A7", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="cap">
            {roleLabel[strongest.v.role].name} · voted no · {percent(strongest.v.confidence_bps)} confident
          </span>
          <p style={{ fontSize: 15, lineHeight: 1.55 }}>{strongest.r.reasoning}</p>
          {strongest.r.strongest_objection && (
            <p className="body-s muted">
              <b style={{ color: "var(--ink)" }}>Objection it weighed.</b> {strongest.r.strongest_objection}
            </p>
          )}
        </div>
      ) : (
        <p className="body-s muted">The vote records aren&apos;t in evidence storage, so their reasoning can&apos;t be quoted here.</p>
      )}
      {contra.length > 0 && (
        <ul className="flex flex-col gap-2">
          {contra.map((e) => (
            <li key={e.tool + e.raw_hash} className="body-s">
              <span className="verdict v-no" style={{ fontSize: 13 }}>
                {e.tool}
              </span>{" "}
              <span className="muted">{e.claim}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TwoRules({ votes }: { votes: Vote[] }) {
  const t = tally(votes);
  const row = (label: string, have: number, need: number) => (
    <div className="panel flex justify-between gap-3" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
      <span>{label}</span>
      <span className="num" style={{ fontWeight: 700 }}>
        {have} of {need}
      </span>
    </div>
  );
  return (
    <div style={{ ...SIDE, gap: 14 }}>
      <span className="eyebrow">The two rules</span>
      {row(`Fund: ${RULES.fundAtYes} yes votes`, t.yes, RULES.fundAtYes)}
      {row(`Reject: ${RULES.rejectAtNo} no votes`, t.no, RULES.rejectAtNo)}
      <p className="body-s muted">A coordinator reads the votes and evidence, then confirms or rejects the case. Their decision is recorded as its own transaction.</p>
    </div>
  );
}

export function ExplanationCard({
  ex,
  c,
  cfg,
  votes,
  records,
  bundle,
}: {
  ex: Ex;
  c: Case;
  cfg: ContractConfig;
  votes: Vote[];
  records: (VoteRecord | null)[];
  bundle: EvidenceBundle | null;
}) {
  return (
    <div className="card flex flex-wrap overflow-hidden">
      <div className="card-p flex min-w-0 flex-col gap-4.5" style={{ flex: "1 1 520px" }}>
        <h2 className="h2">{ex.title}</h2>
        <ol className="flex flex-col gap-4">
          {ex.lines.map((t, i) => (
            <li key={t} className="grid gap-3" style={{ gridTemplateColumns: "32px minmax(0, 1fr)" }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--sunken)", display: "grid", placeItems: "center", font: "700 13px/1 var(--font-display)" }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 16, lineHeight: 1.55, textWrap: "pretty" }}>{t}</span>
            </li>
          ))}
        </ol>
      </div>
      {ex.panel === "cap" && <CapCalculator c={c} cfg={cfg} />}
      {ex.panel === "caught" && <Caught votes={votes} records={records} bundle={bundle} />}
      {ex.panel === "rules" && <TwoRules votes={votes} />}
    </div>
  );
}
