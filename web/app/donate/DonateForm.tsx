"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { config } from "@/lib/config";
import { confirmDonation, confirmPlainCall, pendingStore } from "@/lib/donate/confirm";
import { describeError, describeReceiverError } from "@/lib/donate/messages";
import {
  type Blocker,
  buildDonateTransaction,
  buildFaucetTransaction,
  checkSetup,
  type DonateSetup,
  type DonorState,
  evaluateDonation,
  loadDonor,
  loadToken,
  type TokenInfo,
} from "@/lib/donate/plan";
import { txUrl } from "@/lib/explorer";
import { shortTx } from "@/lib/format";
import type { TransferResult } from "@/lib/near/outcome";
import { formatUnits, parseUnits } from "@/lib/near/units";
import { useWallet } from "@/lib/wallet/WalletProvider";

const setup: DonateSetup = {
  rpc: { url: config.rpcUrl },
  network: config.network,
  relief: config.contractId,
  token: config.poolTokenId,
  msg: config.donationMsg,
  gasTgas: config.donateGasTgas,
};

const FAUCET_AMOUNT = "100";
const QUICK = ["10", "25", "50"];

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Phase =
  | { name: "editing" }
  | { name: "checking" }
  | { name: "signing"; amount: bigint }
  | { name: "confirming"; hash: string; amount: bigint }
  | { name: "done"; hash: string; amount: bigint; result: TransferResult }
  | { name: "error"; message: string; hash?: string };

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed"; message: string };

const netLabel = config.chainMode === "stub" ? `${config.tokenSymbol} on NEAR · sample` : `${config.tokenSymbol} on NEAR ${config.network}`;

export function DonateForm() {
  return (
    <div className="card overflow-hidden" style={{ boxShadow: "var(--sh-2)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "20px 28px", borderBottom: "1px solid var(--line)" }}>
        <h2 className="h2">Donate</h2>
        <span className="tag">{netLabel}</span>
      </div>
      {config.chainMode === "stub" ? (
        <div className="card-p">
          <OffForm notice={<p className="notice n-plain">This site is showing sample data, so donations are off.</p>} />
        </div>
      ) : (
        <LiveDonateForm />
      )}
    </div>
  );
}

function OffForm({ notice }: { notice: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4.5">
      {notice}
      <div className="field" style={{ opacity: 0.7 }}>
        <label className="label" htmlFor="amt-off">
          Amount
        </label>
        <div className="input-wrap off">
          <input id="amt-off" className="input" placeholder="0.00" disabled />
          <span className="affix">{config.tokenSymbol}</span>
        </div>
      </div>
      <button type="button" className="btn btn-lg btn-block" disabled>
        Donate
      </button>
    </div>
  );
}

function LiveDonateForm() {
  const router = useRouter();
  const wallet = useWallet();
  const [amountText, setAmountText] = useState("");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "editing" });
  const [env, setEnv] = useState<Loaded<{ token: TokenInfo; setupBlockers: Blocker[] }>>({ state: "loading" });
  const [donor, setDonor] = useState<Loaded<DonorState> | null>(null);
  const [faucet, setFaucet] = useState<{ busy: boolean; ok?: string; err?: string }>({ busy: false });
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      let token: TokenInfo;
      try {
        token = await loadToken(setup);
      } catch (err) {
        if (live) setEnv({ state: "failed", message: `Couldn't read the pool token ${setup.token || "(not configured)"}. ${errorText(err)}` });
        return;
      }
      let setupBlockers: Blocker[];
      try {
        setupBlockers = await checkSetup(setup);
      } catch (err) {
        setupBlockers = [{ code: "setup", message: `Couldn't check the relief contract. ${errorText(err)}` }];
      }
      if (live) setEnv({ state: "ready", value: { token, setupBlockers } });
    })();
    return () => {
      live = false;
    };
  }, []);

  const refreshDonor = useCallback(async (accountId: string) => {
    try {
      const value = await loadDonor(setup, accountId);
      setDonor({ state: "ready", value });
      return value;
    } catch (err) {
      setDonor({ state: "failed", message: `Couldn't read your balances. ${errorText(err)}` });
      return null;
    }
  }, []);

  useEffect(() => {
    if (wallet.status !== "connected" || !wallet.accountId) return;
    let live = true;
    loadDonor(setup, wallet.accountId)
      .then((value) => live && setDonor({ state: "ready", value }))
      .catch((err) => live && setDonor({ state: "failed", message: `Couldn't read your balances. ${errorText(err)}` }));
    return () => {
      live = false;
    };
  }, [wallet.status, wallet.accountId]);

  const confirm = useCallback(
    async (hash: string, signer: string, amount: bigint) => {
      setPhase({ name: "confirming", hash, amount });
      try {
        const result = await confirmDonation(setup.rpc, hash, { token: setup.token, receiver: setup.relief, signer, amount });
        pendingStore.clear();
        setPhase({ name: "done", hash, amount, result });
        await refreshDonor(signer);
        router.refresh();
      } catch (err) {
        setPhase({ name: "error", message: `Couldn't confirm the result yet: ${describeError(err)}`, hash });
      }
    },
    [refreshDonor, router],
  );

  // A donation sent before a reload is picked up again and confirmed.
  useEffect(() => {
    if (wallet.status !== "connected" || !wallet.accountId) return;
    const pending = pendingStore.load();
    if (!pending || pending.signer !== wallet.accountId || pending.token !== setup.token || pending.receiver !== setup.relief) return;
    // Deferred and cancellable, so a double effect run in development doesn't start two confirmations.
    const timer = setTimeout(() => void confirm(pending.hash, pending.signer, BigInt(pending.amount)), 0);
    return () => clearTimeout(timer);
  }, [wallet.status, wallet.accountId, confirm]);

  const token = env.state === "ready" ? env.value.token : null;
  const evaluation = useMemo(() => {
    if (!token || donor?.state !== "ready") return null;
    return evaluateDonation({ setup, token, donor: donor.value, amountText });
  }, [token, donor, amountText]);

  const busy = phase.name === "checking" || phase.name === "signing" || phase.name === "confirming";
  const finished = phase.name === "done" || phase.name === "error";
  const setupBlockers = env.state === "ready" ? env.value.setupBlockers : [];

  async function donate(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!token || !wallet.accountId || setupBlockers.length > 0) return;
    setPhase({ name: "checking" });
    const fresh = await refreshDonor(wallet.accountId);
    if (!fresh) {
      setPhase({ name: "error", message: "Couldn't read your balances. Try again in a moment." });
      return;
    }
    const check = evaluateDonation({ setup, token, donor: fresh, amountText });
    if (check.blockers.length > 0 || check.amount === null) {
      setPhase({ name: "editing" });
      return;
    }
    const amount = check.amount;
    setPhase({ name: "signing", amount });
    let hash: string;
    try {
      hash = await wallet.signAndSend(buildDonateTransaction(setup, amount));
    } catch (err) {
      setPhase({ name: "error", message: describeError(err) });
      return;
    }
    pendingStore.save({ hash, signer: wallet.accountId, token: setup.token, receiver: setup.relief, amount: amount.toString(), at: Date.now() });
    await confirm(hash, wallet.accountId, amount);
  }

  async function getTestTokens() {
    if (!token || donor?.state !== "ready" || !wallet.accountId) return;
    setFaucet({ busy: true });
    try {
      const tx = await buildFaucetTransaction(setup, donor.value, parseUnits(FAUCET_AMOUNT, token.decimals));
      const hash = await wallet.signAndSend(tx);
      await confirmPlainCall(setup.rpc, hash, wallet.accountId);
      await refreshDonor(wallet.accountId);
      setFaucet({ busy: false, ok: `${FAUCET_AMOUNT} test ${token.symbol} sent to your account.` });
    } catch (err) {
      setFaucet({ busy: false, err: describeError(err) });
    }
  }

  const reset = () => {
    setPhase({ name: "editing" });
    setAmountText("");
    setTouched(false);
  };

  if (env.state === "loading") {
    return (
      <div className="card-p flex flex-col gap-4" aria-busy="true">
        <span className="skel block" style={{ height: 56 }} />
        <span className="skel block" style={{ height: 56 }} />
        <span className="cap">Reading the pool token and the relief contract…</span>
      </div>
    );
  }
  if (env.state === "failed") {
    return (
      <div className="card-p">
        <OffForm
          notice={
            <div className="notice n-block" role="alert">
              <span>
                <b>Donations are paused.</b> {env.message}
              </span>
            </div>
          }
        />
      </div>
    );
  }
  if (setupBlockers.length > 0) {
    return (
      <div className="card-p">
        <OffForm
          notice={
            <div className="notice n-block" role="alert">
              <span>
                <b>Donations are paused.</b> {setupBlockers.map((b) => b.message).join(" ")} Nothing you do here will send tokens.
              </span>
            </div>
          }
        />
      </div>
    );
  }

  const { symbol, decimals } = env.value.token;
  const showFaucet = config.faucetEnabled && wallet.status === "connected" && donor?.state === "ready";

  if (wallet.status !== "connected") {
    return (
      <div className="card-p flex flex-col items-start gap-4" style={{ paddingTop: 36, paddingBottom: 36 }}>
        <div className="flex items-center gap-3.5">
          <span className="avatar" style={{ width: 44, height: 44, background: "var(--sunken)", border: "2px dashed var(--line-2)" }} aria-hidden />
          <div>
            <p style={{ fontWeight: 650, fontSize: 17 }}>Connect a NEAR {config.network} wallet to donate</p>
            <p className="body-s muted">You&apos;ll approve the exact amount in your wallet. Nothing is sent until you do.</p>
          </div>
        </div>
        <button
          type="button"
          className={`btn btn-primary btn-lg${connecting || wallet.status === "loading" ? " btn-busy" : ""}`}
          disabled={connecting || wallet.status !== "disconnected"}
          onClick={async () => {
            setConnecting(true);
            try {
              await wallet.connect();
            } catch {
              // The wallet popup shows its own message; the button simply comes back.
            } finally {
              setConnecting(false);
            }
          }}
        >
          {(connecting || wallet.status === "loading") && <span className="spin" />}
          {connecting ? "Opening wallet…" : wallet.status === "loading" ? "Loading wallets…" : wallet.status === "unavailable" ? "Wallet unavailable" : "Connect wallet"}
        </button>
        <p className="cap">Any NEAR Connect wallet works.{config.faucetEnabled ? ` Free test ${symbol} is available once you connect.` : ""}</p>
      </div>
    );
  }

  const fieldBlockers = (touched || amountText ? evaluation?.blockers ?? [] : []).filter((b) => b.code !== "setup");
  // Problems with the account itself show even before an amount is typed.
  const accountBlockers = (evaluation?.blockers ?? []).filter((b) => b.code === "network_mismatch" || b.code === "no_account" || b.code === "low_near");
  const shown = fieldBlockers.length > 0 ? fieldBlockers : accountBlockers;
  const firstError = shown[0]?.message;
  const valid = evaluation && evaluation.blockers.length === 0 && evaluation.amount !== null;
  const locked = busy || finished;
  const maxBalance = donor?.state === "ready" ? formatUnits(donor.value.tokenBalance, decimals) : null;

  return (
    <>
      <form onSubmit={donate} className="card-p flex flex-col gap-5" noValidate>
        <DonorSummary donor={donor} symbol={symbol} decimals={decimals} />

        <div className="field">
          <label className="label" htmlFor="amount">
            Amount
          </label>
          <div className={`input-wrap${firstError ? " bad" : ""}${locked ? " off" : ""}`}>
            <input
              id="amount"
              name="amount"
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={locked}
              aria-invalid={!!firstError}
              aria-describedby="amount-msg"
            />
            <span className="affix">{symbol}</span>
          </div>
          <div className="chips" aria-label="Quick amounts">
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip-btn" disabled={locked} onClick={() => (setAmountText(q), setTouched(true))}>
                {q}
              </button>
            ))}
            {maxBalance && maxBalance !== "0" && (
              <button type="button" className="chip-btn" disabled={locked} onClick={() => (setAmountText(maxBalance), setTouched(true))}>
                Max {maxBalance}
              </button>
            )}
          </div>
          <div id="amount-msg" aria-live="polite">
            {firstError ? <p className="err">{firstError}</p> : <p className="help">Up to {decimals} decimal places. The network fee is paid in NEAR.</p>}
          </div>
        </div>

        <button type="submit" className={`btn btn-primary btn-lg btn-block${busy ? " btn-busy" : ""}`} disabled={busy || finished || !valid} aria-busy={busy}>
          {busy && <span className="spin" />}
          {phase.name === "checking"
            ? "Checking…"
            : phase.name === "signing"
              ? "Waiting for your wallet…"
              : phase.name === "confirming"
                ? "Confirming…"
                : valid && evaluation?.amount
                  ? `Donate ${formatUnits(evaluation.amount, decimals)} ${symbol}`
                  : "Donate"}
        </button>

        <PhasePanel phase={phase} symbol={symbol} decimals={decimals} onReset={reset} />
      </form>

      {showFaucet && (
        <div className="flex flex-wrap items-center justify-between gap-3.5" style={{ padding: "18px 28px", borderTop: "1px dashed var(--line-2)", background: "#FBFAF7" }}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>Need test tokens?</span>
            <span className="cap">Testnet only. These tokens have no value.</span>
            <span aria-live="polite">
              {faucet.ok && (
                <span className="body-s" style={{ color: "var(--st-delivered)", fontWeight: 550 }}>
                  {faucet.ok}
                </span>
              )}
              {faucet.err && <span className="err">{faucet.err}</span>}
            </span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={getTestTokens} disabled={faucet.busy || busy} aria-busy={faucet.busy}>
            {faucet.busy && <span className="spin" />}
            {faucet.busy ? "Sending…" : faucet.err ? "Try again" : `Get ${FAUCET_AMOUNT} test ${symbol}`}
          </button>
        </div>
      )}
    </>
  );
}

function DonorSummary({ donor, symbol, decimals }: { donor: Loaded<DonorState> | null; symbol: string; decimals: number }) {
  if (!donor || donor.state === "loading") {
    return (
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }} aria-busy="true">
        <span className="skel block" style={{ height: 56 }} />
        <span className="skel block" style={{ height: 56 }} />
      </div>
    );
  }
  if (donor.state === "failed") return <p className="err">{donor.message}</p>;
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}>
      <div className="panel flex items-baseline justify-between gap-2">
        <span className="body-s muted">Your {symbol}</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 18 }}>
          {formatUnits(donor.value.tokenBalance, decimals)}
        </span>
      </div>
      <div className="panel flex items-baseline justify-between gap-2">
        <span className="body-s muted">NEAR for fees</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 18 }}>
          {formatUnits(donor.value.nearAvailable, 24, 4)}
        </span>
      </div>
    </div>
  );
}

function TxRow({ hash, onReset, again = true }: { hash?: string; onReset: () => void; again?: boolean }) {
  const url = txUrl(hash);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-3.5">
      {url && hash && (
        <a className="rec" href={url} target="_blank" rel="noreferrer">
          Transaction{" "}
          <span className="mono" style={{ fontSize: 12 }}>
            {shortTx(hash)}
          </span>
        </a>
      )}
      {again && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
          Donate again
        </button>
      )}
    </span>
  );
}

function Panel({ tone, title, children }: { tone: "info" | "ok" | "warn" | "block" | "plain"; title: string; children: React.ReactNode }) {
  return (
    <div className={`notice n-${tone}`} role="status" aria-live="polite">
      <div className="flex min-w-0 flex-col gap-2">
        <b>{title}</b>
        {children}
      </div>
    </div>
  );
}

function PhasePanel({ phase, symbol, decimals, onReset }: { phase: Phase; symbol: string; decimals: number; onReset: () => void }) {
  const fmt = (v: bigint) => `${formatUnits(v, decimals)} ${symbol}`;

  if (phase.name === "signing") {
    return (
      <Panel tone="info" title="Check your wallet.">
        <span>Approve the donation of {fmt(phase.amount)} in your wallet.</span>
      </Panel>
    );
  }
  if (phase.name === "confirming") {
    return (
      <Panel tone="info" title="Sent. Waiting for the network.">
        <span>This usually takes a few seconds.</span>
        <TxRow hash={phase.hash} onReset={onReset} again={false} />
      </Panel>
    );
  }
  if (phase.name === "error") {
    const cancelled = phase.message.startsWith("You cancelled");
    return (
      <Panel tone={cancelled ? "plain" : "block"} title={cancelled ? "You cancelled in your wallet." : "Not donated."}>
        <span>{cancelled ? "Nothing was sent." : phase.message}</span>
        <TxRow hash={phase.hash} onReset={onReset} />
      </Panel>
    );
  }
  if (phase.name !== "done") return null;

  const r = phase.result;
  if (r.kind === "mismatch") {
    return (
      <Panel tone="block" title="This isn't the transaction we prepared.">
        <span>{r.detail}. We stopped as a safety check. Check your wallet&apos;s activity before trying again.</span>
        <TxRow hash={phase.hash} onReset={onReset} />
      </Panel>
    );
  }
  if (r.kind === "failed") {
    return (
      <Panel tone="block" title="The transfer failed.">
        <span>Your tokens didn&apos;t move. {describeError(r.reason)}</span>
        <TxRow hash={phase.hash} onReset={onReset} />
      </Panel>
    );
  }
  if (r.kind === "refunded") {
    return (
      <Panel tone="warn" title="Nothing was donated.">
        <span>The relief contract sent all {fmt(r.refunded)} back to you.</span>
        {r.receiverError && <span className="body-s muted">Reason: {describeReceiverError(r.receiverError)}</span>}
        <TxRow hash={phase.hash} onReset={onReset} />
      </Panel>
    );
  }
  if (r.kind === "partial") {
    return (
      <Panel tone="warn" title="Partly donated.">
        <span>
          The relief contract kept {fmt(r.used)} and refunded {fmt(r.refunded)} to you.
        </span>
        {r.receiverError && <span className="body-s muted">Reason: {describeReceiverError(r.receiverError)}</span>}
        <TxRow hash={phase.hash} onReset={onReset} />
      </Panel>
    );
  }
  return (
    <Panel tone="ok" title="Donation received.">
      <span>{fmt(r.used)} is now in the relief pool. Thank you.</span>
      <TxRow hash={phase.hash} onReset={onReset} />
    </Panel>
  );
}
