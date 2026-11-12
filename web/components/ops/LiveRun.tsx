"use client";

import { QuorumSeal } from "@/components/case/QuorumSeal";
import { ROLES, roleLabel } from "@/lib/format";
import { RULES } from "@/lib/rules";
import { type RunScript, SCENARIOS } from "@/lib/scenarios";
import type { Verdict } from "@/lib/types";
import Link from "next/link";
import { type RunInfo, totalSteps, useRun } from "./useRun";

const VCLS: Record<Verdict, string> = { Yes: "verdict v-yes", No: "verdict v-no", Abstain: "verdict v-abs" };
const VWORD: Record<Verdict, string> = { Yes: "Yes", No: "No", Abstain: "Abstained" };

const dot = (bg: string, fg: string): React.CSSProperties => ({
  width: 30,
  height: 30,
  borderRadius: 9,
  display: "grid",
  placeItems: "center",
  font: "700 13px/1 var(--font-display)",
  background: bg,
  color: fg,
});

function TxLinkSmall({ url, label = "Transaction" }: { url: string | null; label?: string }) {
  if (!url) return null;
  return (
    <a className="rec" href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
      {label}
    </a>
  );
}

export function OpsConsole({ scripts, missing, sample, chainLabel }: { scripts: RunScript[]; missing: string[]; sample: boolean; chainLabel: string }) {
  const { script, step, running, pending, error, info, start, replay } = useRun(scripts, 1200);

  return (
    <>
      <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}>
        {SCENARIOS.map((s) => {
          const has = scripts.some((x) => x.key === s.key);
          const current = script?.key === s.key;
          return (
            <article key={s.key} className="card flex flex-col gap-3" style={{ padding: 20 }}>
              <div className="flex items-center justify-between gap-2.5">
                <span className="mono" style={{ fontWeight: 500, color: "var(--ink-3)" }}>
                  {s.key}
                </span>
                <span className={`status s-${s.tone}`}>{s.expect}</span>
              </div>
              <h2 className="h3">{s.name}</h2>
              <p className="body-s muted" style={{ flex: 1 }}>
                {s.about}
              </p>
              <button type="button" className={`btn btn-block ${current ? "btn-primary" : "btn-secondary"}${running && current ? " btn-busy" : ""}`} disabled={running} onClick={() => start(s.key)}>
                {running && current && <span className="spin" />}
                {running && current ? (pending ? "Agents working…" : "Running…") : `Run ${s.key}`}
              </button>
              {has && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={running} onClick={() => replay(s.key)}>
                  Replay the recorded case
                </button>
              )}
            </article>
          );
        })}
      </section>
      <p className="cap">
        Run sends the scenario&apos;s reports through the agent runner: four verifiers vote, the contract decides, simulated NGOs bid and deliver.{" "}
        {sample ? "Sample data mode: the runner uses its own in memory chain, so nothing is written anywhere." : `Every step is a ${chainLabel} transaction.`}
        {missing.length > 0 && !sample ? ` No recorded case yet for ${missing.join(", ")}.` : ""}
      </p>
      {error && (
        <div className="notice n-block" role="alert">
          <span>
            <b>The run didn&apos;t finish.</b> {error}
          </span>
        </div>
      )}

      {script && <Feed script={script} step={step} running={running} pending={pending} info={info} />}
    </>
  );
}

function Feed({ script, step, running, pending, info }: { script: RunScript; step: number; running: boolean; pending: boolean; info: RunInfo | null }) {
  const total = totalSteps(script);
  const feed: React.ReactNode[] = [];
  const voteOf = (i: number) => script.votes.find((v) => v.role === ROLES[i]);

  if (step >= 0) {
    feed.push(
      <FeedItem key="case" glyph={<span style={dot("#EFEEE8", "#15171C")}>C</span>} title={pending ? "Submitting the case" : "Case submitted"} detail={pending ? `${script.key} · ${script.name} · clustering reports` : `${script.key} · ${script.name} · ${script.caseId}`} />,
    );
  }
  if (step >= 1) {
    ROLES.forEach((role, i) => {
      const v = voteOf(i);
      const voted = !!v && step >= 2 + i;
      const thinking = pending || (!!v && !voted);
      const name = roleLabel[role].name;
      feed.push(
        <FeedItem
          key={role}
          glyph={<span style={dot(role === "red" ? "#15171C" : "#EFEEE8", role === "red" ? "#fff" : "#15171C")}>{roleLabel[role].glyph}</span>}
          title={voted ? `${name} voted` : thinking ? `${name} is thinking` : `${name} hasn't voted`}
          detail={voted ? `${v!.reason ?? "Reasoning not in evidence storage."} ${v!.confidence}% confident.` : thinking ? "Checking the case…" : "No vote recorded for this verifier."}
          right={
            voted ? (
              <>
                <span className={VCLS[v!.verdict]}>{VWORD[v!.verdict]}</span>
                <TxLinkSmall url={v!.txUrl} />
              </>
            ) : thinking ? (
              <span className="think" aria-label="Thinking">
                <i style={{ background: "var(--accent)" }} />
                <i style={{ background: "var(--accent)" }} />
                <i style={{ background: "var(--accent)" }} />
              </span>
            ) : null
          }
        />,
      );
    });
  }
  if (step >= 6) {
    const d = script.decision;
    feed.push(
      <FeedItem
        key="decision"
        glyph={<span style={dot(d.funded ? "#ECEEFE" : "#FBE8E2", d.funded ? "#3442D9" : "#BE321A")}>§</span>}
        title={`Contract decision: ${d.word}`}
        detail={d.line}
      />,
    );
  }
  script.events.slice(0, Math.max(0, step - 6)).forEach((e, i) => {
    const bad = e.kind === "no" || e.kind === "hold";
    feed.push(
      <FeedItem
        key={`e${i}`}
        glyph={<span style={dot(bad ? "#FBE8E2" : "#E2F4EC", bad ? "#BE321A" : "#0A7A55")}>→</span>}
        title={e.title}
        detail={e.detail}
        right={e.amount ? <span className="num" style={{ fontWeight: 650 }}>{e.amount}</span> : null}
      />,
    );
  });

  const verdicts = ROLES.map((_, i) => {
    const v = voteOf(i);
    return v && step >= 2 + i ? v.verdict : null;
  });
  const decided = step >= 6;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)" }}>
        <div className="flex items-center gap-3">
          {running && <span className="live-dot" />}
          <h2 className="h2">{info ? "Latest run" : "Run"}</h2>
          <span className="tag">
            {script.key} · {script.name}
          </span>
        </div>
        <span className="cap num flex flex-wrap items-center gap-3">
          {info && (
            <span>
              {info.mode === "live" ? "Live agents" : "Recorded model answers"} · {info.chainMode === "stub" ? "in memory chain" : `${info.chainMode} transactions`}
            </span>
          )}
          {info?.onChain && info.caseId && (
            <Link className="rec" href={`/cases/${encodeURIComponent(info.caseId)}`}>
              Open the case file
            </Link>
          )}
          <span>{pending ? "Waiting for the agents" : `Step ${Math.min(step + 1, total)} of ${total}`}</span>
        </span>
      </div>
      <div className="flex flex-wrap">
        <ol className="min-w-0" style={{ flex: "1.6 1 520px", padding: "8px 24px 20px" }} aria-live="polite">
          {feed}
        </ol>
        <div className="flex min-w-0 flex-col items-center gap-4.5" style={{ flex: "1 1 300px", background: "#FBFAF7", borderLeft: "1px solid var(--line)", padding: 28 }}>
          <span className="eyebrow">Contract</span>
          <QuorumSeal
            verdicts={verdicts}
            word={decided ? script.decision.word : "Counting"}
            tone={decided ? script.decision.tone : "progress"}
            sub={decided ? script.decision.sub : `${verdicts.filter(Boolean).length} of 4 voted`}
            size={200}
            animate={false}
          />
          <p className="body-s muted text-center">
            Funds at {RULES.fundAtYes} yes. Rejects at {RULES.rejectAtNo} no. Anything else goes to a coordinator.
          </p>
        </div>
      </div>
    </section>
  );
}

function FeedItem({ glyph, title, detail, right }: { glyph: React.ReactNode; title: string; detail: string; right?: React.ReactNode }) {
  return (
    <li className="arrive grid items-start gap-3.5" style={{ gridTemplateColumns: "30px minmax(0, 1fr) auto", padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
      {glyph}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span style={{ fontWeight: 650 }}>{title}</span>
        <span className="body-s muted">{detail}</span>
      </span>
      <span className="flex flex-col items-end gap-1">{right}</span>
    </li>
  );
}
