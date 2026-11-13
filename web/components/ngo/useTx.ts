"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { config } from "@/lib/config";
import { confirmPlainCall } from "@/lib/donate/confirm";
import { describeError } from "@/lib/donate/messages";
import type { PlannedTransaction } from "@/lib/donate/plan";
import { FormError } from "@/lib/ngo/actions";
import { useWallet } from "@/lib/wallet/WalletProvider";

// Contract calls from this page only make sense against a real relief contract.
export function contractBlocker(): string | null {
  if (config.chainMode === "stub") return "Needs the live relief contract. This site is showing sample data.";
  if (!config.contractId) return "No relief contract is configured on this site.";
  return null;
}

export type TxState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "signing" }
  | { kind: "confirming"; hash: string }
  | { kind: "done"; hash: string }
  | { kind: "error"; message: string; hash?: string; input?: boolean };

// Prepare (validate, store records), sign in the wallet, then read the final outcome from the chain.
export function useTx() {
  const wallet = useWallet();
  const router = useRouter();
  const [state, setState] = useState<TxState>({ kind: "idle" });

  const run = useCallback(
    async (prepare: () => Promise<PlannedTransaction>, onDone?: () => void) => {
      if (!wallet.accountId) {
        setState({ kind: "error", message: "Connect a wallet first." });
        return;
      }
      setState({ kind: "preparing" });
      let tx: PlannedTransaction;
      try {
        tx = await prepare();
      } catch (err) {
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err), input: err instanceof FormError });
        return;
      }
      setState({ kind: "signing" });
      let hash: string;
      try {
        hash = await wallet.signAndSend(tx);
      } catch (err) {
        setState({ kind: "error", message: describeError(err) });
        return;
      }
      setState({ kind: "confirming", hash });
      try {
        await confirmPlainCall({ url: config.rpcUrl }, hash, wallet.accountId);
        setState({ kind: "done", hash });
        onDone?.();
        router.refresh();
      } catch (err) {
        setState({ kind: "error", message: `The relief contract refused it: ${err instanceof Error ? err.message.replace(/^Smart contract panicked:\s*/, "") : String(err)}`, hash });
      }
    },
    [wallet, router],
  );

  const reset = useCallback(() => setState({ kind: "idle" }), []);
  const busy = state.kind === "preparing" || state.kind === "signing" || state.kind === "confirming";
  return { state, run, reset, busy };
}

export function busyLabel(state: TxState): string | null {
  if (state.kind === "preparing") return "Preparing…";
  if (state.kind === "signing") return "Waiting for your wallet…";
  if (state.kind === "confirming") return "Confirming…";
  return null;
}
