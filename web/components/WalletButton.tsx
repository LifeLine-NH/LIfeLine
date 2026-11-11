"use client";

import { useState } from "react";
import { describeError } from "@/lib/donate/messages";
import { useWallet } from "@/lib/wallet/WalletProvider";

function shortAccount(id: string) {
  return id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id;
}

export function WalletButton() {
  const { status, accountId, connect, disconnect } = useWallet();
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") {
    return <span className="text-sm text-white/70">Wallet…</span>;
  }
  if (status === "unavailable") {
    return <span className="text-sm text-white/70" title="The wallet connector couldn't load in this browser.">Wallet unavailable</span>;
  }
  if (status === "connected" && accountId) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="font-semibold" title={accountId}>
          {shortAccount(accountId)}
        </span>
        <button type="button" onClick={() => disconnect()} className="rounded border border-white/40 px-2 py-1 text-white/90 hover:bg-white/10">
          Disconnect
        </button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          setError(null);
          try {
            await connect();
          } catch (err) {
            setError(describeError(err));
          }
        }}
        className="rounded bg-white px-3 py-1.5 text-sm font-semibold text-tarp-deep hover:bg-chalk"
      >
        Connect wallet
      </button>
      {error && (
        <span role="alert" className="text-xs text-white/90">
          {error}
        </span>
      )}
    </span>
  );
}
