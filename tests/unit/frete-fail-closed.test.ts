/**
 * O frete não pode cair em mock onde existe comprador real.
 *
 * Buraco pego em 28/08/2026, mesma família do P0-2 de pagamentos: com
 * SUPERFRETE_TOKEN ausente, o factory devolvia o MOCK em qualquer
 * ambiente — em produção isso cobraria do cliente um frete INVENTADO
 * (R$ 19,90 + dígito do CEP), silenciosamente. Agora o mock só existe
 * onde simulação é permitida; em produção sem token, o provider real
 * falha como ShippingUnavailable e a cotação vira `indisponivel` — a
 * venda acontece com frete 0 e motivo gravado, que é a decisão de
 * assimetria já documentada em cotarFrete.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

function ambiente(vercelEnv: string | undefined, nodeEnv: string) {
  const env = process.env as Record<string, string | undefined>;
  if (vercelEnv === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = vercelEnv;
  env.NODE_ENV = nodeEnv;
  delete env.APP_ENV;
  delete env.SUPERFRETE_TOKEN;
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getShippingProvider — onde o mock pode existir", () => {
  it("produção sem token devolve o provider REAL (que falha fechado), nunca o mock", async () => {
    ambiente("production", "production");
    const { getShippingProvider } = await import("@/lib/shipping");
    expect(getShippingProvider().name).not.toBe("mock");
  });

  it("desenvolvimento sem token devolve o mock — é para isso que ele existe", async () => {
    ambiente(undefined, "development");
    const { getShippingProvider } = await import("@/lib/shipping");
    expect(getShippingProvider().name).toBe("mock");
  });

  it("com token, o provider real vale em qualquer ambiente", async () => {
    ambiente("production", "production");
    (process.env as Record<string, string>).SUPERFRETE_TOKEN = "token-x";
    const { getShippingProvider } = await import("@/lib/shipping");
    expect(getShippingProvider().name).not.toBe("mock");
  });
});

describe("cotarFrete em produção sem token", () => {
  it("não lança e devolve indisponivel — a venda segue com frete 0 e motivo gravado", async () => {
    ambiente("production", "production");
    const { cotarFrete } = await import("@/lib/shipping/cotar");
    const r = await cotarFrete({ cepDestino: "12245000", valorDeclaradoCents: 65000, quantidade: 1 });
    expect(r.escolhida).toBeNull();
    expect(r.opcoes).toHaveLength(0);
    // O motivo cita a PRIMEIRA env que faltar (sandbox ou token) — o que
    // importa é que é indisponibilidade declarada, nunca um preço de mock.
    expect(r.indisponivel).toMatch(/SUPERFRETE/);
  });
});
