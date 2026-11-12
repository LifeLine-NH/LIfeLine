"use client";

import Link from "next/link";
import { QuorumSeal } from "@/components/case/QuorumSeal";
import { LogoMark } from "@/components/layout/Logo";
import { ROLES, roleLabel } from "@/lib/format";
import { RULES } from "@/lib/rules";
import type { RunScript } from "@/lib/scenarios";
import type { Verdict } from "@/lib/types";
import { totalSteps, useRun } from "./useRun";

const VS: Record<Verdict, [string, string, string]> = { Yes: ["#3FD69B", "✓", "Yes"], No: ["#FF7A5C", "✕", "No"], Abstain: ["#A9ADB9", "–", "Abstained"] };
const DOING: Record<string, string> = {
  geo: "Comparing senders and timestamps…",
  fact: "Checking outside data sources…",
  sev: "Weighing households and services affected…",
  red: "Looking for a reason this is fake…",
};
const DOT: Record<string, string> = { bid: "#8C96FF", pay: "#3FD69B", proof: "#F2B24C", ok: "#3FD69B", no: "#FF7A5C", hold: "#FF7A5C" };
const UPPER: React.CSSProperties = { font: "600 12px/1 var(--font-body)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--stage-ink-2)" };

// Large screen run view for the demo video. Dark, readable from a distance, steps every 1.4s.
export function RunStage({ scripts, dataLabel, dataCls, agentsLabel }: { scripts: RunScript[]; dataLabel: string; dataCls: string; agentsLabel: string }) {
  const { script, step, running, run, pick } = useRun(scripts, 1400);
  if (!script) {
    return (
      <div className="stage fixed inset-0 z-50 grid place-items-center p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <p style={{ fontSize: 20 }}>No recorded scenario runs on the contract yet.</p>
          <Link href="/ops" style={{ color: "var(--stage-accent)" }}>
            Back to the ops console
          </Link>
        </div>
      </div>
    );
  }

  const total = totalSteps(script);
  const voteOf = (i: number) => script.votes.find((v) => v.role === ROLES[i]);
  const verdicts = ROLES.map((_, i) => {
    const v = voteOf(i);
    return v && step >= 2 + i ? v.verdict : null;
  });
  const yes = verdicts.filter((v) => v === "Yes").length;
  const no = verdicts.filter((v) => v === "No").length;
  const decided = step >= 6;
  const log = script.events.slice(0, Math.max(0, step - 6));
  const labels = ["Case", "Thinking", "Geo", "Fact", "Severity", "Red team", "Decision"].concat(
    script.events.map((e) => (e.kind === "bid" ? "Bid" : e.kind === "pay" ? "Payment" : e.kind === "proof" ? "Proof" : e.kind === "hold" ? "Withheld" : "Check")),
  );

  return (
    <div className="stage fixed inset-0 z-50 flex flex-col overflow-auto">
      <div className="flex min-h-full flex-col" style={{ minWidth: 1100 }}>
      <div className="flex flex-none items-center gap-6" style={{ height: 76, padding: "0 32px", borderBottom: "1px solid var(--stage-line)" }}>
        <Link href="/ops" className="flex items-center gap-2.5" style={{ font: "700 20px/1 var(--font-display)", letterSpacing: "-0.03em", color: "var(--stage-ink)", textDecoration: "none" }}>
          <LogoMark size={26} ring="#F2F1EC" dot="#8C96FF" />
          LifeLine ops
        </Link>
        <div role="group" aria-label="Scenario" className="flex gap-1.5" style={{ background: "var(--stage-2)", padding: 4, borderRadius: 12, border: "1px solid var(--stage-line)" }}>
          {scripts.map((s) => {
            const on = s.key === script.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => pick(s.key)}
                style={{ height: 34, padding: "0 14px", borderRadius: 8, border: 0, cursor: "pointer", font: "700 14px/1 var(--font-body)", background: on ? "#F2F1EC" : "transparent", color: on ? "#0E1014" : "#A9ADB9" }}
              >
                {s.key}
              </button>
            );
          })}
        </div>
        <span style={{ font: "600 17px/1.2 var(--font-body)" }}>{script.name}</span>
        <span className="ml-auto flex items-center gap-2.5" style={{ color: "var(--stage-ink-2)", fontSize: 14 }}>
          {running && (
            <>
              <span className="live-dot" />
              <span style={{ color: "#F2F1EC", fontWeight: 600 }}>Replaying</span>
            </>
          )}
          <span className="num">
            Step {step + 1} of {total}
          </span>
        </span>
        <span className="flex gap-1.5">
          <span className={`mode ${dataCls}`} style={{ cursor: "default" }}>
            <span className="mode-k">Data</span>
            {dataLabel}
          </span>
          <span className="mode m-replay" style={{ cursor: "default", background: "var(--stage-2)", color: "#F2F1EC", borderColor: "var(--stage-line)" }}>
            <span className="mode-k" style={{ color: "#A9ADB9" }}>
              Agents
            </span>
            {agentsLabel}
          </span>
        </span>
        <button
          type="button"
          onClick={() => run(script.key)}
          disabled={running}
          style={{ height: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#F2F1EC", color: "#0E1014", font: "700 15px/1 var(--font-body)", cursor: running ? "progress" : "pointer", opacity: running ? 0.7 : 1 }}
        >
          {running ? "Replaying…" : step >= total - 1 ? "Replay again" : "Replay"}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "360px minmax(0, 1fr) 400px", padding: "24px 32px 0" }}>
        <div className="s-card flex min-h-0 flex-col gap-4 overflow-hidden" style={{ padding: 22 }}>
          <div className="flex items-center justify-between gap-2">
            <span style={UPPER}>Case submitted</span>
            <span className="mono truncate" style={{ fontSize: 12, color: "var(--stage-ink-2)" }}>
              {script.caseId}
            </span>
          </div>
          <div style={{ font: "700 30px/1.05 var(--font-display)", letterSpacing: "-0.03em" }}>{script.title}</div>
          <div style={{ color: "var(--stage-ink-2)", fontSize: 14.5 }}>{script.meta}</div>
          <div className="flex min-h-0 flex-col gap-2.5">
            {script.reports.map((r, i) => (
              <div key={i} className="arrive flex flex-col gap-1.5" style={{ padding: "12px 14px", borderRadius: 12, background: "#20242D", border: "1px solid #2C313C" }}>
                <p style={{ fontSize: 14.5, lineHeight: 1.45, margin: 0 }}>{r.text}</p>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--stage-ink-2)" }}>
                  {r.meta}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 gap-3.5" style={{ gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}>
          {ROLES.map((role, i) => {
            const v = voteOf(i);
            const voted = !!v && step >= 2 + i;
            const thinking = !voted && step >= 1 && !!v;
            const [col, icon, word] = v ? VS[v.verdict] : ["#5E6372", "", ""];
            return (
              <div
                key={role}
                className={`s-card${thinking ? " scan" : ""}`}
                style={{
                  padding: "18px 22px",
                  display: "grid",
                  gridTemplateColumns: "52px minmax(0, 1fr) auto",
                  gap: 18,
                  alignItems: "center",
                  minHeight: 0,
                  transition: "border-color .3s",
                  ...(voted ? { borderColor: `${col}55` } : thinking ? { borderColor: "#8C96FF55" } : { opacity: 0.55 }),
                }}
              >
                <span
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    font: "700 20px/1 var(--font-display)",
                    background: role === "red" ? "#F2F1EC" : "#20242D",
                    color: role === "red" ? "#0E1014" : "#F2F1EC",
                  }}
                >
                  {roleLabel[role].glyph}
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-baseline gap-3">
                    <span style={{ font: "700 22px/1 var(--font-display)", letterSpacing: "-0.02em" }}>{roleLabel[role].name}</span>
                    <span style={{ fontSize: 13, color: "var(--stage-ink-2)" }}>{roleLabel[role].short}</span>
                  </div>
                  {!voted && !thinking && <span style={{ color: "#5E6372", fontSize: 16 }}>{v ? "Waiting for the case" : "No vote recorded"}</span>}
                  {thinking && (
                    <span className="flex items-center gap-3" style={{ color: "var(--stage-ink-2)", fontSize: 16 }}>
                      <span className="think">
                        <i />
                        <i />
                        <i />
                      </span>
                      {DOING[role]}
                    </span>
                  )}
                  {voted && (
                    <div className="arrive flex flex-col gap-1.5">
                      <span style={{ fontSize: 17, lineHeight: 1.35, color: "#F2F1EC" }}>{v!.reason ?? "Reasoning not in evidence storage."}</span>
                      {v!.tx &&
                        (v!.txUrl ? (
                          <a className="mono" href={v!.txUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--stage-accent)" }}>
                            tx {v!.tx} ↗
                          </a>
                        ) : (
                          <span className="mono" style={{ fontSize: 12, color: "var(--stage-ink-2)" }}>
                            sample tx
                          </span>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5" style={{ minWidth: 150 }}>
                  {voted && (
                    <span className="arrive flex flex-col items-end gap-1">
                      <span style={{ font: "800 30px/1 var(--font-display)", letterSpacing: "-0.02em", color: col }}>
                        {icon} {word}
                      </span>
                      <span className="num" style={{ fontSize: 14, color: "var(--stage-ink-2)" }}>
                        {v!.confidence}% confident
                      </span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-col gap-3.5">
          <div className="s-card flex items-center gap-5" style={{ padding: 20 }}>
            <QuorumSeal
              verdicts={verdicts}
              word={decided ? script.decision.word : "Counting"}
              tone={decided ? script.decision.tone : "progress"}
              sub={decided ? script.decision.sub : `${verdicts.filter(Boolean).length} of 4 voted`}
              size={150}
              dark
              animate={false}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <span style={UPPER}>Relief contract</span>
              <div className="flex justify-between" style={{ fontSize: 15 }}>
                <span style={{ color: "var(--stage-ink-2)" }}>Yes</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {yes} <span style={{ color: "#5E6372", fontWeight: 500 }}>/ {RULES.fundAtYes} funds</span>
                </span>
              </div>
              <div className="flex justify-between" style={{ fontSize: 15 }}>
                <span style={{ color: "var(--stage-ink-2)" }}>No</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {no} <span style={{ color: "#5E6372", fontWeight: 500 }}>/ {RULES.rejectAtNo} rejects</span>
                </span>
              </div>
              {decided && (
                <span className="arrive" style={{ fontSize: 14.5, lineHeight: 1.4, fontWeight: 600, color: script.decision.funded ? "#8C96FF" : "#FF7A5C" }}>
                  {script.decision.line}
                </span>
              )}
            </div>
          </div>

          <div className="s-card flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" style={{ padding: "14px 20px" }}>
            <span style={{ ...UPPER, marginBottom: 8 }}>After the decision</span>
            {log.length === 0 && (
              <span style={{ color: "#5E6372", fontSize: 15 }}>{decided && !script.decision.funded ? "Stopped. A rejected case never opens for bids." : "Bids, award, proof and payments appear here."}</span>
            )}
            {log.map((e, i) => (
              <div key={i} className="arrive grid items-baseline gap-2.5" style={{ gridTemplateColumns: "22px minmax(0, 1fr) auto", padding: "7px 0", borderTop: "1px solid var(--stage-line)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", marginTop: 5, background: DOT[e.kind] }} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span style={{ fontWeight: 650, fontSize: 15 }}>{e.title}</span>
                  <span style={{ fontSize: 13, color: "var(--stage-ink-2)" }}>{e.detail}</span>
                </span>
                <span className="num" style={{ fontWeight: 700, fontSize: 15, color: e.kind === "pay" ? "#3FD69B" : e.kind === "hold" ? "#FF7A5C" : "#F2F1EC" }}>
                  {e.amount ?? ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-none items-center" style={{ height: 64, marginTop: 20, padding: "0 32px", borderTop: "1px solid var(--stage-line)" }}>
        {labels.map((label, i) => (
          <span
            key={`${label}${i}`}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "8px 0",
              borderTop: `3px solid ${i <= step ? (i === step ? "#8C96FF" : "#F2F1EC") : "#2C313C"}`,
              color: i <= step ? "#F2F1EC" : "#5E6372",
            }}
          >
            {label}
          </span>
        ))}
      </div>
      </div>
    </div>
  );
}
