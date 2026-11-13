"use client";

import { useState } from "react";
import { DESTINATIONS } from "@/lib/intents/quote";
import { config } from "@/lib/config";
import { formatAmount, shortAccount } from "@/lib/format";
import { buildProfile, buildProof, buildProofRecord, buildRegister, proofWarning } from "@/lib/ngo/actions";
import { storeRecord } from "@/lib/ngo/store";
import { formatUnits } from "@/lib/near/units";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useNgo } from "./NgoProvider";
import { TxResult } from "./TxResult";
import { busyLabel, useTx } from "./useTx";

export interface AwardRow {
  id: string;
  status: string;
  winner: string;
  award: string;
  first: string;
  second: string;
  plannedHint?: number;
}

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help && <p className="help">{help}</p>}
    </div>
  );
}

function Register() {
  const { refresh } = useNgo();
  const { state, run, busy } = useTx();
  const [f, setF] = useState({ name: "", website: "", regions: "", payoutAsset: DESTINATIONS[0].key, payoutAddress: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="card card-p flex flex-col gap-4.5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const profile = buildProfile(f);
          const { hash } = await storeRecord({ kind: "ngo_profile", ...profile });
          return buildRegister(config.contractId, hash, config.ngoBondNear);
        }, refresh);
      }}
      noValidate
    >
      <div>
        <span className="eyebrow">Step 1</span>
        <h2 className="h2" style={{ marginTop: 4 }}>
          Register as a responder
        </h2>
      </div>
      <Field id="ngo-name" label="Organisation name">
        <div className="input-wrap input-s">
          <input id="ngo-name" className="input" value={f.name} onChange={set("name")} disabled={busy} autoComplete="organization" />
        </div>
      </Field>
      <Field id="ngo-web" label="Website">
        <div className="input-wrap input-s">
          <input id="ngo-web" className="input" placeholder="https://" value={f.website} onChange={set("website")} disabled={busy} />
        </div>
      </Field>
      <Field id="ngo-reg" label="Where you can respond" help="Geohash prefixes, separated by commas. You'll see cases in these areas.">
        <div className="input-wrap input-s">
          <input id="ngo-reg" className="input mono" placeholder="s4p, kr8" value={f.regions} onChange={set("regions")} disabled={busy} />
        </div>
      </Field>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        <Field id="ngo-pa" label="Payout as (optional)">
          <div className="input-wrap input-s">
            <select id="ngo-pa" className="input" value={f.payoutAsset} onChange={set("payoutAsset")} disabled={busy}>
              {DESTINATIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field id="ngo-pad" label="Payout address (optional)">
          <div className="input-wrap input-s">
            <input id="ngo-pad" className="input mono" style={{ fontSize: 14 }} placeholder="0x…" value={f.payoutAddress} onChange={set("payoutAddress")} disabled={busy} />
          </div>
        </Field>
      </div>
      <div className="panel flex justify-between gap-2">
        <span className="body-s muted">Bond, locked while you&apos;re registered</span>
        <span className="num" style={{ fontWeight: 700 }}>
          {config.ngoBondNear} NEAR
        </span>
      </div>
      <button type="submit" className={`btn btn-primary btn-lg btn-block${busy ? " btn-busy" : ""}`} disabled={busy} aria-busy={busy}>
        {busy && <span className="spin" />}
        {busyLabel(state) ?? `Lock ${config.ngoBondNear} NEAR and register`}
      </button>
      <p className="cap">Your profile is stored as a record and only its SHA-256 goes on chain with the registration.</p>
      <div aria-live="polite">
        <TxResult state={state} done="Registered. You can bid on open cases now." />
      </div>
    </form>
  );
}

function ProofForm({ row, account }: { row: AwardRow; account: string }) {
  const { state, run, busy } = useTx();
  const [f, setF] = useState({ summary: "", households: "", planned: row.plannedHint ? String(row.plannedHint) : "", location: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const warn = /^\d+$/.test(f.households) && /^\d+$/.test(f.planned) ? proofWarning(Number(f.households), Number(f.planned)) : null;

  return (
    <form
      className="flex flex-col gap-3.5"
      style={{ paddingTop: 14, borderTop: "1px dashed var(--line-2)" }}
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const record = buildProofRecord({ caseId: row.id, ngo: account, summary: f.summary, householdsText: f.households, plannedText: f.planned, location: f.location });
          const { hash, uri } = await storeRecord({ kind: "delivery_proof", ...record });
          return buildProof(config.contractId, row.id, hash, uri);
        });
      }}
      noValidate
    >
      <span className="eyebrow">Submit proof of delivery</span>
      <Field id={`pf-s-${row.id}`} label="Summary">
        <textarea id={`pf-s-${row.id}`} className="textarea" value={f.summary} onChange={set("summary")} disabled={busy} placeholder="What was delivered, where, and to whom" />
      </Field>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
        <Field id={`pf-h-${row.id}`} label="Households reached">
          <div className={`input-wrap input-s${warn ? " bad" : ""}`}>
            <input id={`pf-h-${row.id}`} className="input" inputMode="numeric" value={f.households} onChange={set("households")} disabled={busy} />
          </div>
        </Field>
        <Field id={`pf-p-${row.id}`} label="Households in your plan">
          <div className="input-wrap input-s">
            <input id={`pf-p-${row.id}`} className="input" inputMode="numeric" value={f.planned} onChange={set("planned")} disabled={busy} />
          </div>
        </Field>
        <Field id={`pf-l-${row.id}`} label="Location (geohash)">
          <div className="input-wrap input-s">
            <input id={`pf-l-${row.id}`} className="input mono" value={f.location} onChange={set("location")} disabled={busy} placeholder="s4p7k" />
          </div>
        </Field>
      </div>
      {warn && <p className="err">{warn}</p>}
      <p className="cap">Photo upload is coming next. The proof record is stored off chain and its SHA-256 goes on chain with your submission.</p>
      <button type="submit" className={`btn btn-primary btn-block${busy ? " btn-busy" : ""}`} disabled={busy} aria-busy={busy}>
        {busy && <span className="spin" />}
        {busyLabel(state) ?? "Submit proof"}
      </button>
      <div aria-live="polite">
        <TxResult state={state} done="Proof submitted. The verifiers check it next." />
      </div>
    </form>
  );
}

// Connected NGO: profile, awards and proof forms; otherwise the right next step.
export function NgoAccount({ awards }: { awards: AwardRow[] }) {
  const { state, account } = useNgo();
  const wallet = useWallet();

  if (state.kind === "off") {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4" style={{ padding: "24px 28px", borderStyle: "dashed", boxShadow: "none" }}>
        <div className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="tag-soon">Coming next</span>
            <span style={{ fontWeight: 650 }}>Register, bid and submit proof from this page</span>
          </span>
          <span className="body-s muted">Built and ready. {state.reason}</span>
        </div>
      </div>
    );
  }
  if (state.kind === "no-wallet" || state.kind === "loading") {
    return (
      <div className="card card-p flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span style={{ fontWeight: 650, fontSize: 17 }}>Responding for an NGO?</span>
          <span className="body-s muted">Connect your organisation&apos;s NEAR {config.network} wallet to register, bid and submit proof.</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={state.kind === "loading" || wallet.status !== "disconnected"} onClick={() => wallet.connect().catch(() => undefined)}>
          {state.kind === "loading" ? "Loading…" : "Connect wallet"}
        </button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="notice n-block" role="alert">
        <span>
          <b>Couldn&apos;t read your responder profile from the relief contract.</b> {state.message}
        </span>
      </div>
    );
  }
  if (state.kind === "unregistered") return <Register />;

  const ngo = state.ngo;
  const mine = awards.filter((a) => a.winner === account);
  return (
    <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
      <section className="card card-p flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <span className="avatar" style={{ width: 52, height: 52 }} aria-hidden />
          <div className="min-w-0">
            <h2 className="h3">Your responder profile</h2>
            <span className="acct" style={{ color: "var(--ink-3)", fontSize: 12.5 }} title={account ?? ""}>
              {account ? shortAccount(account, 40) : ""}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Reputation", String(ngo.reputation)],
            ["Delivered", String(ngo.delivered)],
            ["Failed", String(ngo.failed)],
          ].map(([k, v]) => (
            <div key={k} className="panel" style={{ padding: 12 }}>
              <span className="cap">{k}</span>
              <p className="num" style={{ fontWeight: 700, fontSize: 22 }}>
                {v}
              </p>
            </div>
          ))}
        </div>
        <div className="body-s flex justify-between">
          <span className="muted">Bond locked</span>
          <span className="num" style={{ fontWeight: 650 }}>
            {formatUnits(ngo.bond, 24, 4)} NEAR
          </span>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="h3">Your awards</h2>
        </div>
        {mine.length === 0 ? (
          <p className="body-s muted" style={{ padding: "18px 22px" }}>
            No awards yet. Bid on an open case below.
          </p>
        ) : (
          <div className="rows">
            {mine.map((a) => (
              <div key={a.id} className="row-item flex flex-col gap-2.5" style={{ display: "flex" }}>
                <div className="flex items-center justify-between gap-2.5">
                  <span className="mono truncate" style={{ fontWeight: 600 }}>
                    {a.id}
                  </span>
                  <span className="tag">{a.status}</span>
                </div>
                <span className="cap">
                  Award {formatAmount(a.award)} · received {formatAmount(a.first)}
                  {BigInt(a.second || "0") > BigInt(0) ? ` + ${formatAmount(a.second)}` : ""}
                </span>
                {a.status === "Awarded" && account && <ProofForm row={a} account={account} />}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
