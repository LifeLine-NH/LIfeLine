import { config } from "./config";

function base(): string | null {
  if (config.chainMode === "mainnet") return "https://nearblocks.io";
  if (config.chainMode === "testnet") return "https://testnet.nearblocks.io";
  return null;
}

// Returns null in stub mode: sample hashes must never look like real transactions.
export function txUrl(hash: string | undefined): string | null {
  const root = base();
  return root && hash ? `${root}/txns/${hash}` : null;
}

export function accountUrl(accountId: string): string | null {
  const root = base();
  return root ? `${root}/address/${accountId}` : null;
}
