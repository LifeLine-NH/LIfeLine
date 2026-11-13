"use client";

import { txUrl } from "@/lib/explorer";
import { shortTx } from "@/lib/format";
import type { TxState } from "./useTx";

export function TxResult({ state, done }: { state: TxState; done: string }) {
  if (state.kind === "error" && state.input) return <p className="err">{state.message}</p>;
  if (state.kind !== "done" && state.kind !== "error" && state.kind !== "confirming") return null;
  const hash = "hash" in state ? state.hash : undefined;
  const url = txUrl(hash);
  const link = url && hash && (
    <a className="rec" href={url} target="_blank" rel="noreferrer">
      Transaction{" "}
      <span className="mono" style={{ fontSize: 12 }}>
        {shortTx(hash)}
      </span>
    </a>
  );
  if (state.kind === "confirming") {
    return (
      <div className="notice n-info" role="status">
        <span>
          <b>Sent. Waiting for the network.</b> {link}
        </span>
      </div>
    );
  }
  if (state.kind === "done") {
    return (
      <div className="notice n-ok" role="status">
        <span>
          <b>{done}</b> {link}
        </span>
      </div>
    );
  }
  return (
    <div className="notice n-block" role="alert">
      <span>
        <b>Not sent.</b> {state.message} {link}
      </span>
    </div>
  );
}
