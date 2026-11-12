"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { arcGeometry } from "@/components/case/QuorumSeal";
import type { StatusTone } from "@/lib/format";
import type { Verdict } from "@/lib/types";

export interface ReplayCase {
  key: string;
  label: string;
  id: string;
  input: string;
  word: string;
  tone: StatusTone;
  sub: string;
  votes: { verdict: Verdict | null; confidence: number | null; reason: string | null }[];
}

const ROLE_NAMES = ["Geo", "Fact", "Severity", "Red team"];
const LETTERS = ["G", "F", "S", "R"];
const COL: Record<Verdict, string> = { Yes: "#0A7A55", No: "#BE321A", Abstain: "#8C909C" };
const VCLS: Record<Verdict, string> = { Yes: "verdict v-yes", No: "verdict v-no", Abstain: "verdict v-abs" };
const VWORD: Record<Verdict, string> = { Yes: "Yes", No: "No", Abstain: "Abstained" };
const TONE: Record<StatusTone, string> = { progress: "#0B6F86", funded: "#3442D9", delivered: "#0A7A55", review: "#94570A", rejected: "#BE321A", expired: "#5B6070" };

function prefersReduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Replays a case's recorded votes: arcs fill one by one, then the contract's outcome lands.
export function HeroReplay({ cases, footnote }: { cases: ReplayCase[]; footnote: string }) {
  const [pick, setPick] = useState(0);
  const [shown, setShown] = useState(4);
  const [decided, setDecided] = useState(true);
  const [sel, setSel] = useState(3);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = useCallback(() => {
    clear();
    if (prefersReduced()) {
      setShown(4);
      setDecided(true);
      return;
    }
    setShown(0);
    setDecided(false);
    [1, 2, 3, 4].forEach((n) =>
      timers.current.push(
        setTimeout(() => {
          setShown(n);
          setSel(n - 1);
        }, 400 + n * 750),
      ),
    );
    timers.current.push(setTimeout(() => setDecided(true), 400 + 4 * 750 + 700));
  }, []);

  useEffect(() => {
    const t = setTimeout(play, 0);
    return () => {
      clearTimeout(t);
      clear();
    };
  }, [play]);

  const f = cases[pick];
  if (!f) return null;
  const voted = (i: number) => i < shown && f.votes[i].verdict !== null;
  const isDecided = decided && shown >= 4;
  const selVote = f.votes[sel];

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col items-center gap-5.5" style={{ flex: "1 1 440px", maxWidth: 520 }}>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {cases.length > 1 && (
          <div className="seg" role="group" aria-label="Choose a recorded case">
            {cases.map((c, i) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={i === pick}
                onClick={() => {
                  setPick(i);
                  setTimeout(play, 0);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={play} aria-label="Replay the votes">
          <span className="ico ico-replay" />
          Replay
        </button>
      </div>

      <p className="mono text-center" style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 440, minHeight: 40 }}>
        {f.input}
      </p>

      <div
        role="img"
        aria-label={isDecided ? `${f.word}. ${f.sub}` : `Checking. ${shown} of 4 voted`}
        className="relative grid w-full place-items-center"
        style={{ maxWidth: 330, aspectRatio: "1 / 1" }}
      >
        <svg viewBox="0 0 120 120" aria-hidden className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
          <circle cx="60" cy="60" r="57.5" fill="none" stroke="#E3E1D9" strokeWidth="0.6" />
          <circle cx="60" cy="60" r="35" fill="#FFFFFF" stroke="#E3E1D9" strokeWidth="0.6" />
          {LETTERS.map((letter, i) => {
            const g = arcGeometry(i);
            const v = f.votes[i].verdict;
            return (
              <g key={letter}>
                <circle cx="60" cy="60" r="46" fill="none" stroke="#ECEBE5" strokeWidth="10" strokeDasharray="67.4 300" transform={`rotate(${g.rot} 60 60)`} />
                <circle
                  className="arc"
                  cx="60"
                  cy="60"
                  r="46"
                  fill="none"
                  stroke={v ? COL[v] : "#E3E1D9"}
                  strokeWidth={i === sel && voted(i) ? 13 : 10}
                  strokeDasharray="67.4 300"
                  style={{ strokeDashoffset: voted(i) ? 0 : 67.4 }}
                  transform={`rotate(${g.rot} 60 60)`}
                />
                <text x={g.lx} y={g.ly} textAnchor="middle" dominantBaseline="central" fontSize="6.5" fontWeight="700" fill="#62677A" fontFamily="Inter, sans-serif">
                  {letter}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="relative text-center" style={{ width: "54%" }}>
          {isDecided ? (
            <div className="seal-core" key={f.key}>
              <div className="seal-word" style={{ fontSize: "clamp(26px, 3.2vw, 36px)", color: TONE[f.tone] }}>
                {f.word}
              </div>
              <div className="seal-sub">{f.sub}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              <span className="think" aria-hidden>
                <i style={{ background: "var(--accent)" }} />
                <i style={{ background: "var(--accent)" }} />
                <i style={{ background: "var(--accent)" }} />
              </span>
              <span style={{ font: "650 17px/1 var(--font-display)" }}>Checking</span>
              <span className="seal-sub" style={{ margin: 0 }}>
                {shown} of 4 voted
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid w-full gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }} role="group" aria-label="Verifier votes">
        {f.votes.map((v, i) => {
          const on = voted(i);
          return (
            <button
              key={ROLE_NAMES[i]}
              type="button"
              className="vbtn"
              aria-pressed={i === sel}
              onClick={() => setSel(i)}
              style={{ borderTopColor: on && v.verdict ? COL[v.verdict] : "#E3E1D9" }}
            >
              <span style={{ fontWeight: 650, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{ROLE_NAMES[i]}</span>
              <span className={on && v.verdict ? VCLS[v.verdict] : "verdict v-wait"} style={{ fontSize: 13 }}>
                {on && v.verdict ? VWORD[v.verdict] : "Waiting"}
              </span>
              <span className="num cap">{on && v.confidence !== null ? `${v.confidence}% confident` : "–"}</span>
            </button>
          );
        })}
      </div>
      <div className="w-full" style={{ minHeight: 72 }} aria-live="polite">
        <p className="quote-in" key={`${f.key}-${sel}-${voted(sel)}`} style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--ink)" }}>
          <b>{ROLE_NAMES[sel]}:</b>{" "}
          {voted(sel) ? (selVote.reason ?? "The vote record isn't in evidence storage, so its reasoning can't be shown.") : selVote.verdict ? "Waiting for this vote in the replay." : "Hasn't voted yet."}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-3" style={{ paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <span className="cap">
          {footnote} ·{" "}
          <span className="mono" style={{ fontSize: 12 }}>
            {f.id}
          </span>
        </span>
        <Link className="rec" href={`/cases/${encodeURIComponent(f.id)}`}>
          Open the case file
        </Link>
      </div>
    </div>
  );
}
