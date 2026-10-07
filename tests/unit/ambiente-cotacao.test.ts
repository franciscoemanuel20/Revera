import { afterEach, expect, it, vi } from "vitest";
import { cotacaoDhlPermitida, origemCotacaoDhl } from "@/lib/internacional/ambiente-cotacao";

afterEach(() => vi.unstubAllEnvs());

it("aceita somente cotação DHL de produção em produção", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("APP_ENV", "staging");
  expect(cotacaoDhlPermitida("producao")).toBe(true);
  expect(cotacaoDhlPermitida("sandbox")).toBe(false);
});

it("aceita somente sandbox em staging explicitamente configurado", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("APP_ENV", "staging");
  expect(cotacaoDhlPermitida("sandbox")).toBe(true);
  expect(cotacaoDhlPermitida("producao")).toBe(false);
  expect(origemCotacaoDhl("sandbox")).toBe("mydhl-sandbox");
});

it("recusa cotação pagável em preview comum e desenvolvimento", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("APP_ENV", "");
  expect(cotacaoDhlPermitida("sandbox")).toBe(false);
  expect(cotacaoDhlPermitida("producao")).toBe(false);
  vi.stubEnv("VERCEL_ENV", "development");
  expect(cotacaoDhlPermitida("sandbox")).toBe(false);
});
