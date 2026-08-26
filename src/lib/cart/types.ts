// Tipos do carrinho — compartilhados entre a leitura/gravação no servidor
// (src/lib/cart/store.ts, src/lib/cart/actions.ts) e a UI (CartProvider,
// /carrinho, CartDrawer). Nomeados em português para bater com o resto do
// domínio deste projeto; os campos individuais usam os MESMOS nomes que o
// schema usaria depois de convertido de snake_case, para não exigir mapa
// mental extra de quem já leu supabase/migrations/00000000000001_init.sql.

import type { QuantityDiscountRule } from "@/lib/pricing/discount";

// Mesma regra + o label textual cadastrado no admin (ver
// ProdutoInterativo.tsx) — o label não entra no cálculo, só na exibição.
export interface CartDiscountRuleView extends QuantityDiscountRule {
  label: string | null;
}

export interface CartItemView {
  // cart_items.id — usado para editar/remover ESTA linha, não a variante
  // (o carrinho tem no máximo uma linha por variante, ver constraint
  // unique(cart_id, variant_id) no schema, mas o id da linha é o que a UI
  // manipula).
  cartItemId: string;
  variantId: string;
  productName: string;
  // Combinação de cor/tamanho/nível de grisalho que identifica a variante,
  // já pronta para exibir — ver montarLabelVariante em store.ts. Nula
  // quando a variante não tem nenhum desses atributos (variante "genérica",
  // mesmo caso do produto seed único, ver seeds/products.json).
  variantLabel: string | null;
  colorPhotoUrl: string | null;
  quantity: number;
  stockQty: number;
  // Preço de tabela da variante (product_variants.price_cents), sem
  // desconto — usado para o "de/por" e para o cálculo de economia total.
  basePriceCents: number;
  compareAtPriceCents: number | null;
  // Preço já com o desconto por quantidade aplicado (applyQuantityDiscount)
  // — o que o cliente paga por unidade nesta linha.
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  // Regras vigentes do PRODUTO desta linha — para a UI mostrar os degraus
  // (DiscountLadder) sem precisar de uma consulta própria por item.
  discountRules: CartDiscountRuleView[];
}

export interface CartView {
  // null quando o visitante ainda não tem carrinho nenhum (nunca adicionou
  // um item) — distinto de "carrinho existe e está vazio", que não
  // acontece na prática (remover o último item não apaga o carrinho, só
  // fica com items: []).
  cartId: string | null;
  items: CartItemView[];
  // Soma de basePriceCents * quantity — o "de" da conta, sem desconto.
  subtotalSemDescontoCents: number;
  // Soma de subtotalCents (já com desconto por item).
  subtotalCents: number;
  discountCents: number;
  // subtotalCents, sem frete: frete é calculado numa etapa seguinte (fora
  // do escopo desta entrega, ver src/lib/shipping) — nunca inventado aqui.
  totalCents: number;
}

export const CARRINHO_VAZIO: CartView = {
  cartId: null,
  items: [],
  subtotalSemDescontoCents: 0,
  subtotalCents: 0,
  discountCents: 0,
  totalCents: 0,
};

export interface ResultadoCarrinho {
  erro: string | null;
}
