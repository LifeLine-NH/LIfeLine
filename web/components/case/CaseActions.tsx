"use client";

import { useState } from "react";
import { hashCanonical } from "@/lib/hash";

export interface HashTarget {
  label: string;
  hash: string;
}

type BatchState =
  | { kind: "idle" }
  | { kind: "checking"; done: number; total: number }
  | { kind: "ok"; total: number }
  | { kind: "issues"; verified: number; total: number; problems: string[] };

export function CaseActions({ hashes }: { hashes: HashTarget[] }) {
  const [copied, setCopied] = useState(false);
  const [batch, setBatch] = useState<BatchState>({ kind: "idle" });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: ignore if clipboard is blocked
    }
  };

  const checkAll = async () => {
    if (hashes.length === 0) return;
    setBatch({ kind: "checking", done: 0, total: hashes.length });
    const problems: string[] = [];
    let verified = 0;

    for (let i = 0; i < hashes.length; i++) {
      const target = hashes[i];
      try {
        const res = await fetch(`/api/evidence/${target.hash}`, { cache: "no-store" });
        if (!res.ok) {
          problems.push(`${target.label} (${res.status === 404 ? "not in storage" : `HTTP ${res.status}`})`);
        } else {
          const got = await hashCanonical(await res.json());
          if (got === target.hash) {
            verified++;
          } else {
            problems.push(`${target.label} (hash mismatch)`);
          }
        }
      } catch {
        problems.push(`${target.label} (network error)`);
      }
      setBatch({ kind: "checking", done: i + 1, total: hashes.length });
    }

    if (problems.length === 0) {
      setBatch({ kind: "ok", total: hashes.length });
    } else {
      setBatch({ kind: "issues", verified, total: hashes.length, problems });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>
          {copied ? "Copied link" : "Copy link"}
        </button>
        {hashes.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={checkAll}
            disabled={batch.kind === "checking"}
            aria-busy={batch.kind === "checking"}
          >
            <span className="ico ico-shield" />
            {batch.kind === "checking"
              ? `Checking ${batch.done}/${batch.total}…`
              : batch.kind === "ok"
                ? `All ${batch.total} hashes verified`
                : `Check all hashes (${hashes.length})`}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {batch.kind === "ok" && (
          <p className="cap" style={{ color: "var(--st-delivered)", fontWeight: 600 }}>
            All {batch.total} evidence and vote hashes recomputed in your browser and matched NEAR.
          </p>
        )}
        {batch.kind === "issues" && (
          <p className="cap" style={{ color: "var(--st-rejected)", fontWeight: 600 }}>
            {batch.verified} of {batch.total} matched. Could not verify: {batch.problems.join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}
