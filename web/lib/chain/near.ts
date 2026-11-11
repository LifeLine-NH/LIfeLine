import { config } from "../config";
import type { ChainReader } from "./index";

async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!config.contractId) throw new Error("NEXT_PUBLIC_CONTRACT_ID is not set");
  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "lifeline-web",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: config.contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const body = await res.json();
  if (body.error || body.result?.error) {
    throw new Error(`${method} failed: ${JSON.stringify(body.error ?? body.result.error)}`);
  }
  return JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T;
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
