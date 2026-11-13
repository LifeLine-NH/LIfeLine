import { type RpcOptions, viewFunction } from "./rpc";

// NEP-141 (fungible token) and NEP-145 (storage management) reads.

export interface FtMetadata {
  spec: string;
  name: string;
  symbol: string;
  decimals: number;
  icon?: string | null;
}

export interface StorageBalance {
  total: string;
  available: string;
}

export interface StorageBounds {
  min: string;
  max?: string | null;
}

export const ftMetadata = (rpc: RpcOptions, token: string) => viewFunction<FtMetadata>(rpc, token, "ft_metadata");

export async function ftBalanceOf(rpc: RpcOptions, token: string, accountId: string): Promise<bigint> {
  return BigInt(await viewFunction<string>(rpc, token, "ft_balance_of", { account_id: accountId }));
}

export const storageBalanceOf = (rpc: RpcOptions, token: string, accountId: string) =>
  viewFunction<StorageBalance | null>(rpc, token, "storage_balance_of", { account_id: accountId });

export const storageBalanceBounds = (rpc: RpcOptions, token: string) => viewFunction<StorageBounds>(rpc, token, "storage_balance_bounds");
