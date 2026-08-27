import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ambienteAtual, ehProducao, permiteSimulacao } from "@/lib/config/ambiente";
import { getPaymentProvider, pagamentoEstaDisponivel, PagamentoIndisponivel } from "@/lib/payments";

/**
 * P0-2 — o sistema caía em MOCK quando PAYMENT_PROVIDER estava ausente, e o
 * mock aprova qualquer pagamento sem cobrar.
 *
 * Risco financeiro protegido: entregar prótese de R$ 1.600 sem receber, em
 * todo pedido, até alguém perceber. Reproduzido em 27/08/2026 com
 * VERCEL_ENV=production e a variável ausente — o provider escolhido foi
 * 'mock'.
 */

const ORIGINAL = { ...process.env };

function ambiente(vars: Record<string, string | undefined>) {
  for (const k of ["PAYMENT_PROVIDER", "NODE_ENV", "VERCEL_ENV"]) {
    delete (process.env as Record<string, string | undefined>)[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) (process.env as Record<string, string>)[k] = v;
  }
}

beforeEach(() => ambiente({}));
afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL)) delete (process.env as Record<string, string | undefined>)[k];
  }
  Object.assign(process.env, ORIGINAL);
});

describe("ambienteAtual — na dúvida, é produção", () => {
  it("VERCEL_ENV=production é produção", () => {
    ambiente({ VERCEL_ENV: "production", NODE_ENV: "development" });
    expect(ambienteAtual()).toBe("producao");
  });

  it("preview da Vercel NÃO é desenvolvimento — tem URL pública", () => {
    ambiente({ VERCEL_ENV: "preview" });
    expect(ambienteAtual()).toBe("preview");
    expect(permiteSimulacao()).toBe(false);
  });

  it("next dev é desenvolvimento", () => {
    ambiente({ NODE_ENV: "development" });
    expect(permiteSimulacao()).toBe(true);
  });

  it("next start local (NODE_ENV=production) é tratado como produção", () => {
    ambiente({ NODE_ENV: "production" });
    expect(ehProducao()).toBe(true);
    expect(permiteSimulacao()).toBe(false);
  });

  it("SEM NENHUM SINAL de ambiente, assume produção (fail-closed)", () => {
    ambiente({});
    expect(ambienteAtual()).toBe("producao");
    expect(permiteSimulacao()).toBe(false);
  });

  it("NODE_ENV com valor desconhecido assume produção", () => {
    ambiente({ NODE_ENV: "staging" });
    expect(ehProducao()).toBe(true);
  });
});

describe("getPaymentProvider — nunca existe padrão", () => {
  it("O BUG ORIGINAL: sem PAYMENT_PROVIDER em produção, NÃO cai em mock", () => {
    ambiente({ NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(() => getPaymentProvider()).toThrow(PagamentoIndisponivel);
    expect(() => getPaymentProvider()).toThrow(/PAYMENT_PROVIDER não está definida/);
  });

  it("sem PAYMENT_PROVIDER nem em desenvolvimento cai em mock", () => {
    ambiente({ NODE_ENV: "development" });
    expect(() => getPaymentProvider()).toThrow(PagamentoIndisponivel);
  });

  it("variável vazia ou só espaços conta como ausente", () => {
    ambiente({ NODE_ENV: "development", PAYMENT_PROVIDER: "   " });
    expect(() => getPaymentProvider()).toThrow(PagamentoIndisponivel);
  });

  it("mock é RECUSADO em produção mesmo pedido explicitamente", () => {
    ambiente({ PAYMENT_PROVIDER: "mock", VERCEL_ENV: "production" });
    expect(() => getPaymentProvider()).toThrow(/só pode rodar em desenvolvimento/);
  });

  it("mock é RECUSADO em preview da Vercel", () => {
    ambiente({ PAYMENT_PROVIDER: "mock", VERCEL_ENV: "preview" });
    expect(() => getPaymentProvider()).toThrow(PagamentoIndisponivel);
  });

  it("mock é aceito em desenvolvimento, quando pedido explicitamente", () => {
    ambiente({ PAYMENT_PROVIDER: "mock", NODE_ENV: "development" });
    expect(getPaymentProvider().name).toBe("mock");
  });

  it("infinitepay é aceito em produção", () => {
    ambiente({ PAYMENT_PROVIDER: "infinitepay", VERCEL_ENV: "production" });
    expect(getPaymentProvider().name).toBe("infinitepay");
  });

  it("valor desconhecido não vira mock nem real — lança", () => {
    ambiente({ PAYMENT_PROVIDER: "stripe", NODE_ENV: "development" });
    expect(() => getPaymentProvider()).toThrow(/desconhecido/);
  });

  it("pagamentoEstaDisponivel responde sem lançar", () => {
    ambiente({ VERCEL_ENV: "production" });
    expect(pagamentoEstaDisponivel()).toBe(false);
    ambiente({ PAYMENT_PROVIDER: "infinitepay", VERCEL_ENV: "production" });
    expect(pagamentoEstaDisponivel()).toBe(true);
  });
});
