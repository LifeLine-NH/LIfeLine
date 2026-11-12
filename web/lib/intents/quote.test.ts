import { describe, expect, it, vi } from "vitest";
import realQuote from "./__fixtures__/dry-quote-base-usdc.json";
import { buildQuoteRequest, checkRecipient, DESTINATIONS, NEAR_USDC, parseQuoteResponse, QuoteInputError, requestDryQuote, toUsdcUnits } from "./quote";

const base = DESTINATIONS.find((d) => d.key === "base-usdc")!;
const sol = DESTINATIONS.find((d) => d.key === "sol-usdc")!;
const ADDR = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

describe("toUsdcUnits", () => {
  it("passes 6 decimal amounts through", () => {
    expect(toUsdcUnits("1280000000", 6)).toBe("1280000000");
  });
  it("scales down from 18 decimals and truncates", () => {
    expect(toUsdcUnits("1280000000999999999999", 18)).toBe("1280000000");
  });
  it("scales up from fewer decimals", () => {
    expect(toUsdcUnits("128000", 2)).toBe("1280000000");
  });
  it("rejects zero, decimals and dust", () => {
    expect(() => toUsdcUnits("0", 6)).toThrow(QuoteInputError);
    expect(() => toUsdcUnits("12.5", 6)).toThrow(QuoteInputError);
    expect(() => toUsdcUnits("999", 18)).toThrow(QuoteInputError);
  });
});

describe("checkRecipient", () => {
  it("accepts EVM and Solana addresses for their chains", () => {
    expect(checkRecipient(base, ` ${ADDR} `)).toBe(ADDR);
    expect(checkRecipient(sol, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  });
  it("rejects the wrong format", () => {
    expect(() => checkRecipient(base, "ngo-rapid.near")).toThrow(QuoteInputError);
    expect(() => checkRecipient(sol, ADDR)).toThrow(QuoteInputError);
  });
});

describe("buildQuoteRequest", () => {
  it("always asks for a dry run from NEAR USDC with a near future deadline", () => {
    const now = new Date("2026-11-12T14:00:00Z");
    const r = buildQuoteRequest({ amountUsdc: "1280000000", destination: base, recipient: ADDR, refundTo: "intents.near", now });
    expect(r.dry).toBe(true);
    expect(r.originAsset).toBe(NEAR_USDC);
    expect(r.destinationAsset).toBe(base.assetId);
    expect(r.swapType).toBe("EXACT_INPUT");
    expect(r.deadline).toBe("2026-11-12T14:10:00.000Z");
  });
});

describe("parseQuoteResponse (real 1Click response, 12 Nov 2026)", () => {
  it("reads amounts, fees and timing", () => {
    const q = parseQuoteResponse(realQuote, base, ADDR);
    expect(q.amountIn).toBe("1280000000");
    expect(q.amountOutFormatted).toBe("1279.739053");
    expect(q.minAmountOut).toBe("1266941662");
    expect(q.withdrawFee).toBe("2400");
    expect(q.appFeeBps).toBe(1);
    expect(q.timeEstimateSec).toBe(22);
    expect(q.signature.startsWith("ed25519:")).toBe(true);
  });
  it("refuses a response that isn't a dry run or is for another asset", () => {
    const notDry = { ...realQuote, quoteRequest: { ...realQuote.quoteRequest, dry: false } };
    expect(() => parseQuoteResponse(notDry, base, ADDR)).toThrow(/dry run/);
    expect(() => parseQuoteResponse(realQuote, sol, ADDR)).toThrow(/different asset/);
  });
});

describe("requestDryQuote", () => {
  it("sends the API key header and maps a 400 to an input error", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "recipient is not valid" }), { status: 400 }));
    await expect(
      requestDryQuote({ amountUsdc: "1", destination: base, recipient: ADDR, refundTo: "intents.near" }, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/recipient is not valid/);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("k");
    expect(JSON.parse(init.body as string).dry).toBe(true);
  });
});
