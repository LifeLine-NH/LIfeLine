import { config } from "./config";
import type { CaseStatus, Nanos, Role, Verdict } from "./types";

// Exact u128 → "3,200.00". Truncates below the cent so a displayed amount is never more than what's held.
export function formatAmount(raw: string | bigint | undefined, withSymbol = true): string {
  const value = BigInt(raw ?? "0");
  const scale = BigInt(10) ** BigInt(config.tokenDecimals);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const whole = abs / scale;
  const cents = ((abs % scale) * BigInt(100)) / scale;
  const text = `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
  return withSymbol ? `${text} ${config.tokenSymbol}` : text;
}

// "5,000 USDC" for tight spots like the seal; keeps cents only when there are some.
export function formatAmountCompact(raw: string | bigint | undefined): string {
  const full = formatAmount(raw, false).replace(/\.00$/, "");
  return `${full} ${config.tokenSymbol}`;
}

// Whole token units as a number, for proportions and count-up animation only. Never for money logic.
export function amountToNumber(raw: string | bigint | undefined): number {
  const value = BigInt(raw ?? "0");
  const scale = BigInt(10) ** BigInt(config.tokenDecimals);
  return Number(value / scale) + Number(value % scale) / Number(scale);
}

export function nanosToDate(ns: Nanos): Date {
  return new Date(Number(BigInt(ns) / BigInt(1_000_000)));
}

export function nanosToMs(ns: Nanos): number {
  return Number(BigInt(ns) / BigInt(1_000_000));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function parts(input: Nanos | Date | string) {
  const d = input instanceof Date ? input : typeof input === "string" && input.includes("T") ? new Date(input) : nanosToDate(input);
  return { d, day: d.getUTCDate(), mon: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

// "9 Nov 2026, 06:42 UTC"
export function formatTime(input: Nanos | Date | string): string {
  const p = parts(input);
  return `${p.day} ${p.mon} ${p.year}, ${p.hm} UTC`;
}

// "9 Nov 2026, 06:42" for table cells where the UTC note sits in the caption.
export function formatDate(input: Nanos | Date | string): string {
  const p = parts(input);
  return `${p.day} ${p.mon} ${p.year}, ${p.hm}`;
}

// "9 Nov, 06:42"
export function formatShort(input: Nanos | Date | string): string {
  const p = parts(input);
  return `${p.day} ${p.mon}, ${p.hm}`;
}

// "06:42"
export function formatClock(input: Nanos | Date | string): string {
  return parts(input).hm;
}

export function timeAgo(input: Nanos | Date | string, now = Date.now()): string {
  const ms = now - parts(input).d.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "Yesterday" : formatShort(input);
}

// Evidence and record hashes: first 10 and last 5.
export function shortHash(hash: string): string {
  return hash.length <= 18 ? hash : `${hash.slice(0, 10)}…${hash.slice(-5)}`;
}

// Transaction hashes: first 8 and last 4.
export function shortTx(hash: string): string {
  return hash.length <= 14 ? hash : `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

// 64 character implicit accounts become a1b2c3…e9f0; long named accounts keep their ending.
export function shortAccount(id: string, max = 24): string {
  if (/^[0-9a-f]{64}$/.test(id)) return `${id.slice(0, 6)}…${id.slice(-4)}`;
  return id.length > max ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
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

export type StatusTone = "progress" | "funded" | "delivered" | "review" | "rejected" | "expired";

export const statusTone: Record<CaseStatus, StatusTone> = {
  Open: "progress",
  Verified: "funded",
  Bidding: "funded",
  Awarded: "funded",
  ProofSubmitted: "funded",
  Delivered: "delivered",
  NeedsReview: "review",
  Rejected: "rejected",
  Expired: "expired",
};

export const ROLES: Role[] = ["geo", "fact", "sev", "red"];

export const roleLabel: Record<Role, { name: string; job: string; glyph: string; short: string }> = {
  geo: { name: "Geo", glyph: "G", job: "Checks report spread, timing and source diversity. No AI.", short: "spread, timing, sources · no AI" },
  fact: { name: "Fact", glyph: "F", job: "Checks the claim against outside data sources.", short: "outside data sources" },
  sev: { name: "Severity", glyph: "S", job: "Proposes how serious it is, tier 1 to 4.", short: "proposes tier 1 to 4" },
  red: { name: "Red team", glyph: "R", job: "Argues the report is fake and votes no if it can't be rebutted.", short: "argues the report is fake" },
};

export const verdictWord: Record<Verdict, string> = { Yes: "Yes", No: "No", Abstain: "Abstained" };
export const verdictClass: Record<Verdict, string> = { Yes: "v-yes", No: "v-no", Abstain: "v-abs" };

export const incidentLabel: Record<string, string> = {
  flood: "Flood",
  earthquake: "Earthquake",
  fire: "Fire",
  cyclone: "Cyclone",
  other: "Other",
};

export const incidentGlyph: Record<string, string> = {
  flood: "FL",
  earthquake: "EQ",
  fire: "FI",
  cyclone: "CY",
  other: "OT",
};

export const sourceTypeLabel: Record<string, string> = {
  sms_relay: "SMS relay",
  partner_relay: "Partner relay",
  web_form: "Web form",
};

export function percent(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}
