"use client";

import { useState } from "react";
import type { PayoutQuote as Quote } from "@/lib/intents/quote";

export interface PaymentOption {
  key: string;
  label: string;
  short: string;
  amount: string;
  display: string;
}

const DESTS = [
  { key: "base-usdc", label: "USDC on Base", kind: "evm" },
  { key: "arb-usdc", label: "USDC on Arbitrum", kind: "evm" },
  { key: "eth-usdc", label: "USDC on Ethereum", kind: "evm" },
  { key: "sol-usdc", label: "USDC on Solana", kind: "solana" },
] as const;

const fmt = (units: string, decimals: number, dp = 2) => {
  const v = BigInt(units || "0");
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = v / scale;
  const frac = ((v % scale) * BigInt(10) ** BigInt(dp)) / scale;
  return `${whole.toLocaleString("en-US")}.${frac.toString().padStart(dp, "0")}`;
};

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")} UTC`;
};

type State = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; quote: Quote } | { kind: "error"; message: string };

// A live dry quote from NEAR Intents 1Click for one payment of this case.
export function PayoutQuote({ payments, winner }: { payments: PaymentOption[]; winner: string }) {
  const [pay, setPay] = useState(payments[0]?.key ?? "");
  const [dest, setDest] = useState<(typeof DESTS)[number]["key"]>("base-usdc");
  const [recipient, setRecipient] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const payment = payments.find((p) => p.key === pay) ?? payments[0];
  const d = DESTS.find((x) => x.key === dest)!;
  const busy = state.kind === "loading";

  async function getQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!payment) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/payout/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: payment.amount, destination: dest, recipient }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.quote) {
        setState({ kind: "error", message: body?.error ?? `The quote route answered ${res.status}.` });
        return;
      }
      setState({ kind: "ok", quote: body.quote });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the quote route. Check your connection and try again." });
    }
  }

  const q = state.kind === "ok" ? state.quote : null;

  return (
    <form onSubmit={getQuote} className="flex min-w-0 flex-col gap-3.5" style={{ flex: "1.4 1 460px" }} noValidate>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}>
        {payments.length > 1 ? (
          <div className="field">
            <label className="label" htmlFor="pq-pay">
              Payment
            </label>
            <div className="input-wrap input-s">
              <select id="pq-pay" className="input" title={payment?.label} value={pay} onChange={(e) => (setPay(e.target.value), setState({ kind: "idle" }))} disabled={busy}>
                {payments.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.short}: {p.display}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="panel" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
            <span className="cap">{payment?.label}</span>
            <p className="num" style={{ fontWeight: 700, fontSize: 18 }}>
              {payment?.display}
            </p>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="pq-dest">
            Receive as
          </label>
          <div className="input-wrap input-s">
            <select id="pq-dest" className="input" value={dest} onChange={(e) => (setDest(e.target.value as typeof dest), setState({ kind: "idle" }))} disabled={busy}>
              {DESTS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="pq-to">
          {winner}&apos;s {d.kind === "evm" ? "EVM" : "Solana"} address
        </label>
        <div className={`input-wrap input-s${state.kind === "error" ? " bad" : ""}`}>
          <input
            id="pq-to"
            className="input mono"
            style={{ fontSize: 14 }}
            placeholder={d.kind === "evm" ? "0x…" : "Solana address"}
            autoComplete="off"
            spellCheck={false}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={busy}
            aria-describedby="pq-msg"
          />
        </div>
        <p className="help">The responder hasn&apos;t saved a payout address yet, so enter one to price the route. It isn&apos;t stored.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={`btn btn-secondary btn-sm${busy ? " btn-busy" : ""}`} disabled={busy || !recipient.trim()} aria-busy={busy}>
          {busy && <span className="spin" />}
          {busy ? "Asking NEAR Intents…" : q ? "Refresh quote" : "Get a live quote"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled title="Payout execution needs the live contract and a signed withdrawal.">
          Request payout
        </button>
      </div>

      <div id="pq-msg" aria-live="polite">
        {state.kind === "error" && <p className="err">{state.message}</p>}
        {q && (
          <div className="panel flex flex-col gap-2" style={{ background: "var(--surface)", border: "1px solid #A9D9C4" }}>
            <span className="cap">
              {q.recipient.slice(0, 6)}…{q.recipient.slice(-4)} would receive
            </span>
            <p className="num" style={{ fontWeight: 700, fontSize: 22 }}>
              {fmt(q.amountOut, q.destination.decimals)} {q.destination.label}
            </p>
            <dl className="kv" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
              <dt>Sends</dt>
              <dd className="num">{fmt(q.amountIn, 6)} USDC on NEAR</dd>
              <dt>At least</dt>
              <dd className="num">
                {fmt(q.minAmountOut, q.destination.decimals)} after 1% slippage
              </dd>
              <dt>Fees included</dt>
              <dd className="num">
                withdrawal {fmt(q.withdrawFee, q.destination.decimals, 4)}
                {q.appFeeBps > 0 ? ` · service ${(q.appFeeBps / 100).toFixed(2)}%` : ""}
              </dd>
              <dt>Arrives in about</dt>
              <dd className="num">{q.timeEstimateSec} s after the deposit</dd>
              <dt>Quoted</dt>
              <dd className="num">{hhmm(q.quotedAt)}</dd>
            </dl>
            <span className="cap" title={q.correlationId ? `1Click correlation id ${q.correlationId}` : undefined}>
              Dry run from NEAR Intents 1Click on mainnet. No deposit address was created and nothing moved.
            </span>
          </div>
        )}
      </div>
    </form>
  );
}
