"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TxLink } from "@/components/Links";
import { NotConnected } from "@/components/NotConnected";
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

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Phase =
  | { name: "editing" }
  | { name: "checking" }
  | { name: "signing"; amount: bigint }
  | { name: "confirming"; hash: string; amount: bigint }
  | { name: "done"; hash: string; amount: bigint; result: TransferResult }
  | { name: "error"; message: string; hash?: string };

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed"; message: string };

export function DonateForm() {
  if (config.chainMode === "stub") {
    return (
      <NotConnected>
        This site is showing sample data, so donations are off. Once it points at the relief contract on testnet, you
        can connect a NEAR wallet and donate here.
      </NotConnected>
    );
  }
  return <LiveDonateForm />;
}

function LiveDonateForm() {
  const router = useRouter();
  const wallet = useWallet();
  const [amountText, setAmountText] = useState("");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "editing" });
  const [env, setEnv] = useState<Loaded<{ token: TokenInfo; setupBlockers: Blocker[] }>>({ state: "loading" });
  const [donor, setDonor] = useState<Loaded<DonorState> | null>(null);
  const [faucet, setFaucet] = useState<{ busy: boolean; message?: string }>({ busy: false });

  useEffect(() => {
    let live = true;
    (async () => {
      let token: TokenInfo;
      try {
        token = await loadToken(setup);
      } catch (err) {
        if (live) setEnv({ state: "failed", message: `Couldn't read the pool token ${setup.token}. ${errorText(err)}` });
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
      setFaucet({ busy: false, message: `Added ${FAUCET_AMOUNT} test ${token.symbol} to your account.` });
    } catch (err) {
      setFaucet({ busy: false, message: describeError(err) });
    }
  }

  if (env.state === "loading") return <p className="text-muted">Reading the pool token…</p>;
  if (env.state === "failed") return <p role="alert" className="text-stamp">{env.message}</p>;
  const { symbol, decimals } = env.value.token;

  const blockers = [...setupBlockers, ...(touched || amountText ? evaluation?.blockers ?? [] : [])];

  return (
    <div className="max-w-md space-y-5">
      {setupBlockers.length > 0 && (
        <ul className="space-y-2" role="alert">
          {setupBlockers.map((b) => (
            <li key={b.message} className="rounded border border-stamp/40 bg-stamp/10 px-3 py-2 text-sm">
              {b.message}
            </li>
          ))}
        </ul>
      )}

      {wallet.status !== "connected" ? (
        <div className="space-y-3">
          <p>Connect a NEAR {config.network} wallet to donate.</p>
          <button
            type="button"
            onClick={() => wallet.connect().catch(() => undefined)}
            disabled={wallet.status !== "disconnected"}
            className="rounded bg-tarp px-5 py-2.5 font-semibold text-white hover:bg-tarp-deep disabled:opacity-50"
          >
            {wallet.status === "loading" ? "Loading wallets…" : "Connect wallet"}
          </button>
        </div>
      ) : (
        <form onSubmit={donate} className="space-y-4" noValidate>
          <DonorSummary donor={donor} symbol={symbol} decimals={decimals} />

          <div>
            <label htmlFor="amount" className="block font-semibold">
              Amount in {symbol}
            </label>
            <input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="50"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={busy}
              aria-invalid={blockers.length > 0}
              aria-describedby="amount-help"
              className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-lg"
            />
          </div>

          <div id="amount-help" aria-live="polite">
            {blockers.filter((b) => b.code !== "setup").map((b) => (
              <p key={b.code} className="text-sm text-stamp">
                {b.message}
              </p>
            ))}
          </div>

          <button
            type="submit"
            disabled={busy || setupBlockers.length > 0 || donor?.state !== "ready"}
            className="rounded bg-tarp px-5 py-2.5 font-semibold text-white hover:bg-tarp-deep disabled:opacity-50"
          >
            {phase.name === "checking"
              ? "Checking…"
              : phase.name === "signing"
                ? "Waiting for your wallet…"
                : phase.name === "confirming"
                  ? "Confirming…"
                  : evaluation?.amount
                    ? `Donate ${formatUnits(evaluation.amount, decimals)} ${symbol}`
                    : "Donate"}
          </button>

          {config.faucetEnabled && (
            <div className="border-t border-line pt-4 text-sm">
              <button
                type="button"
                onClick={getTestTokens}
                disabled={faucet.busy || busy || donor?.state !== "ready"}
                className="rounded border border-tarp px-3 py-1.5 font-semibold text-tarp hover:bg-tarp hover:text-white disabled:opacity-50"
              >
                {faucet.busy ? "Minting…" : `Get ${FAUCET_AMOUNT} test ${symbol}`}
              </button>
              <p className="mt-1 text-muted">Testnet only. These tokens have no value.</p>
              {faucet.message && <p className="mt-1">{faucet.message}</p>}
            </div>
          )}
        </form>
      )}

      <PhasePanel phase={phase} symbol={symbol} decimals={decimals} onReset={() => setPhase({ name: "editing" })} />
    </div>
  );
}

function DonorSummary({ donor, symbol, decimals }: { donor: Loaded<DonorState> | null; symbol: string; decimals: number }) {
  if (!donor || donor.state === "loading") return <p className="text-sm text-muted">Reading your balances…</p>;
  if (donor.state === "failed") return <p className="text-sm text-stamp">{donor.message}</p>;
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
      <div>
        <dt className="text-muted">Your {symbol}</dt>
        <dd className="font-semibold">{formatUnits(donor.value.tokenBalance, decimals)}</dd>
      </div>
      <div>
        <dt className="text-muted">NEAR for fees</dt>
        <dd className="font-semibold">{formatUnits(donor.value.nearAvailable, 24, 4)}</dd>
      </div>
    </dl>
  );
}

function PhasePanel({ phase, symbol, decimals, onReset }: { phase: Phase; symbol: string; decimals: number; onReset: () => void }) {
  const fmt = (v: bigint) => `${formatUnits(v, decimals)} ${symbol}`;

  if (phase.name === "signing") {
    return <Panel tone="info" title="Check your wallet">Approve the donation of {fmt(phase.amount)} in your wallet.</Panel>;
  }
  if (phase.name === "confirming") {
    return (
      <Panel tone="info" title="Sent. Waiting for the network">
        <p>This usually takes a few seconds.</p>
        <TxLink hash={phase.hash} />
      </Panel>
    );
  }
  if (phase.name === "error") {
    return (
      <Panel tone="bad" title="Not donated">
        <p>{phase.message}</p>
        {phase.hash && <TxLink hash={phase.hash} />}
        <ResetButton onReset={onReset} />
      </Panel>
    );
  }
  if (phase.name !== "done") return null;

  const r = phase.result;
  if (r.kind === "mismatch") {
    return (
      <Panel tone="bad" title="This isn't the transaction we prepared">
        <p>{r.detail}. Check your wallet history before trying again.</p>
        <TxLink hash={phase.hash} />
      </Panel>
    );
  }
  if (r.kind === "failed") {
    return (
      <Panel tone="bad" title="The transfer failed">
        <p>{describeError(r.reason)} Your tokens didn&apos;t move.</p>
        <TxLink hash={phase.hash} />
        <ResetButton onReset={onReset} />
      </Panel>
    );
  }
  if (r.kind === "refunded") {
    return (
      <Panel tone="bad" title="Nothing was donated">
        <p>The relief contract sent all {fmt(r.refunded)} back to you.</p>
        {r.receiverError && <p>{describeReceiverError(r.receiverError)}</p>}
        <TxLink hash={phase.hash} />
        <ResetButton onReset={onReset} />
      </Panel>
    );
  }
  if (r.kind === "partial") {
    return (
      <Panel tone="info" title="Part of it was donated">
        <p>
          The relief contract kept {fmt(r.used)} and refunded {fmt(r.refunded)} to you.
        </p>
        {r.receiverError && <p>{describeReceiverError(r.receiverError)}</p>}
        <TxLink hash={phase.hash} />
      </Panel>
    );
  }
  return (
    <Panel tone="good" title="Donation received">
      <p>{fmt(r.used)} is now in the relief pool. Thank you.</p>
      <TxLink hash={phase.hash} />
      <ResetButton onReset={onReset} label="Donate again" />
    </Panel>
  );
}

function Panel({ tone, title, children }: { tone: "good" | "bad" | "info"; title: string; children: React.ReactNode }) {
  const border = tone === "good" ? "border-verified" : tone === "bad" ? "border-stamp" : "border-tarp";
  return (
    <section role="status" aria-live="polite" className={`space-y-2 rounded-md border-l-4 ${border} bg-paper p-4 text-sm`}>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      {children}
    </section>
  );
}

function ResetButton({ onReset, label = "Try again" }: { onReset: () => void; label?: string }) {
  return (
    <button type="button" onClick={onReset} className="font-semibold text-tarp underline underline-offset-4">
      {label}
    </button>
  );
}
