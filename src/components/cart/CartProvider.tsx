"use client";

import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CartDrawer, type CartDrawerItem } from "@/components/ui/CartDrawer";
import {
  adicionarAoCarrinhoAction,
  alterarQuantidadeAction,
  obterCarrinhoAction,
  removerDoCarrinhoAction,
} from "@/lib/cart/actions";
import { CARRINHO_VAZIO, type CartView } from "@/lib/cart/types";

interface CartContextValue {
  cart: CartView;
  carregando: boolean;
  pendente: boolean;
  drawerAberto: boolean;
  abrirDrawer: () => void;
  fecharDrawer: () => void;
  adicionarItem: (variantId: string, quantity: number) => Promise<{ erro: string | null }>;
  alterarQuantidade: (cartItemId: string, quantity: number) => Promise<{ erro: string | null }>;
  removerItem: (cartItemId: string) => Promise<{ erro: string | null }>;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Carrinho é estado do app inteiro — o contador no Header, o drawer, a
 * página /carrinho e o botão "comprar agora" da página de produto
 * (ProdutoInterativo) precisam do MESMO dado ao mesmo tempo (adicionar um
 * item na página de produto tem que atualizar o contador do Header sem
 * recarregar a página). Por isso este Provider fica no layout raiz
 * (src/app/layout.tsx), acima de tudo.
 *
 * A fonte de verdade continua sendo o banco (cart_items, via cookie de
 * token — ver src/lib/cart/store.ts): este estado é só a última leitura,
 * para não buscar de novo a cada render. Toda mutação (adicionar, alterar
 * quantidade, remover) chama a Server Action correspondente, que já
 * devolve o carrinho inteiro recalculado — o preço nunca é ajustado aqui no
 * cliente, só espelhado.
 *
 * O drawer (CartDrawer) é renderizado AQUI, uma vez só, para qualquer
 * página poder abri-lo chamando abrirDrawer() — em vez de cada página
 * precisar montar o próprio <CartDrawer>.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartView>(CARRINHO_VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [pendente, iniciarTransicao] = useTransition();
  const [drawerAberto, setDrawerAberto] = useState(false);
  // Última mensagem de erro de uma mutação (ex.: "só há 2 em estoque") —
  // exibida no drawer. Não é estado "por item": só precisa mostrar a
  // última coisa que deu errado, e some ao fechar ou ao tentar de novo.
  const [erroRecente, setErroRecente] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    obterCarrinhoAction()
      .then((resultado) => {
        if (!cancelado) setCart(resultado);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  function adicionarItem(variantId: string, quantity: number) {
    return new Promise<{ erro: string | null }>((resolve) => {
      iniciarTransicao(async () => {
        const resultado = await adicionarAoCarrinhoAction(variantId, quantity);
        setCart(resultado.carrinho);
        setErroRecente(resultado.erro);
        resolve({ erro: resultado.erro });
      });
    });
  }

  function alterarQuantidade(cartItemId: string, quantity: number) {
    return new Promise<{ erro: string | null }>((resolve) => {
      iniciarTransicao(async () => {
        const resultado = await alterarQuantidadeAction(cartItemId, quantity);
        setCart(resultado.carrinho);
        setErroRecente(resultado.erro);
        resolve({ erro: resultado.erro });
      });
    });
  }

  function removerItem(cartItemId: string) {
    return new Promise<{ erro: string | null }>((resolve) => {
      iniciarTransicao(async () => {
        const resultado = await removerDoCarrinhoAction(cartItemId);
        setCart(resultado.carrinho);
        setErroRecente(resultado.erro);
        resolve({ erro: resultado.erro });
      });
    });
  }

  const itensDoDrawer: CartDrawerItem[] = cart.items.map((item) => ({
    id: item.cartItemId,
    name: item.productName,
    variantLabel: item.variantLabel,
    imageUrl: item.colorPhotoUrl,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  }));

  return (
    <CartContext.Provider
      value={{
        cart,
        carregando,
        pendente,
        drawerAberto,
        abrirDrawer: () => setDrawerAberto(true),
        fecharDrawer: () => setDrawerAberto(false),
        adicionarItem,
        alterarQuantidade,
        removerItem,
      }}
    >
      {children}
      <CartDrawer
        open={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        items={itensDoDrawer}
        subtotalCents={cart.subtotalCents}
        erro={erroRecente}
        onDismissErro={() => setErroRecente(null)}
        onQuantityChange={(itemId, quantidade) => {
          void alterarQuantidade(itemId, quantidade);
        }}
        onRemove={(itemId) => {
          void removerItem(itemId);
        }}
        onCheckout={() => {
          setDrawerAberto(false);
          router.push("/carrinho");
        }}
      />
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const contexto = useContext(CartContext);
  if (!contexto) {
    throw new Error("useCart precisa ser chamado dentro de <CartProvider> (ver src/app/layout.tsx).");
  }
  return contexto;
}
