import { describe, expect, it } from "vitest";
import { normalizarAwbDhl } from "@/lib/shipping/awb-dhl";

describe("normalizarAwbDhl", () => {
  it("aceita 10 dígitos, com espaços ou hífens", () => {
    expect(normalizarAwbDhl("1234567890")).toBe("1234567890");
    expect(normalizarAwbDhl(" 12 3456-7890 ")).toBe("1234567890");
    expect(normalizarAwbDhl("12.345.678-90")).toBe("1234567890");
  });
  it("recusa o que não é guia DHL Express", () => {
    expect(normalizarAwbDhl("123456789")).toBeNull();
    expect(normalizarAwbDhl("12345678901")).toBeNull();
    expect(normalizarAwbDhl("JD0140000000000")).toBeNull();
    expect(normalizarAwbDhl("")).toBeNull();
    expect(normalizarAwbDhl("x1234567890")).toBeNull();
  });
});
