import { describe, expect, it } from "vitest";
import { AmountError, formatUnits, parseUnits, U128_MAX } from "./units";

describe("parseUnits", () => {
  it("converts decimal text exactly", () => {
    expect(parseUnits("12.5", 6)).toBe(BigInt(12_500_000));
    expect(parseUnits("0.000001", 6)).toBe(BigInt(1));
    expect(parseUnits("1,000", 6)).toBe(BigInt(1_000_000_000));
    expect(parseUnits(" 7 ", 6)).toBe(BigInt(7_000_000));
    expect(parseUnits(".5", 6)).toBe(BigInt(500_000));
    expect(parseUnits("1", 24)).toBe(BigInt(10) ** BigInt(24));
  });

  it("never goes through floating point", () => {
    // 0.1 + 0.2 style errors would show up here.
    expect(parseUnits("0.3", 18)).toBe(BigInt("300000000000000000"));
    expect(parseUnits("123456789.123456", 6)).toBe(BigInt("123456789123456"));
  });

  it.each([
    ["", "empty"],
    ["abc", "format"],
    ["1e6", "format"],
    ["-5", "format"],
    ["1.2.3", "format"],
    [".", "format"],
    ["0", "zero"],
    ["0.000", "zero"],
    ["1.0000001", "precision"],
  ])("rejects %j as %s", (input, reason) => {
    expect(() => parseUnits(input, 6)).toThrowError(AmountError);
    try {
      parseUnits(input, 6);
    } catch (err) {
      expect((err as AmountError).reason).toBe(reason);
    }
  });

  it("rejects amounts that don't fit in u128", () => {
    expect(() => parseUnits((U128_MAX + BigInt(1)).toString(), 0)).toThrowError(/too large/);
  });
});

describe("formatUnits", () => {
  it("formats base units for display", () => {
    expect(formatUnits(BigInt(12_500_000), 6)).toBe("12.5");
    expect(formatUnits("1000000000", 6)).toBe("1,000");
    expect(formatUnits(BigInt(1), 6)).toBe("0.000001");
    expect(formatUnits(BigInt(1_234_567), 6, 2)).toBe("1.23");
    expect(formatUnits(BigInt(5), 0)).toBe("5");
  });

  it("round trips with parseUnits", () => {
    for (const s of ["1", "0.5", "1234.000001", "99999999.99"]) {
      expect(formatUnits(parseUnits(s, 6), 6).replace(/,/g, "")).toBe(s);
    }
  });
});
