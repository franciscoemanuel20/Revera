import { describe, expect, it } from "vitest";
import { applyQuantityDiscount, type QuantityDiscountRule } from "@/lib/pricing/discount";

// Teste de exemplo da fundação — prova que a estrutura de teste (vitest)
// está de pé e que a regra de negócio mais simples do catálogo (desconto
// por quantidade) se comporta como o schema promete. Fases seguintes
// adicionam o resto (carrinho, checkout, webhooks) em tests/integration
// e tests/e2e.
describe("applyQuantityDiscount", () => {
  const semDesconto: QuantityDiscountRule[] = [];

  it("sem regra aplicável, cobra o preço base", () => {
    const resultado = applyQuantityDiscount(10000, 1, semDesconto);

    expect(resultado.unitPriceCents).toBe(10000);
    expect(resultado.subtotalCents).toBe(10000);
    expect(resultado.discountCents).toBe(0);
    expect(resultado.appliedRule).toBeNull();
  });

  it("aplica desconto percentual quando a quantidade bate a regra", () => {
    const regras: QuantityDiscountRule[] = [
      { minQty: 2, discountPercent: 10, isActive: true },
    ];

    const resultado = applyQuantityDiscount(10000, 2, regras);

    // 10000 * 0.9 = 9000 por unidade, 18000 no total, 2000 de desconto.
    expect(resultado.unitPriceCents).toBe(9000);
    expect(resultado.subtotalCents).toBe(18000);
    expect(resultado.discountCents).toBe(2000);
  });

  it("aplica preço unitário fixo quando a regra define um", () => {
    const regras: QuantityDiscountRule[] = [
      { minQty: 3, unitPriceCents: 8000, isActive: true },
    ];

    const resultado = applyQuantityDiscount(10000, 3, regras);

    expect(resultado.unitPriceCents).toBe(8000);
    expect(resultado.subtotalCents).toBe(24000);
  });

  it("escolhe a regra de maior min_qty entre as elegíveis", () => {
    const regras: QuantityDiscountRule[] = [
      { minQty: 2, discountPercent: 5, isActive: true },
      { minQty: 5, discountPercent: 20, isActive: true },
    ];

    const resultado = applyQuantityDiscount(10000, 5, regras);

    expect(resultado.appliedRule?.minQty).toBe(5);
    expect(resultado.unitPriceCents).toBe(8000);
  });

  it("ignora regra inativa", () => {
    const regras: QuantityDiscountRule[] = [
      { minQty: 2, discountPercent: 50, isActive: false },
    ];

    const resultado = applyQuantityDiscount(10000, 2, regras);

    expect(resultado.appliedRule).toBeNull();
    expect(resultado.unitPriceCents).toBe(10000);
  });

  it("rejeita quantidade zero ou negativa", () => {
    expect(() => applyQuantityDiscount(10000, 0, semDesconto)).toThrow();
  });
});
