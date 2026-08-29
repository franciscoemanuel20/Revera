import { describe, expect, it } from "vitest";
import {
  dividirEmRemessas,
  melhorCombinacao,
  TETO_SEGURO_MAIS_ALTO_CENTS,
} from "@/lib/shipping/regras";
import type { ShippingQuote } from "@/lib/shipping/provider";

/**
 * Regressão do frete que sumia no pedido grande (medido em produção,
 * 29/08/2026): 4 peças cotavam Loggi a R$ 45,43 e 5 peças não cotavam nada,
 * porque R$ 3.100 declarados passam do teto de seguro de R$ 3.000.
 */

function cotacao(over: Partial<ShippingQuote> = {}): ShippingQuote {
  return {
    serviceId: 1,
    serviceName: "PAC",
    carrier: "Correios",
    priceCents: 2000,
    etaDays: 5,
    coversInsurance: true,
    ...over,
  };
}

describe("dividirEmRemessas", () => {
  it("não divide quando o valor cabe no seguro", () => {
    const r = dividirEmRemessas(4, 260_000);
    expect(r).toEqual([{ quantidade: 4, valorDeclaradoCents: 260_000 }]);
  });

  it("divide o pedido de 5 peças que não cotava — o caso real", () => {
    const r = dividirEmRemessas(5, 325_000);
    expect(r.length).toBeGreaterThan(1);
    for (const remessa of r) {
      expect(remessa.valorDeclaradoCents).toBeLessThanOrEqual(TETO_SEGURO_MAIS_ALTO_CENTS);
    }
  });

  it("nunca perde peça nem centavo na divisão", () => {
    for (const [q, valor] of [[5, 325_000], [10, 650_000], [7, 455_000], [23, 1_495_000]] as const) {
      const r = dividirEmRemessas(q, valor);
      expect(r.reduce((s, x) => s + x.quantidade, 0)).toBe(q);
      expect(r.reduce((s, x) => s + x.valorDeclaradoCents, 0)).toBe(valor);
    }
  });

  it("toda remessa cabe no teto quando a peça sozinha cabe", () => {
    const r = dividirEmRemessas(10, 650_000);
    for (const remessa of r) {
      expect(remessa.valorDeclaradoCents).toBeLessThanOrEqual(TETO_SEGURO_MAIS_ALTO_CENTS);
    }
  });

  it("não finge que resolve quando UMA peça já estoura o teto", () => {
    // Nada de dividir 1 peça de R$ 4.000 em duas meias-peças.
    const r = dividirEmRemessas(1, 400_000);
    expect(r).toEqual([{ quantidade: 1, valorDeclaradoCents: 400_000 }]);
  });
});

describe("melhorCombinacao", () => {
  it("soma o preço do MESMO serviço em todas as caixas", () => {
    const escolhida = melhorCombinacao([
      [cotacao({ serviceId: 1, priceCents: 2000 }), cotacao({ serviceId: 4, priceCents: 1800 })],
      [cotacao({ serviceId: 1, priceCents: 2000 }), cotacao({ serviceId: 4, priceCents: 1900 })],
    ]);
    expect(escolhida?.serviceId).toBe(4);
    expect(escolhida?.priceCents).toBe(3700);
  });

  it("usa o MAIOR prazo — o pedido só chega quando a última caixa chega", () => {
    const escolhida = melhorCombinacao([
      [cotacao({ etaDays: 3 })],
      [cotacao({ etaDays: 8 })],
    ]);
    expect(escolhida?.etaDays).toBe(8);
  });

  it("descarta serviço que não existe em todas as caixas", () => {
    const escolhida = melhorCombinacao([
      [cotacao({ serviceId: 4, priceCents: 1000 }), cotacao({ serviceId: 1, priceCents: 5000 })],
      [cotacao({ serviceId: 1, priceCents: 5000 })],
    ]);
    expect(escolhida?.serviceId).toBe(1);
  });

  it("descarta serviço que não cobre o seguro em alguma caixa", () => {
    const escolhida = melhorCombinacao([
      [cotacao({ serviceId: 4, coversInsurance: true })],
      [cotacao({ serviceId: 4, coversInsurance: false })],
    ]);
    expect(escolhida).toBeNull();
  });

  it("descarta serviço com erro em alguma caixa", () => {
    const escolhida = melhorCombinacao([
      [cotacao({ serviceId: 4 })],
      [cotacao({ serviceId: 4, error: "sem atendimento" })],
    ]);
    expect(escolhida).toBeNull();
  });

  it("devolve null quando alguma caixa não cotou nada", () => {
    expect(melhorCombinacao([[cotacao()], []])).toBeNull();
    expect(melhorCombinacao([])).toBeNull();
  });
});
