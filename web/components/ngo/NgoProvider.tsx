"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { config } from "@/lib/config";
import { viewFunction } from "@/lib/near/rpc";
import type { Ngo } from "@/lib/types";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { contractBlocker } from "./useTx";

type NgoState = { kind: "off"; reason: string } | { kind: "no-wallet" } | { kind: "loading" } | { kind: "unregistered" } | { kind: "registered"; ngo: Ngo } | { kind: "error"; message: string };

const Ctx = createContext<{ state: NgoState; account: string | null; refresh: () => void } | null>(null);

// Reads get_ngo for the connected account straight from NEAR RPC, so registration shows up without a reload.
export function NgoProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const blocker = contractBlocker();
  const [state, setState] = useState<NgoState>(blocker ? { kind: "off", reason: blocker } : { kind: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (blocker) return;
    if (wallet.status !== "connected" || !wallet.accountId) {
      const t = setTimeout(() => setState(wallet.status === "loading" ? { kind: "loading" } : { kind: "no-wallet" }), 0);
      return () => clearTimeout(t);
    }
    let live = true;
    viewFunction<Ngo | null>({ url: config.rpcUrl }, config.contractId, "get_ngo", { account_id: wallet.accountId })
      .then((ngo) => live && setState(ngo ? { kind: "registered", ngo } : { kind: "unregistered" }))
      .catch((err) => live && setState({ kind: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [blocker, wallet.status, wallet.accountId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return <Ctx.Provider value={{ state, account: wallet.accountId, refresh }}>{children}</Ctx.Provider>;
}

export function useNgo() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNgo must be used inside NgoProvider");
  return v;
}
