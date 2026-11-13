"use client";

import { useState } from "react";
import { config } from "@/lib/config";
import { useEnded } from "@/components/ui/Countdown";
import { buildBid, checkBid } from "@/lib/ngo/actions";
import { storeRecord } from "@/lib/ngo/store";
import { formatUnits, parseUnits } from "@/lib/near/units";
import { useNgo } from "./NgoProvider";
import { TxResult } from "./TxResult";
import { busyLabel, useTx } from "./useTx";

// "Place a bid" on an open case card. Opens an inline form for a registered responder.
export function BidForm({ caseId, cap, firstBps, endsAtMs }: { caseId: string; cap: string; firstBps: number; endsAtMs: number }) {
  const { state: ngo } = useNgo();
  const ended = useEnded(endsAtMs);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ask: "", eta: "", plan: "" });
  const { state, run, busy } = useTx();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const decimals = config.tokenDecimals;
  const symbol = config.tokenSymbol;

  const note =
    ngo.kind === "off" ? ngo.reason : ended ? "Bidding has closed." : ngo.kind === "registered" ? null : ngo.kind === "unregistered" ? "Register as a responder first." : "Connect a registered NGO wallet.";

  let split: string | null = null;
  try {
    const ask = parseUnits(f.ask, decimals);
    const first = (ask * BigInt(firstBps)) / BigInt(10000);
    split = `You'd receive ${formatUnits(first, decimals, 2)} ${symbol} when awarded and ${formatUnits(ask - first, decimals, 2)} ${symbol} after the delivery check.`;
  } catch {
    split = null;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="cap">{note ?? (open ? "Your bid is a transaction from your NGO account." : "You're registered and can bid.")}</span>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!note} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Close" : "Place a bid"}
        </button>
      </div>
      {open && !note && (
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const { ask, eta } = checkBid({ caseId, askText: f.ask, etaText: f.eta, plan: f.plan, cap, decimals, symbol });
              const { hash } = await storeRecord({ kind: "bid_plan", case_id: caseId, plan: f.plan.trim(), eta_hours: eta });
              return buildBid(config.contractId, caseId, ask, eta, hash);
            });
          }}
          noValidate
        >
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}>
            <div className="field">
              <label className="label" htmlFor={`bid-a-${caseId}`}>
                Your ask
              </label>
              <div className="input-wrap input-s">
                <input id={`bid-a-${caseId}`} className="input" inputMode="decimal" value={f.ask} onChange={set("ask")} disabled={busy} placeholder="0.00" />
                <span className="affix">{symbol}</span>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor={`bid-e-${caseId}`}>
                Delivery time
              </label>
              <div className="input-wrap input-s">
                <input id={`bid-e-${caseId}`} className="input" inputMode="numeric" value={f.eta} onChange={set("eta")} disabled={busy} placeholder="12" />
                <span className="affix">hours</span>
              </div>
            </div>
          </div>
          {split && <p className="help">{split}</p>}
          <div className="field">
            <label className="label" htmlFor={`bid-p-${caseId}`}>
              Plan
            </label>
            <textarea id={`bid-p-${caseId}`} className="textarea" style={{ minHeight: 84 }} value={f.plan} onChange={set("plan")} disabled={busy} placeholder="How you'll reach people, what you'll deliver, how many households" />
            <p className="help">Verifiers compare your proof against this plan. Only its hash goes on chain.</p>
          </div>
          <button type="submit" className={`btn btn-primary btn-block${busy ? " btn-busy" : ""}`} disabled={busy} aria-busy={busy}>
            {busy && <span className="spin" />}
            {busyLabel(state) ?? "Place bid"}
          </button>
          <div aria-live="polite">
            <TxResult state={state} done="Bid placed." />
          </div>
        </form>
      )}
    </div>
  );
}
