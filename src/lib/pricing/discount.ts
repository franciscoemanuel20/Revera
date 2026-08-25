/**
 * Cálculo de desconto por quantidade — espelha a tabela
 * `quantity_discount_rules` (supabase/migrations/00000000000001_init.sql):
 * cada regra vale a partir de min_qty, e define OU um preço unitário fixo
 * (unit_price_cents) OU um percentual (discount_percent), nunca os dois.
 *
 * Função pura de propósito: nenhuma chamada a banco aqui. A rota de
 * carrinho/checkout busca as regras ativas do produto e passa para esta
 * função — assim dá para testar a regra de negócio sem subir Postgres
 * (ver tests/unit/discount.test.ts).
 *
 * ATENÇÃO: preço é regra comercial do Francisco. Esta função só aplica a
 * regra que já existe no banco; ela não decide valor nenhum sozinha.
 */

export interface QuantityDiscountRule {
  minQty: number;
  unitPriceCents?: number | null;
  discountPercent?: number | null;
  isActive: boolean;
}

export interface DiscountResult {
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  appliedRule: QuantityDiscountRule | null;
}

/**
 * Escolhe, entre as regras ativas cujo min_qty <= quantity, a de maior
 * min_qty (a mais específica para aquela quantidade) e aplica.
 * Sem regra aplicável, devolve o preço base sem desconto.
 */
export function applyQuantityDiscount(
  basePriceCents: number,
  quantity: number,
  rules: QuantityDiscountRule[]
): DiscountResult {
  if (quantity <= 0) {
    throw new Error("quantity precisa ser maior que zero");
  }

  const elegiveis = rules
    .filter((r) => r.isActive && r.minQty <= quantity)
    .sort((a, b) => b.minQty - a.minQty);

  const regra = elegiveis[0] ?? null;

  const unitPriceCents = regra ? precoUnitarioDaRegra(basePriceCents, regra) : basePriceCents;

  const subtotalCents = unitPriceCents * quantity;
  const subtotalSemDesconto = basePriceCents * quantity;

  return {
    unitPriceCents,
    subtotalCents,
    discountCents: subtotalSemDesconto - subtotalCents,
    appliedRule: regra,
  };
}

function precoUnitarioDaRegra(basePriceCents: number, regra: QuantityDiscountRule): number {
  if (regra.unitPriceCents != null) {
    return regra.unitPriceCents;
  }
  if (regra.discountPercent != null) {
    // Arredonda para baixo — nunca cobra a mais por causa de arredondamento.
    return Math.floor(basePriceCents * (1 - regra.discountPercent / 100));
  }
  // Regra malformada (nem preço fixo nem percentual) — trata como "sem
  // desconto" em vez de quebrar o checkout inteiro por causa de um dado
  // ruim no admin.
  return basePriceCents;
}
