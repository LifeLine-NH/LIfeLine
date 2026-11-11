export type ChainMode = "stub" | "testnet" | "mainnet";
export type DataMode = "replay" | "live";

function chainMode(): ChainMode {
  const value = process.env.NEXT_PUBLIC_CHAIN_MODE;
  return value === "testnet" || value === "mainnet" ? value : "stub";
}

export const config = {
  chainMode: chainMode(),
  network: (chainMode() === "mainnet" ? "mainnet" : "testnet") as "mainnet" | "testnet",
  poolTokenId: process.env.NEXT_PUBLIC_POOL_TOKEN_ID ?? "",
  donationMsg: process.env.NEXT_PUBLIC_DONATION_MSG ?? "",
  donateGasTgas: Number(process.env.NEXT_PUBLIC_DONATE_GAS_TGAS ?? 150),
  faucetEnabled: chainMode() === "testnet" && process.env.NEXT_PUBLIC_TEST_TOKEN_FAUCET === "true",
  dataMode: (process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "replay") as DataMode,
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "",
  rpcUrl:
    process.env.NEXT_PUBLIC_NEAR_RPC_URL ??
    (chainMode() === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org"),
  tokenSymbol: process.env.NEXT_PUBLIC_POOL_TOKEN_SYMBOL ?? "USDC",
  tokenDecimals: Number(process.env.NEXT_PUBLIC_POOL_TOKEN_DECIMALS ?? 6),
  evidenceBaseUrl: process.env.EVIDENCE_BASE_URL ?? "",
};
