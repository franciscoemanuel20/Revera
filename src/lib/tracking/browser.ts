/**
 * Os eventos que o NAVEGADOR pode disparar.
 *
 * ===========================================================================
 * O QUE NÃO ESTÁ AQUI, E POR QUÊ
 * ===========================================================================
 * Purchase. Ele não é disparado por decisão do navegador em lugar nenhum
 * deste projeto — quem manda é o servidor, depois de reconfirmar o pagamento
 * com o gateway. A página do pedido chega a disparar um Purchase de
 * navegador, mas só quando o SERVIDOR entrega o payload (ver
 * src/lib/tracking/purchase.ts): a página pergunta, nunca decide.
 *
 * O motivo é caro: quem paga por Pix sai do site e frequentemente não volta.
 * Purchase decidido no navegador perderia essas vendas — e contaria vendas
 * fantasma de quem só deu refresh na tela de obrigado.
 */

import {
  GOOGLE_TAG_ID,
  META_PIXEL_ID,
  MOEDA,
  centavosParaMoeda,
} from "./config";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export interface ItemMedido {
  variantId: string;
  nome: string;
  quantidade: number;
  precoUnitarioCents: number;
}

/**
 * O visitante viu um produto. Meta chama de ViewContent; GA4, de view_item.
 */
export function medirVerProduto(item: ItemMedido) {
  if (META_PIXEL_ID) {
    window.fbq?.("track", "ViewContent", {
      content_ids: [item.variantId],
      content_type: "product",
      content_name: item.nome,
      value: centavosParaMoeda(item.precoUnitarioCents),
      currency: MOEDA,
    });
  }
  if (GOOGLE_TAG_ID) {
    window.gtag?.("event", "view_item", {
      currency: MOEDA,
      value: centavosParaMoeda(item.precoUnitarioCents),
      items: [
        {
          item_id: item.variantId,
          item_name: item.nome,
          price: centavosParaMoeda(item.precoUnitarioCents),
          quantity: item.quantidade,
        },
      ],
    });
  }
}

/** Colocou na sacola. */
export function medirAdicionarAoCarrinho(item: ItemMedido) {
  const valor = centavosParaMoeda(item.precoUnitarioCents * item.quantidade);
  if (META_PIXEL_ID) {
    window.fbq?.("track", "AddToCart", {
      content_ids: [item.variantId],
      content_type: "product",
      content_name: item.nome,
      value: valor,
      currency: MOEDA,
    });
  }
  if (GOOGLE_TAG_ID) {
    window.gtag?.("event", "add_to_cart", {
      currency: MOEDA,
      value: valor,
      items: [
        {
          item_id: item.variantId,
          item_name: item.nome,
          price: centavosParaMoeda(item.precoUnitarioCents),
          quantity: item.quantidade,
        },
      ],
    });
  }
}

/**
 * Começou o checkout. Meta: InitiateCheckout. GA4: begin_checkout.
 *
 * Dispara ao ABRIR a tela de checkout, uma única vez por sessão de checkout —
 * a trava fica em quem chama (ver src/app/checkout/CheckoutForm.tsx), com
 * useRef, porque o React reexecuta efeitos em desenvolvimento e uma troca de
 * rota de volta ao checkout contaria de novo.
 *
 * NÃO é sinal de compra. É o topo do funil de checkout, e serve para medir
 * quantos começam contra quantos terminam.
 */
export function medirIniciarCheckout(input: {
  itens: ItemMedido[];
  totalCents: number;
}) {
  const valor = centavosParaMoeda(input.totalCents);
  const numItens = input.itens.reduce((s, i) => s + i.quantidade, 0);

  if (META_PIXEL_ID) {
    window.fbq?.("track", "InitiateCheckout", {
      content_ids: input.itens.map((i) => i.variantId),
      content_type: "product",
      contents: input.itens.map((i) => ({
        id: i.variantId,
        quantity: i.quantidade,
        item_price: centavosParaMoeda(i.precoUnitarioCents),
      })),
      num_items: numItens,
      value: valor,
      currency: MOEDA,
    });
  }
  if (GOOGLE_TAG_ID) {
    window.gtag?.("event", "begin_checkout", {
      currency: MOEDA,
      value: valor,
      items: input.itens.map((i) => ({
        item_id: i.variantId,
        item_name: i.nome,
        price: centavosParaMoeda(i.precoUnitarioCents),
        quantity: i.quantidade,
      })),
    });
  }
}

/**
 * Purchase no navegador — disparado SOMENTE com o payload que o servidor
 * entregou, e nunca por conta própria.
 *
 * O `eventId` é o mesmo que o envio de servidor usa. É assim que a Meta
 * deduplica: mesmo event_id vindo dos dois caminhos = uma compra só. No GA4,
 * o `transaction_id` faz o mesmo papel.
 *
 * Se este disparo se perder (a pessoa fechou a aba, um bloqueador barrou),
 * a venda continua contada — o caminho de servidor já a registrou.
 */
export function medirCompra(payload: {
  eventId: string;
  valueCents: number;
  orderNumber: string;
  contents: Array<{ id: string; quantity: number; item_price: number }>;
  numItems: number;
}) {
  const valor = centavosParaMoeda(payload.valueCents);

  if (META_PIXEL_ID) {
    window.fbq?.(
      "track",
      "Purchase",
      {
        content_ids: payload.contents.map((c) => c.id),
        content_type: "product",
        contents: payload.contents,
        num_items: payload.numItems,
        value: valor,
        currency: MOEDA,
      },
      { eventID: payload.eventId }
    );
  }
  if (GOOGLE_TAG_ID) {
    window.gtag?.("event", "purchase", {
      transaction_id: payload.eventId,
      value: valor,
      currency: MOEDA,
      items: payload.contents.map((c) => ({
        item_id: c.id,
        price: c.item_price,
        quantity: c.quantity,
      })),
    });
  }
}
