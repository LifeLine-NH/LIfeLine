import { config } from "../config";
import { viewFunction } from "../near/rpc";
import type { ChainReader } from "./index";

const rpc = { url: config.rpcUrl };

function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!config.contractId) throw new Error("NEXT_PUBLIC_CONTRACT_ID is not set");
  return viewFunction<T>(rpc, config.contractId, method, args);
}

// Method names follow section 5 of the shared plan. get_delivery_votes is not in that list yet: confirm with A.
export const nearChain: ChainReader = {
  getConfig: () => view("get_config"),
  getPool: () => view("get_pool"),
  listCases: ({ from = 0, limit = 50, status } = {}) => view("list_cases", { from, limit, ...(status ? { status } : {}) }),
  getCase: (id) => view("get_case", { case_id: id }),
  getVotes: (id) => view("get_votes", { case_id: id }),
  getBids: (id) => view("get_bids", { case_id: id }),
  getDeliveryVotes: (id) => view("get_delivery_votes", { case_id: id }),
  getNgo: (accountId) => view("get_ngo", { account_id: accountId }),
  getDonations: (from = 0, limit = 20) => view("get_donations", { from, limit }),
};
