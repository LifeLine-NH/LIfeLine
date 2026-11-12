// NEAR Intents 1Click dry quotes. Spec: https://1click.chaindefuser.com/docs/v0/openapi.yaml
// A dry quote prices the swap without creating a deposit address, so nothing can move.
// 1Click has no testnet: quotes are always for real mainnet assets.

export const ONECLICK_BASE = "https://1click.chaindefuser.com";

// Native USDC on NEAR mainnet, as listed by GET /v0/tokens.
export const NEAR_USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const NEAR_USDC_DECIMALS = 6;

export interface Destination {
  key: string;
  label: string;
  chain: string;
  assetId: string;
  decimals: number;
  addressKind: "evm" | "solana";
}

// Routes checked with live dry quotes on 12 Nov 2026.
export const DESTINATIONS: Destination[] = [
  { key: "base-usdc", label: "USDC on Base", chain: "Base", assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", decimals: 6, addressKind: "evm" },
  { key: "arb-usdc", label: "USDC on Arbitrum", chain: "Arbitrum", assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", decimals: 6, addressKind: "evm" },
  { key: "eth-usdc", label: "USDC on Ethereum", chain: "Ethereum", assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", decimals: 6, addressKind: "evm" },
  { key: "sol-usdc", label: "USDC on Solana", chain: "Solana", assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", decimals: 6, addressKind: "solana" },
];

export class QuoteInputError extends Error {}

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function checkRecipient(dest: Destination, recipient: string): string {
  const r = recipient.trim();
  if (dest.addressKind === "evm" && !EVM.test(r)) throw new QuoteInputError(`Enter a ${dest.chain} address: 0x followed by 40 hex characters.`);
  if (dest.addressKind === "solana" && !SOLANA.test(r)) throw new QuoteInputError("Enter a Solana address (base58, 32 to 44 characters).");
  return r;
}

// Pool token units → NEAR USDC base units. Truncates, never rounds up.
export function toUsdcUnits(amount: string, fromDecimals: number): string {
  if (!/^\d+$/.test(amount)) throw new QuoteInputError("Amount must be a whole number of base units.");
  const v = BigInt(amount);
  if (v <= BigInt(0)) throw new QuoteInputError("Amount must be more than zero.");
  const diff = fromDecimals - NEAR_USDC_DECIMALS;
  const out = diff >= 0 ? v / BigInt(10) ** BigInt(diff) : v * BigInt(10) ** BigInt(-diff);
  if (out <= BigInt(0)) throw new QuoteInputError("Amount is too small to quote.");
  return out.toString();
}

export interface QuoteInput {
  amountUsdc: string;
  destination: Destination;
  recipient: string;
  refundTo: string;
  now?: Date;
}

export function buildQuoteRequest({ amountUsdc, destination, recipient, refundTo, now = new Date() }: QuoteInput) {
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: NEAR_USDC,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: destination.assetId,
    amount: amountUsdc,
    refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(now.getTime() + 10 * 60_000).toISOString(),
  };
}

export interface PayoutQuote {
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  minAmountOut: string;
  amountOutUsd: string;
  withdrawFee: string;
  appFeeBps: number;
  timeEstimateSec: number;
  quotedAt: string;
  correlationId: string;
  signature: string;
  destination: { key: string; label: string; chain: string; decimals: number };
  recipient: string;
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new Error(`The quote response is missing ${name}.`);
  return v;
};

export function parseQuoteResponse(body: unknown, destination: Destination, recipient: string): PayoutQuote {
  if (!body || typeof body !== "object") throw new Error("The quote service returned an empty response.");
  const b = body as Record<string, unknown>;
  const q = b.quote as Record<string, unknown> | undefined;
  if (!q) throw new Error("The quote service returned no quote.");
  const req = (b.quoteRequest ?? {}) as { appFees?: { fee?: number }[]; dry?: boolean; destinationAsset?: string };
  if (req.dry !== true) throw new Error("The quote service did not confirm a dry run.");
  if (req.destinationAsset && req.destinationAsset !== destination.assetId) throw new Error("The quote is for a different asset than requested.");
  return {
    amountIn: str(q.amountIn, "amountIn"),
    amountInFormatted: str(q.amountInFormatted, "amountInFormatted"),
    amountOut: str(q.amountOut, "amountOut"),
    amountOutFormatted: str(q.amountOutFormatted, "amountOutFormatted"),
    minAmountOut: str(q.minAmountOut, "minAmountOut"),
    amountOutUsd: str(q.amountOutUsd, "amountOutUsd"),
    withdrawFee: typeof q.withdrawFee === "string" ? q.withdrawFee : "0",
    appFeeBps: (req.appFees ?? []).reduce((s, f) => s + (typeof f.fee === "number" ? f.fee : 0), 0),
    timeEstimateSec: typeof q.timeEstimate === "number" ? q.timeEstimate : 0,
    quotedAt: typeof b.timestamp === "string" ? b.timestamp : new Date().toISOString(),
    correlationId: typeof b.correlationId === "string" ? b.correlationId : "",
    signature: typeof b.signature === "string" ? b.signature : "",
    destination: { key: destination.key, label: destination.label, chain: destination.chain, decimals: destination.decimals },
    recipient,
  };
}

export async function requestDryQuote(input: QuoteInput, opts: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<PayoutQuote> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${ONECLICK_BASE}/v0/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.apiKey ? { "X-API-Key": opts.apiKey } : {}) },
    body: JSON.stringify(buildQuoteRequest(input)),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string" ? (body as { message: string }).message : `HTTP ${res.status}`;
    if (res.status === 400) throw new QuoteInputError(`The quote service refused the request: ${msg}.`);
    throw new Error(`The quote service answered ${res.status}: ${msg}.`);
  }
  return parseQuoteResponse(body, input.destination, input.recipient);
}
