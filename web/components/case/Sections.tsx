import { Countdown } from "@/components/ui/Countdown";
import { HashCheck, HashCheckCompact } from "@/components/ui/HashCheck";
import { AccountText, RecLink, SourceAmount } from "@/components/ui/links";
import { ComingNextTag, SimulatedTag, ToneLabel, VerdictMark } from "@/components/ui/tags";
import { type PaymentOption, PayoutQuote } from "./PayoutQuote";
import { config } from "@/lib/config";
import { formatAmount, formatShort, nanosToMs, percent, roleLabel, shortAccount, sourceTypeLabel } from "@/lib/format";
import { RULES } from "@/lib/rules";
import type { Bid, Case, ContractConfig, DeliveryVote, EvidenceBundle } from "@/lib/types";

const big = (v: string | undefined) => BigInt(v || "0");

export function BidsSection({ c, bids }: { c: Case; bids: Bid[] }) {
  if (bids.length === 0 && c.status !== "Bidding") return null;
  const sorted = [...bids].sort((a, b) => (big(a.ask) < big(b.ask) ? -1 : big(a.ask) > big(b.ask) ? 1 : 0));
  const winnerAsk = bids.find((b) => b.ngo === c.winner)?.ask;

  const result = (b: Bid) => {
    if (c.status === "Bidding") return <span className="tag">Bid placed</span>;
    if (b.ngo === c.winner) return <ToneLabel tone="delivered">Won</ToneLabel>;
    if (winnerAsk && big(b.ask) > big(winnerAsk)) return <span className="tag">Higher price</span>;
    return <span className="tag">Not chosen</span>;
  };

  return (
    <section id="bids" className="wrap scroll-mt-24" style={{ paddingBottom: 56 }}>
      <div className="sec-head">
        <div className="flex flex-col gap-1.5">
          <h2 className="h1">Bids</h2>
          <p className="muted">The lowest ask under the cap wins, if the responder meets the reputation and delivery time rules.</p>
        </div>
        {c.status === "Bidding" && (
          <div className="flex flex-col items-end gap-0.5">
            <span className="cap">Bidding closes in</span>
            <Countdown endsAtMs={nanosToMs(c.bidding_ends_at)} endedText="Closed" className="big-num" />
          </div>
        )}
      </div>
      {sorted.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", borderStyle: "dashed", boxShadow: "none", background: "transparent" }}>
          <p className="muted">No bids yet. They appear here with their transactions as they arrive.</p>
        </div>
      ) : (
        <div className="card rows overflow-hidden">
          <div className="row-item bid-row row-head" aria-hidden>
            <span>Responder</span>
            <span>Ask</span>
            <span>Delivery time</span>
            <span>Result</span>
          </div>
          {sorted.map((b) => (
            <div key={b.ngo + b.ask} className={`row-item bid-row${b.ngo === c.winner ? " win" : ""}`}>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <AccountText id={b.ngo} style={{ fontWeight: 650, fontFamily: "var(--font-body)", fontSize: 15 }} />
                  {b.simulated && <SimulatedTag />}
                </span>
                <span className="cap">Bid placed {formatShort(b.at)}</span>
              </div>
              <div>
                <span className="cell-k">Ask</span>
                <SourceAmount tx={b.tx_hash} className="num" style={{ fontWeight: 650, fontSize: 17 }}>
                  {formatAmount(b.ask)}
                </SourceAmount>
              </div>
              <div>
                <span className="cell-k">Delivery time</span>
                <span className="num" style={{ fontWeight: 550 }}>
                  {b.eta_hours} hours
                </span>
              </div>
              <div className="flex flex-col items-start gap-1.5">
                {result(b)}
                <RecLink label="Bid transaction" tx={b.tx_hash} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type ProofRecord = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function ProofSection({
  c,
  proof,
  delivery,
  deliveryReasons,
}: {
  c: Case;
  proof: ProofRecord | null;
  delivery: DeliveryVote[];
  deliveryReasons: (string | null)[];
}) {
  if (!c.proof_hash) return null;
  const ok = delivery.filter((d) => d.ok).length;
  const bad = delivery.length - ok;
  const reached = num(proof?.households_reached);
  const planned = num(proof?.planned_households);
  const loc = proof?.location as { lat?: number; lon?: number } | string | undefined;
  const photos = Array.isArray(proof?.photo_hashes) ? (proof!.photo_hashes as unknown[]).length : undefined;
  const ngo = str(proof?.ngo_account) ?? c.winner ?? undefined;
  const at = str(proof?.delivered_at);

  return (
    <section id="proof" className="wrap scroll-mt-24" style={{ paddingBottom: 56 }}>
      <div className="sec-head">
        <div className="flex flex-col gap-1.5">
          <h2 className="h1">Proof of delivery</h2>
          <p className="muted">
            Submitted by {ngo ? shortAccount(ngo, 40) : "the responder"}
            {at ? ` on ${formatShort(at)}` : ""}. At least {RULES.deliveryAgree} of 4 verifiers must agree before the second payment.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="card card-p flex min-w-0 flex-col gap-4" style={{ flex: "1 1 420px" }}>
          <span className="eyebrow">Proof record</span>
          {proof ? (
            <>
              {str(proof.summary) && <p className="quote">{str(proof.summary)}</p>}
              <dl className="kv">
                {reached !== undefined && (
                  <>
                    <dt>Households</dt>
                    <dd>
                      <span className="num" style={{ fontWeight: 650 }}>
                        {reached.toLocaleString("en-US")}
                      </span>{" "}
                      <span className="faint">reached{planned !== undefined ? ` · plan was ${planned.toLocaleString("en-US")}` : ""}</span>
                    </dd>
                  </>
                )}
                {loc && (
                  <>
                    <dt>Location</dt>
                    <dd className="mono">{typeof loc === "string" ? loc : `${loc.lat?.toFixed(3)}, ${loc.lon?.toFixed(3)}`}</dd>
                  </>
                )}
                {photos !== undefined && (
                  <>
                    <dt>Photos</dt>
                    <dd>{photos} attached</dd>
                  </>
                )}
              </dl>
            </>
          ) : (
            <p className="body-s muted">The proof record isn&apos;t in evidence storage, so it can&apos;t be shown here. Its hash is still on NEAR.</p>
          )}
          {c.proof_uri && (
            <div>
              <a className="btn btn-secondary btn-sm" href={c.proof_uri}>
                Open the proof
              </a>
            </div>
          )}
          <HashCheck hash={c.proof_hash} label="Proof record" />
        </div>

        <div className="card min-w-0 overflow-hidden" style={{ flex: "1.3 1 520px" }}>
          <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontWeight: 650 }}>Delivery check</span>
            {delivery.length > 0 && (
              <ToneLabel tone={ok >= RULES.deliveryAgree ? "delivered" : bad > 4 - RULES.deliveryAgree ? "rejected" : "progress"}>
                {ok} of 4 agree · needs {RULES.deliveryAgree}
              </ToneLabel>
            )}
          </div>
          {delivery.length === 0 ? (
            <p className="body-s muted" style={{ padding: "18px 22px" }}>
              The verifiers haven&apos;t checked this proof yet.
            </p>
          ) : (
            <div className="rows">
              {delivery.map((d, i) => (
                <div key={d.role} className="row-item items-start" style={{ gridTemplateColumns: "96px minmax(0, 1fr)" }}>
                  <span style={{ fontWeight: 650 }}>{roleLabel[d.role].name}</span>
                  <div className="flex flex-col gap-1.5">
                    <VerdictMark verdict={d.ok ? "Yes" : "No"}>{d.ok ? "Delivery checks out" : "Doesn't check out"}</VerdictMark>
                    {deliveryReasons[i] && <span className="body-s muted">{deliveryReasons[i]}</span>}
                    <span className="flex flex-wrap items-center gap-3.5">
                      <RecLink label="Vote transaction" tx={d.tx_hash} />
                      <HashCheckCompact hash={d.evidence_hash} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Payout in another asset through NEAR Intents: a live dry quote per payment. Executing it is coming next.
export function PayoutPreview({ c, cfg }: { c: Case; cfg: ContractConfig }) {
  if (!c.winner || big(c.award_amount) === BigInt(0)) return null;
  const firstPaid = big(c.tranche1_paid) > BigInt(0);
  const first = firstPaid ? big(c.tranche1_paid) : (big(c.award_amount) * BigInt(cfg.tranche1_bps)) / BigInt(10000);
  const secondPaid = big(c.tranche2_paid) > BigInt(0);
  const second = secondPaid ? big(c.tranche2_paid) : big(c.award_amount) - first;
  const payments: PaymentOption[] = [
    { key: "first", label: `First payment (${percent(cfg.tranche1_bps)}${firstPaid ? ", paid" : ""})`, short: firstPaid ? "First, paid" : "First", amount: first.toString(), display: formatAmount(first) },
  ];
  if (second > BigInt(0)) {
    payments.push({ key: "second", label: `Second payment${secondPaid ? " (paid)" : " (after delivery check)"}`, short: secondPaid ? "Second, paid" : "Second, after check", amount: second.toString(), display: formatAmount(second) });
  }
  const notMainnet = config.chainMode !== "mainnet";

  return (
    <section className="wrap" style={{ paddingBottom: 56 }}>
      <div className="card flex flex-wrap items-start gap-6" style={{ padding: "24px 28px" }}>
        <div className="flex min-w-0 flex-col gap-2" style={{ flex: "1 1 300px" }}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="tag" style={{ background: "var(--st-delivered-tint)", color: "var(--st-delivered)" }}>
              Live quote
            </span>
            <ComingNextTag />
          </span>
          <h2 className="h3">Payout in the asset and chain the responder prefers</h2>
          <p className="body-s muted">
            NEAR Intents can deliver a payment as USDC on another chain. The quote is live from the 1Click API as a dry run, so nothing moves. Sending the payout this way is coming next.
          </p>
          {notMainnet && (
            <p className="cap">
              {config.chainMode === "stub" ? "This case is sample data" : "This pool pays a testnet token"}, and NEAR Intents has no testnet, so the quote prices the same amount of real USDC on NEAR mainnet.
            </p>
          )}
        </div>
        <PayoutQuote payments={payments} winner={shortAccount(c.winner, 28)} />
      </div>
    </section>
  );
}

export function EvidenceSection({ c, bundle }: { c: Case; bundle: EvidenceBundle | null }) {
  const sources = bundle ? new Set(bundle.reports.map((r) => r.source_id_hash)).size : 0;
  return (
    <section id="evidence" className="scroll-mt-16" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)" }}>
      <div className="wrap section flex flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <h2 className="h1">Evidence</h2>
          <p className="muted" style={{ maxWidth: 720 }}>
            Reports stay off chain to protect the people who sent them. Only this record&apos;s hash is stored on NEAR.
          </p>
        </div>
        <HashCheck hash={c.bundle_hash} label="Evidence bundle" buttonLabel="Check the evidence bundle" />

        {bundle ? (
          <div className="flex flex-wrap gap-8">
            <div className="flex min-w-0 flex-col gap-3" style={{ flex: "1 1 480px" }}>
              <h3 className="h3">
                Field reports{" "}
                <span className="faint" style={{ fontWeight: 500 }}>
                  · {bundle.reports.length} reports, {sources} {sources === 1 ? "source" : "sources"}
                </span>
              </h3>
              {bundle.reports.map((r, i) => (
                <article key={i} className="flex flex-col gap-2.5" style={{ background: "#FBFAF7", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" }}>
                  <p style={{ fontSize: 15.5, lineHeight: 1.5 }}>&ldquo;{r.text}&rdquo;</p>
                  <div className="cap flex flex-wrap items-center gap-x-3.5 gap-y-2">
                    <span className="tag">{sourceTypeLabel[r.source_type] ?? r.source_type}</span>
                    <span className="mono" style={{ fontSize: 12 }} title="Anonymous sender id">
                      anon-{r.source_id_hash.slice(0, 4)}
                    </span>
                    <span>{formatShort(r.ts)}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-3" style={{ flex: "1 1 420px" }}>
              <h3 className="h3">Outside sources checked</h3>
              {bundle.external_evidence.length === 0 ? (
                <p className="body-s muted">No outside sources were checked for this case.</p>
              ) : (
                <div className="card rows" style={{ boxShadow: "none" }}>
                  {bundle.external_evidence.map((e) => (
                    <div key={e.tool + e.raw_hash} className="row-item items-start" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="mono" style={{ fontWeight: 500, color: "var(--ink)" }}>
                          {e.tool}
                        </span>
                        <span className="body-s">{e.claim}</span>
                        {config.chainMode === "stub" ? (
                          <span className="rec-off">
                            <span className="src-sample">Source</span>
                          </span>
                        ) : (
                          <a className="rec" href={e.url} target="_blank" rel="noreferrer">
                            Source
                          </a>
                        )}
                      </div>
                      <VerdictMark verdict={e.supports === "yes" ? "Yes" : e.supports === "no" ? "No" : "Abstain"}>
                        {e.supports === "yes" ? "Supports" : e.supports === "no" ? "Contradicts" : "Unclear"}
                      </VerdictMark>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="notice n-plain">
            <span>The evidence record isn&apos;t in storage, so the reports can&apos;t be shown or checked here. Its hash is still on NEAR.</span>
          </div>
        )}
      </div>
    </section>
  );
}
