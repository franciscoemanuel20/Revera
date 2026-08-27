import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  baseSuperFrete,
  exigirAmbienteParaGastar,
  modoSuperFrete,
  TETO_SEGURO_CENTS,
  SERVICO,
} from "@/lib/shipping/superfrete-provider";
import { ShippingUnavailable } from "@/lib/shipping/provider";

/**
 * P0-4 — SUPERFRETE_SANDBOX era comparada com "1", e qualquer outro valor
 * caía em produção sem avisar.
 *
 * Risco financeiro protegido: `payLabel()` debita a carteira da SuperFrete no
 * instante da chamada. Em 26/08/2026 a variável continha o token de produção
 * copiado por engano (provado em 27/08: valor idêntico a SUPERFRETE_TOKEN),
 * então o ambiente de desenvolvimento apontava para a API de produção
 * acreditando estar em sandbox. Um teste de etiqueta ali gastaria dinheiro
 * real.
 */

const ORIGINAL = { ...process.env };

function ambiente(vars: Record<string, string | undefined>) {
  for (const k of ["SUPERFRETE_SANDBOX", "NODE_ENV", "VERCEL_ENV"]) {
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

describe("modoSuperFrete — sem fallback silencioso", () => {
  it("O BUG ORIGINAL: um token colado na variável NÃO vira produção calada", () => {
    // 155 caracteres, como o valor real encontrado. Nada de token verdadeiro
    // no teste — só o formato.
    ambiente({ SUPERFRETE_SANDBOX: "x".repeat(155) });
    expect(() => modoSuperFrete()).toThrow(ShippingUnavailable);
    expect(() => modoSuperFrete()).toThrow(/irreconhecível/);
  });

  it("a mensagem de erro não ecoa o valor — ele pode ser um segredo", () => {
    const valorSecreto = "abc123SEGREDO456";
    ambiente({ SUPERFRETE_SANDBOX: valorSecreto });
    try {
      modoSuperFrete();
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect((e as Error).message).not.toContain(valorSecreto);
      expect((e as Error).message).toContain("16 caracteres");
    }
  });

  it("variável AUSENTE lança, em vez de assumir produção", () => {
    ambiente({});
    expect(() => modoSuperFrete()).toThrow(/não definida/);
  });

  it("variável vazia lança", () => {
    ambiente({ SUPERFRETE_SANDBOX: "   " });
    expect(() => modoSuperFrete()).toThrow(ShippingUnavailable);
  });

  it('"1" é sandbox, explicitamente', () => {
    ambiente({ SUPERFRETE_SANDBOX: "1" });
    expect(modoSuperFrete()).toBe("sandbox");
    expect(baseSuperFrete()).toBe("https://sandbox.superfrete.com");
  });

  it('"0" é produção, explicitamente', () => {
    ambiente({ SUPERFRETE_SANDBOX: "0" });
    expect(modoSuperFrete()).toBe("producao");
    expect(baseSuperFrete()).toBe("https://api.superfrete.com");
  });

  it("aceita as formas escritas, sem virar adivinhação", () => {
    for (const v of ["true", "sim", "sandbox", "ON"]) {
      ambiente({ SUPERFRETE_SANDBOX: v });
      expect(modoSuperFrete()).toBe("sandbox");
    }
    for (const v of ["false", "nao", "produção", "production"]) {
      ambiente({ SUPERFRETE_SANDBOX: v });
      expect(modoSuperFrete()).toBe("producao");
    }
  });
});

describe("exigirAmbienteParaGastar — a trava do dinheiro", () => {
  it("RECUSA gastar com API de produção a partir de desenvolvimento", () => {
    ambiente({ SUPERFRETE_SANDBOX: "0", NODE_ENV: "development" });
    expect(() => exigirAmbienteParaGastar("criar etiqueta")).toThrow(
      /debita a carteira de verdade/
    );
  });

  it("RECUSA em preview da Vercel", () => {
    ambiente({ SUPERFRETE_SANDBOX: "0", VERCEL_ENV: "preview" });
    expect(() => exigirAmbienteParaGastar("pagar etiqueta")).toThrow(
      ShippingUnavailable
    );
  });

  it("PERMITE em produção com modo produção — o caso legítimo", () => {
    ambiente({ SUPERFRETE_SANDBOX: "0", VERCEL_ENV: "production" });
    expect(() => exigirAmbienteParaGastar("pagar etiqueta")).not.toThrow();
  });

  it("PERMITE em sandbox a partir de desenvolvimento — não debita nada", () => {
    ambiente({ SUPERFRETE_SANDBOX: "1", NODE_ENV: "development" });
    expect(() => exigirAmbienteParaGastar("pagar etiqueta")).not.toThrow();
  });

  it("configuração inválida bloqueia o gasto antes de qualquer chamada", () => {
    ambiente({ SUPERFRETE_SANDBOX: "talvez", VERCEL_ENV: "production" });
    expect(() => exigirAmbienteParaGastar("pagar etiqueta")).toThrow(
      ShippingUnavailable
    );
  });
});

describe("TETO_SEGURO_CENTS — conferido contra a API em 27/08/2026", () => {
  it("Loggi: R$ 3.000 (a API recusa R$ 3.500 com essa mensagem)", () => {
    expect(TETO_SEGURO_CENTS[SERVICO.LOGGI]).toBe(300_000);
  });

  it("Jadlog: R$ 1.500 (a API recusa R$ 1.600, aceita R$ 1.400)", () => {
    expect(TETO_SEGURO_CENTS[SERVICO.JADLOG]).toBe(150_000);
  });

  it("J&T: R$ 1.000 — corrigido; a API diz 'limite máximo de R$ 1000,00'", () => {
    expect(TETO_SEGURO_CENTS[SERVICO.JT]).toBe(100_000);
  });

  it("a peça de R$ 1.600 não é coberta por Jadlog nem J&T", () => {
    const peca = 160_000;
    expect(TETO_SEGURO_CENTS[SERVICO.JADLOG]!).toBeLessThan(peca);
    expect(TETO_SEGURO_CENTS[SERVICO.JT]!).toBeLessThan(peca);
    expect(TETO_SEGURO_CENTS[SERVICO.LOGGI]!).toBeGreaterThanOrEqual(peca);
    expect(TETO_SEGURO_CENTS[SERVICO.PAC]!).toBeGreaterThanOrEqual(peca);
  });
});
