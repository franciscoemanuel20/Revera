import { describe, expect, it } from "vitest";
import {
  precoDaLinhaComDegrauDoProduto,
  type QuantityDiscountRule,
} from "@/lib/pricing/discount";

/**
 * Regressão de 29/08/2026.
 *
 * Quando a cor virou variante, 5 peças da Micropele passaram a poder estar
 * em duas linhas (3 na cor 3 + 2 na cor 5). O degrau "a partir de 5 peças"
 * é da regra comercial do produto, por VOLUME — não por cor. Sem isto o
 * cliente compraria as 5 peças anunciadas e pagaria R$ 3.250 em vez de
 * R$ 3.100.
 */

// As regras reais da Micropele 0,08mm (R$ 650 cheio).
const REGRAS: QuantityDiscountRule[] = [
  { minQty: 5, unitPriceCents: 62000, discountPercent: null, isActive: true },
  { minQty: 10, unitPriceCents: 60000, discountPercent: null, isActive: true },
];

const BASE = 65000;

describe("desconto por volume somando as cores", () => {
  it("3 na cor 3 + 2 na cor 5 fecham o degrau de 5 peças", () => {
    const linhaA = precoDaLinhaComDegrauDoProduto(BASE, 3, 5, REGRAS);
    const linhaB = precoDaLinhaComDegrauDoProduto(BASE, 2, 5, REGRAS);

    expect(linhaA.unitPriceCents).toBe(62000);
    expect(linhaB.unitPriceCents).toBe(62000);
    expect(linhaA.subtotalCents + linhaB.subtotalCents).toBe(310000);
    expect(linhaA.discountCents + linhaB.discountCents).toBe(15000);
  });

  it("4 peças espalhadas em 4 cores continuam sem desconto", () => {
    const linhas = [1, 1, 1, 1].map((q) => precoDaLinhaComDegrauDoProduto(BASE, q, 4, REGRAS));
    for (const linha of linhas) {
      expect(linha.unitPriceCents).toBe(BASE);
      expect(linha.discountCents).toBe(0);
    }
    expect(linhas.reduce((s, l) => s + l.subtotalCents, 0)).toBe(260000);
  });

  it("10 peças em cores diferentes pegam o segundo degrau", () => {
    const linhaA = precoDaLinhaComDegrauDoProduto(BASE, 6, 10, REGRAS);
    const linhaB = precoDaLinhaComDegrauDoProduto(BASE, 4, 10, REGRAS);
    expect(linhaA.unitPriceCents).toBe(60000);
    expect(linhaB.unitPriceCents).toBe(60000);
    expect(linhaA.subtotalCents + linhaB.subtotalCents).toBe(600000);
  });

  it("uma linha só continua igual ao comportamento antigo", () => {
    const linha = precoDaLinhaComDegrauDoProduto(BASE, 5, 5, REGRAS);
    expect(linha.unitPriceCents).toBe(62000);
    expect(linha.subtotalCents).toBe(310000);
    expect(linha.discountCents).toBe(15000);
  });

  it("nunca dá desconto que a regra não previu", () => {
    const linha = precoDaLinhaComDegrauDoProduto(BASE, 2, 2, REGRAS);
    expect(linha.unitPriceCents).toBe(BASE);
    expect(linha.discountCents).toBe(0);
  });
});
