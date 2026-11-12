"use client";

import { useState } from "react";
import { shortHash } from "@/lib/format";
import { hashCanonical } from "@/lib/hash";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "match" }
  | { kind: "mismatch"; got: string }
  | { kind: "error"; message: string };

// Honesty rule 4: download the off chain record and hash it in the browser, so nobody has to trust our server.
async function runCheck(hash: string): Promise<State> {
  try {
    const res = await fetch(`/api/evidence/${hash}`, { cache: "no-store" });
    if (!res.ok) {
      return {
        kind: "error",
        message: res.status === 404 ? "The record isn't in evidence storage, so nothing was compared." : `The evidence server answered ${res.status}, so nothing was compared.`,
      };
    }
    const got = await hashCanonical(await res.json());
    return got === hash ? { kind: "match" } : { kind: "mismatch", got };
  } catch {
    return { kind: "error", message: "The evidence server didn't respond, so nothing was compared." };
  }
}

function useHashCheck(hash: string) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const run = async () => {
    setState({ kind: "checking" });
    setState(await runCheck(hash));
  };
  return { state, run };
}

export function HashCheck({ hash, label, buttonLabel = "Check hash" }: { hash: string; label: string; buttonLabel?: string }) {
  const { state, run } = useHashCheck(hash);
  const tone = {
    idle: { b: "var(--line)", bg: "var(--surface)" },
    checking: { b: "#CDD2FB", bg: "var(--surface)" },
    match: { b: "#A9D9C4", bg: "#F5FBF8" },
    mismatch: { b: "#EBB4A7", bg: "#FEF6F4" },
    error: { b: "#EFD29F", bg: "var(--surface)" },
  }[state.kind];
  const done = state.kind === "match" || state.kind === "mismatch";

  return (
    <div style={{ border: `1px solid ${tone.b}`, background: tone.bg, borderRadius: 14, padding: "16px 18px", transition: "border-color .2s, background .2s" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span style={{ fontWeight: 650, fontSize: 14.5 }}>{label}</span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="cap">SHA-256 stored on NEAR</span>
            <span className="hash" title={hash}>
              {shortHash(hash)}
            </span>
          </span>
        </div>
        {state.kind === "checking" ? (
          <button type="button" className="btn btn-secondary btn-sm btn-busy" disabled aria-busy="true">
            <span className="spin" />
            Checking…
          </button>
        ) : done ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={run}>
            Check again
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={run}>
            <span className="ico ico-shield" />
            {buttonLabel}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {state.kind === "checking" && (
          <div className="mt-3.5 flex flex-col gap-2">
            <div style={{ height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
              <div className="skel" style={{ height: "100%", width: "100%", borderRadius: 2, background: "linear-gradient(90deg, transparent, #3442D9, transparent)", backgroundSize: "220% 100%" }} />
            </div>
            <span className="cap">Downloading the record and computing its fingerprint in your browser…</span>
          </div>
        )}
        {state.kind === "match" && (
          <div className="mt-3.5 flex flex-col gap-2.5">
            <span className="verdict v-yes hc-verdict" style={{ fontSize: 15 }}>
              Matches. Nothing was edited after it was signed.
            </span>
            <dl className="kv" style={{ gridTemplateColumns: "96px minmax(0, 1fr)" }}>
              <dt>On NEAR</dt>
              <dd className="mono" style={{ overflowWrap: "anywhere", fontSize: 12 }}>{hash}</dd>
              <dt>Computed</dt>
              <dd className="mono" style={{ overflowWrap: "anywhere", fontSize: 12, color: "var(--st-delivered)" }}>{hash}</dd>
            </dl>
          </div>
        )}
        {state.kind === "mismatch" && (
          <div className="mt-3.5 flex flex-col gap-2.5">
            <span className="verdict v-no hc-verdict" style={{ fontSize: 15 }}>
              Does not match. This record differs from the one that was signed.
            </span>
            <dl className="kv" style={{ gridTemplateColumns: "96px minmax(0, 1fr)" }}>
              <dt>On NEAR</dt>
              <dd className="mono" style={{ overflowWrap: "anywhere", fontSize: 12 }}>{hash}</dd>
              <dt>Computed</dt>
              <dd className="mono" style={{ overflowWrap: "anywhere", fontSize: 12, color: "var(--st-rejected)" }}>{state.got}</dd>
            </dl>
            <span className="cap">Don&apos;t rely on this copy. Open the transaction to see what was signed.</span>
          </div>
        )}
        {state.kind === "error" && (
          <div className="notice n-warn mt-3.5">
            <span>
              <b>Couldn&apos;t download the record.</b> {state.message}{" "}
              <button type="button" className="btn btn-ghost btn-sm" onClick={run} style={{ marginLeft: 4 }}>
                Try again
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline variant for vote cards and delivery rows.
export function HashCheckCompact({ hash }: { hash: string }) {
  const { state, run } = useHashCheck(hash);
  return (
    <span className="inline-flex flex-wrap items-center gap-2" aria-live="polite">
      {state.kind === "idle" && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={run} style={{ padding: "0 8px", color: "var(--accent-ink)" }}>
          <span className="ico ico-shield" />
          Check hash
        </button>
      )}
      {state.kind === "checking" && (
        <span className="body-s inline-flex items-center gap-2" style={{ color: "var(--ink-2)", minHeight: 36 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid currentColor", borderRightColor: "transparent", animation: "ll-spin .8s linear infinite" }} />
          Checking…
        </span>
      )}
      {state.kind === "match" && (
        <span className="verdict v-yes" style={{ fontSize: 13.5, minHeight: 36 }} title={`Computed ${hash}`}>
          Matches
        </span>
      )}
      {state.kind === "mismatch" && (
        <span className="verdict v-no" style={{ fontSize: 13.5, minHeight: 36 }} title={`Computed ${state.got}, stored ${hash}`}>
          Does not match
        </span>
      )}
      {state.kind === "error" && (
        <span className="body-s inline-flex items-center gap-2" style={{ color: "var(--st-review)", fontWeight: 600, minHeight: 36 }} title={state.message}>
          Couldn&apos;t download
          <button type="button" className="btn btn-ghost btn-sm" onClick={run}>
            Try again
          </button>
        </span>
      )}
    </span>
  );
}
