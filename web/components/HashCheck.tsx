"use client";

import { useState } from "react";
import { hashCanonical } from "@/lib/hash";

type State = { kind: "idle" } | { kind: "checking" } | { kind: "match" } | { kind: "mismatch"; got: string } | { kind: "error"; message: string };

// Downloads the off-chain record and hashes it in the browser, so nobody has to trust our server.
export function HashCheck({ hash, label = "Check hash" }: { hash: string; label?: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function check() {
    setState({ kind: "checking" });
    try {
      const res = await fetch(`/api/evidence/${hash}`);
      if (!res.ok) {
        setState({ kind: "error", message: res.status === 404 ? "Record not found in evidence storage." : `Storage answered ${res.status}.` });
        return;
      }
      const got = await hashCanonical(await res.json());
      setState(got === hash ? { kind: "match" } : { kind: "mismatch", got });
    } catch {
      setState({ kind: "error", message: "Couldn't reach evidence storage." });
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
      <button
        type="button"
        onClick={check}
        disabled={state.kind === "checking"}
        className="rounded border border-tarp px-2 py-0.5 font-medium text-tarp hover:bg-tarp hover:text-white disabled:opacity-60"
      >
        {state.kind === "checking" ? "Checking…" : label}
      </button>
      {state.kind === "match" && <span className="font-semibold text-verified">Matches the onchain hash</span>}
      {state.kind === "mismatch" && (
        <span className="font-semibold text-stamp">Does not match. Got {state.got.slice(0, 10)}…</span>
      )}
      {state.kind === "error" && <span className="text-stamp">{state.message}</span>}
    </span>
  );
}
