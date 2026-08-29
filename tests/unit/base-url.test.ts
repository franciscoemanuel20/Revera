import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseUrl } from "@/lib/config/urls";

/**
 * Regressão do bug que parou a loja em 29/08/2026.
 *
 * `NEXT_PUBLIC_SITE_URL` na Vercel tinha um TAB antes do "https". A
 * InfinitePay recusou a criação do link com 422 ("redirect_url must be a
 * valid HTTP(S) URL with a host") e nenhum cliente conseguiu pagar.
 *
 * Estes testes existem para que espaço em branco em variável de ambiente
 * nunca mais chegue ao gateway.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
  delete process.env.PORT;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("baseUrl — higiene do valor", () => {
  it("remove o TAB que quebrou o pagamento em produção", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "\thttps://www.reveraprotesecapilar.com";
    expect(baseUrl()).toBe("https://www.reveraprotesecapilar.com");
  });

  it("remove espaços e quebras de linha em volta", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "  https://www.reveraprotesecapilar.com \n";
    expect(baseUrl()).toBe("https://www.reveraprotesecapilar.com");
  });

  it("remove a barra final para não gerar // no caminho", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.reveraprotesecapilar.com/";
    expect(baseUrl()).toBe("https://www.reveraprotesecapilar.com");
  });

  it("produz uma URL que o validador de um gateway aceita", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "\thttps://www.reveraprotesecapilar.com";
    const redirect = `${baseUrl()}/pedido/abc-123`;
    // A mesma checagem que a InfinitePay faz: URL absoluta, http(s), com host.
    const u = new URL(redirect);
    expect(redirect).toBe("https://www.reveraprotesecapilar.com/pedido/abc-123");
    expect(u.protocol).toBe("https:");
    expect(u.host).toBe("www.reveraprotesecapilar.com");
    expect(redirect).not.toMatch(/\s/);
  });

  it("descarta valor sem esquema e cai no domínio da Vercel em vez de quebrar", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "www.reveraprotesecapilar.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "revera.vercel.app";
    expect(baseUrl()).toBe("https://revera.vercel.app");
  });

  it("descarta protocolo que não seja http/https", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "ftp://www.reveraprotesecapilar.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "revera.vercel.app";
    expect(baseUrl()).toBe("https://revera.vercel.app");
  });

  it("higieniza também o domínio vindo da Vercel", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = " revera.vercel.app ";
    expect(baseUrl()).toBe("https://revera.vercel.app");
  });

  it("em desenvolvimento usa a porta real do servidor", () => {
    process.env.PORT = "3002";
    expect(baseUrl()).toBe("http://localhost:3002");
  });
});
