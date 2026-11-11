import { config } from "../config";
import type { Bid, Case, CaseStatus, ContractConfig, DeliveryVote, Donation, Ngo, Pool, Vote } from "../types";
import { nearChain } from "./near";
import { stubChain } from "./stub";

export interface ListCasesArgs {
  from?: number;
  limit?: number;
  status?: CaseStatus;
}

// One interface for every data source. Pages never know which one they are reading.
export interface ChainReader {
  getConfig(): Promise<ContractConfig>;
  getPool(): Promise<Pool>;
  listCases(args?: ListCasesArgs): Promise<Case[]>;
  getCase(id: string): Promise<Case | null>;
  getVotes(id: string): Promise<Vote[]>;
  getBids(id: string): Promise<Bid[]>;
  getDeliveryVotes(id: string): Promise<DeliveryVote[]>;
  getNgo(accountId: string): Promise<Ngo | null>;
  getDonations(from?: number, limit?: number): Promise<Donation[]>;
}

export const chain: ChainReader = config.chainMode === "stub" ? stubChain : nearChain;
