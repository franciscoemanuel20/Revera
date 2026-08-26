"use server";

// Server Actions do carrinho — só a casca fina em volta de store.ts (que
// concentra toda a regra e a decisão de RLS, ver comentário lá). Cada ação
// devolve o CartView inteiro já atualizado, para o CartProvider (client)
// nunca precisar de uma segunda chamada "agora busca de novo" depois de
// mutar — um único round-trip por interação do usuário.
import {
  adicionarItemAoCarrinho,
  alterarQuantidadeDoItem,
  lerCarrinhoCompleto,
  removerItemDoCarrinho,
} from "./store";
import type { CartView } from "./types";

export async function obterCarrinhoAction(): Promise<CartView> {
  return lerCarrinhoCompleto();
}

export async function adicionarAoCarrinhoAction(
  variantId: string,
  quantity: number
): Promise<{ erro: string | null; carrinho: CartView }> {
  const { erro } = await adicionarItemAoCarrinho(variantId, quantity);
  const carrinho = await lerCarrinhoCompleto();
  return { erro, carrinho };
}

export async function alterarQuantidadeAction(
  cartItemId: string,
  quantity: number
): Promise<{ erro: string | null; carrinho: CartView }> {
  const { erro } = await alterarQuantidadeDoItem(cartItemId, quantity);
  const carrinho = await lerCarrinhoCompleto();
  return { erro, carrinho };
}

export async function removerDoCarrinhoAction(
  cartItemId: string
): Promise<{ erro: string | null; carrinho: CartView }> {
  const { erro } = await removerItemDoCarrinho(cartItemId);
  const carrinho = await lerCarrinhoCompleto();
  return { erro, carrinho };
}
