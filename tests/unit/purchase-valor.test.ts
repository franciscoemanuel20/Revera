import { describe, expect, it } from "vitest";
import { valorDasPecas } from "@/lib/tracking/despachar";

/**
 * Decisão do Francisco em 29/08/2026: o Purchase da Meta reporta só o valor
 * das próteses, sem frete. Frete é dinheiro da transportadora — contá-lo
 * infla o ROAS com receita que ninguém embolsa.
 */
describe("valor do Purchase na Meta", () => {
  it("tira o frete do total", () => {
    // O caso real medido em produção: 5 peças a R$ 620 + R$ 64,46 de frete.
    expect(valorDasPecas({ total_cents: 316446, shipping_cents: 6446 })).toBe(310000);
  });

  it("uma peça: R$ 650 + R$ 20,13 de frete vira R$ 650", () => {
    expect(valorDasPecas({ total_cents: 67013, shipping_cents: 2013 })).toBe(65000);
  });

  it("pedido sem frete cotado reporta o total inteiro", () => {
    expect(valorDasPecas({ total_cents: 65000, shipping_cents: 0 })).toBe(65000);
  });

  it("frete nulo não vira NaN", () => {
    expect(valorDasPecas({ total_cents: 65000, shipping_cents: null })).toBe(65000);
    expect(valorDasPecas({ total_cents: 65000 })).toBe(65000);
  });

  it("nunca devolve valor negativo — a Meta recusa o evento", () => {
    expect(valorDasPecas({ total_cents: 1000, shipping_cents: 5000 })).toBe(0);
  });

  it("o desconto por quantidade continua refletido", () => {
    // 5 peças a R$ 620 (e não a R$ 650): o desconto já está dentro do total.
    expect(valorDasPecas({ total_cents: 310000, shipping_cents: 0 })).toBe(310000);
  });
});
