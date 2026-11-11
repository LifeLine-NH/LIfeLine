"use client";

import type { NearConnector } from "@hot-labs/near-connect";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import type { PlannedTransaction } from "../donate/plan";

type Status = "loading" | "disconnected" | "connected" | "unavailable";

interface WalletContextValue {
  status: Status;
  accountId: string | null;
  walletName: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  // Signs and sends one transaction; resolves with its hash. The result is read from the chain, not the wallet.
  signAndSend(tx: PlannedTransaction): Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let connector: NearConnector | null = null;

    (async () => {
      try {
        // NEAR Connect touches window, localStorage and IndexedDB, so it only loads in the browser.
        const { NearConnector } = await import("@hot-labs/near-connect");
        connector = new NearConnector({ network: config.network });
        connectorRef.current = connector;

        connector.on("wallet:signIn", (e) => {
          setAccountId(e.accounts[0]?.accountId ?? null);
          setWalletName(e.wallet.manifest?.name ?? null);
          setStatus(e.accounts[0] ? "connected" : "disconnected");
        });
        connector.on("wallet:signOut", () => {
          setAccountId(null);
          setWalletName(null);
          setStatus("disconnected");
        });

        await connector.whenManifestLoaded;
        try {
          const { wallet, accounts } = await connector.getConnectedWallet();
          if (cancelled) return;
          if (accounts[0]) {
            setAccountId(accounts[0].accountId);
            setWalletName(wallet.manifest?.name ?? null);
            setStatus("connected");
            return;
          }
        } catch {
          // No wallet connected yet.
        }
        if (!cancelled) setStatus("disconnected");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      connector?.removeAllListeners();
    };
  }, []);

  const connect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) throw new Error("The wallet connector hasn't loaded yet.");
    await connector.whenManifestLoaded;
    await connector.connect();
  }, []);

  const disconnect = useCallback(async () => {
    const connector = connectorRef.current;
    if (connector) await connector.disconnect();
  }, []);

  const signAndSend = useCallback(
    async (tx: PlannedTransaction) => {
      const connector = connectorRef.current;
      if (!connector || !accountId) throw new Error("Connect a wallet first.");
      const wallet = await connector.wallet();
      const result = await wallet.signAndSendTransaction({
        network: config.network,
        signerId: accountId,
        receiverId: tx.receiverId,
        actions: tx.actions,
      });
      const hash = (result as { transaction?: { hash?: string } } | undefined)?.transaction?.hash;
      if (!hash) throw new Error("The wallet didn't return a transaction hash, so the result can't be checked.");
      return hash;
    },
    [accountId],
  );

  const value = useMemo(
    () => ({ status, accountId, walletName, connect, disconnect, signAndSend }),
    [status, accountId, walletName, connect, disconnect, signAndSend],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
