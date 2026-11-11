import { config } from "./config";
import type { CaseStatus, Nanos, Role } from "./types";

export function formatAmount(raw: string | undefined, withSymbol = true): string {
  const value = BigInt(raw || "0");
  const scale = BigInt(10) ** BigInt(config.tokenDecimals);
  const whole = value / scale;
  const cents = ((value % scale) * BigInt(100)) / scale;
  const text =
    whole.toLocaleString("en-US") + (cents > BigInt(0) ? "." + cents.toString().padStart(2, "0") : "");
  return withSymbol ? `${text} ${config.tokenSymbol}` : text;
}

export function nanosToDate(ns: Nanos): Date {
  return new Date(Number(BigInt(ns) / BigInt(1_000_000)));
}

export function formatTime(ns: Nanos): string {
  return nanosToDate(ns).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function shortHash(hash: string, size = 8): string {
  return hash.length <= size * 2 ? hash : `${hash.slice(0, size)}…${hash.slice(-4)}`;
}

export const statusLabel: Record<CaseStatus, string> = {
  Open: "Verifying",
  Verified: "Verified",
  NeedsReview: "Needs review",
  Rejected: "Rejected",
  Bidding: "Open for bids",
  Awarded: "Awarded",
  ProofSubmitted: "Proof submitted",
  Delivered: "Delivered",
  Expired: "Expired",
};

export const roleLabel: Record<Role, { name: string; job: string }> = {
  geo: { name: "Geo", job: "Checks report spread, timing and source diversity. No AI." },
  fact: { name: "Fact", job: "Checks the claim against outside data sources." },
  sev: { name: "Severity", job: "Proposes how serious it is, tier 1 to 4." },
  red: { name: "Red team", job: "Argues the report is fake and votes no if it can't be rebutted." },
};

export const incidentLabel: Record<string, string> = {
  flood: "Flood",
  earthquake: "Earthquake",
  fire: "Fire",
  cyclone: "Cyclone",
  other: "Other",
};
