// Exact token arithmetic. Amounts never pass through floating point.

export const YOCTO_PER_NEAR = BigInt(10) ** BigInt(24);
export const TGAS = BigInt(10) ** BigInt(12);
export const U128_MAX = (BigInt(1) << BigInt(128)) - BigInt(1);

export class AmountError extends Error {
  constructor(
    message: string,
    readonly reason: "empty" | "format" | "precision" | "zero" | "too_large",
  ) {
    super(message);
    this.name = "AmountError";
  }
}

// "12.5" with 6 decimals -> 12500000n. Accepts digits with an optional single dot; nothing else.
export function parseUnits(input: string, decimals: number): bigint {
  const text = input.trim().replace(/,/g, "");
  if (text === "") throw new AmountError("Enter an amount.", "empty");
  if (!/^\d*\.?\d*$/.test(text) || text === ".") throw new AmountError("Use numbers only, like 25 or 12.50.", "format");
  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > decimals) {
    throw new AmountError(`This token allows at most ${decimals} decimal places.`, "precision");
  }
  const value = BigInt((whole || "0") + fraction.padEnd(decimals, "0"));
  if (value === BigInt(0)) throw new AmountError("The amount must be more than zero.", "zero");
  if (value > U128_MAX) throw new AmountError("That amount is too large.", "too_large");
  return value;
}

// 12500000n with 6 decimals -> "12.5". maxFraction trims (never rounds up) for display.
export function formatUnits(raw: bigint | string, decimals: number, maxFraction = decimals): string {
  const value = BigInt(raw);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = (abs / scale).toLocaleString("en-US");
  let fraction = (abs % scale).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  if (decimals === 0) fraction = "";
  return `${negative ? "-" : ""}${whole}${fraction ? "." + fraction : ""}`;
}

export function nearToYocto(near: string): bigint {
  return parseUnits(near, 24);
}
