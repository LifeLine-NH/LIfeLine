"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";
import { describeError } from "@/lib/donate/messages";
import { accountNetwork } from "@/lib/donate/plan";
import { accountUrl } from "@/lib/explorer";
import { shortAccount } from "@/lib/format";
import { useWallet } from "@/lib/wallet/WalletProvider";

export function WalletButton() {
  const { status, accountId, connect, disconnect } = useWallet();
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (status === "unavailable") {
    return (
      <span className="cap" title="The wallet connector couldn't load in this browser.">
        Wallet unavailable
      </span>
    );
  }

  if (status === "connected" && accountId) {
    const net = accountNetwork(accountId);
    const wrong = net !== "any" && net !== config.network;
    const explorer = accountUrl(accountId);
    return (
      <div className="relative" ref={ref}>
        <button type="button" className={`wallet${wrong ? " wallet-warn" : ""}`} onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu">
          <span className="avatar" aria-hidden />
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="acct" style={{ maxWidth: 150 }} title={accountId}>
              {shortAccount(accountId, 20)}
            </span>
            <span className="cap" style={{ fontSize: 11.5, lineHeight: 1, color: wrong ? "#94570A" : "#62677A" }}>
              {wrong ? `${net === "mainnet" ? "Mainnet" : "Testnet"} account` : config.network === "mainnet" ? "Mainnet" : "Testnet"}
            </span>
          </span>
        </button>
        {menu && (
          <div className="popover" role="menu" style={{ width: 280, top: 52 }}>
            <span className="cap">Connected as</span>
            <p className="mono" style={{ overflowWrap: "anywhere", margin: "4px 0 12px", color: "var(--ink)" }}>
              {accountId}
            </p>
            {wrong && (
              <p className="err" style={{ marginBottom: 12 }}>
                This is a {net} account, but this site runs on {config.network}. Switch accounts in your wallet.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {explorer && (
                <a className="btn btn-secondary btn-sm" href={explorer} target="_blank" rel="noreferrer" role="menuitem" style={{ justifyContent: "flex-start" }}>
                  View account on explorer
                </a>
              )}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                role="menuitem"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  setMenu(false);
                  void disconnect();
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (connecting || status === "loading") {
    return (
      <button type="button" className="btn btn-primary btn-busy" aria-busy="true" disabled style={{ background: "#3A3D47", color: "#fff", borderColor: "transparent" }}>
        <span className="spin" />
        {connecting ? "Opening wallet…" : "Loading wallets…"}
      </button>
    );
  }

  return (
    <div className="relative flex flex-col items-end">
      <button
        type="button"
        className="btn btn-primary"
        onClick={async () => {
          setError(null);
          setConnecting(true);
          try {
            await connect();
          } catch (err) {
            setError(describeError(err));
          } finally {
            setConnecting(false);
          }
        }}
      >
        Connect wallet
      </button>
      {error && (
        <span role="alert" className="err popover" style={{ top: 50, width: 260, padding: 12 }}>
          {error}
        </span>
      )}
    </div>
  );
}
