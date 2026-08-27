/**
 * Qual produto a vitrine oferece — e se existe algum que possa ser vendido.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (P0-1, 27/08/2026)
 * ===========================================================================
 * A home fixava `/produtos/micropele-008` em três lugares. Como o produto
 * nasce `status='draft'` até alguém definir o preço, os três botões
 * principais do site levavam a um 404 — inclusive o "Comprar agora".
 *
 * Fixar o slug tem dois defeitos independentes:
 *   1. não sabe se o produto está publicado (o 404 de hoje);
 *   2. não sabe se o slug ainda é aquele (o 404 de amanhã, no dia em que
 *      alguém renomear o produto pelo painel — que é uma edição legítima).
 *
 * Por isso a decisão passa a sair do BANCO. A home pergunta "existe produto
 * vendável?" e monta o destino a partir da resposta. Publicar um produto
 * conserta a home sozinho; despublicar não deixa link morto para trás.
 *
 * Função pura de propósito, sem banco: a regra de "o que conta como
 * vendável" é a que decide se alguém consegue comprar, e precisa ser
 * testável sem subir Postgres (ver tests/unit/vitrine.test.ts). Mesmo
 * princípio de src/lib/pricing/discount.ts e src/lib/shipping/regras.ts.
 */

export interface VarianteVitrine {
  isActive: boolean;
  /** product_variants.price_cents — em centavos, como no banco inteiro. */
  priceCents: number;
  stockQty: number;
}

export interface ProdutoVitrine {
  slug: string;
  name: string;
  isFeatured: boolean;
  sortOrder: number;
  variants: VarianteVitrine[];
}

/**
 * Um produto só é vendável se alguém puder, de fato, pagar por ele.
 *
 * O critério de preço é `> 0`, não `!= null`. A distinção não é acadêmica:
 * `product_variants.price_cents` é NOT NULL no banco, então uma variante sem
 * preço definido não fica nula — fica ZERO. E zero é um número perfeitamente
 * válido para o resto do sistema: o carrinho somaria 0, o pedido nasceria com
 * total 0 e o gateway cobraria nada, sem nenhuma linha de código reclamando.
 *
 * Foi exatamente o estado encontrado na auditoria de 26/08/2026: a variante
 * da Micropele estava com `price_cents: 0`. A única coisa que impedia a loja
 * de dar a peça de graça era `is_active: false` — ou seja, um clique de
 * distância. Esta função fecha essa porta pelo lado de fora.
 */
export function produtoEstaVendavel(produto: ProdutoVitrine): boolean {
  return produto.variants.some(
    (v) => v.isActive && v.priceCents > 0 && v.stockQty > 0
  );
}

/**
 * Escolhe o produto que a home oferece, entre os que podem ser vendidos.
 *
 * Ordem: destacado primeiro (`is_featured`, que é a alavanca que o painel
 * já dá para a dona), depois `sort_order`, depois nome — para o desempate
 * ser estável e não mudar a cada carregamento da página.
 *
 * Devolve null quando NÃO há nada vendável. Quem chama precisa tratar esse
 * caso mostrando outro caminho, nunca um link para produto inexistente: um
 * botão "Comprar agora" que leva a 404 é pior que não ter botão.
 */
export function escolherProdutoVitrine(
  produtos: ProdutoVitrine[]
): ProdutoVitrine | null {
  const vendaveis = produtos.filter(produtoEstaVendavel);
  if (vendaveis.length === 0) return null;

  const ordenados = [...vendaveis].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return ordenados[0] ?? null;
}

/**
 * Para onde o CTA principal da home aponta.
 *
 * Sem produto vendável, o destino é a página institucional das próteses —
 * que existe, responde 200 e explica o produto. Não é "esconder o erro":
 * é mandar a pessoa para o lugar verdadeiro quando o outro não existe.
 */
export const DESTINO_SEM_PRODUTO = "/sobre-as-proteses";

export function linkDoProdutoVitrine(produto: ProdutoVitrine | null): string {
  return produto ? `/produtos/${produto.slug}` : DESTINO_SEM_PRODUTO;
}
