"use client";

import { useEffect, useRef } from "react";
import { medirCompra } from "@/lib/tracking/browser";
import type { PurchasePayload } from "@/lib/tracking/purchase";

/**
 * Dispara o Purchase no navegador — uma única vez, e só quando mandado.
 *
 * Este componente NÃO decide nada. Ele só é renderizado quando o servidor já
 * verificou que o pedido está pago (reconfirmado com o gateway) e que o
 * evento ainda não saiu para o navegador — ver consumirPurchaseParaNavegador
 * em src/lib/tracking/purchase.ts. Abrir esta URL na mão, sem pagamento, não
 * renderiza nada aqui.
 *
 * ===========================================================================
 * ESTE NÃO É O CAMINHO PRINCIPAL
 * ===========================================================================
 * A venda já foi contada quando o pagamento foi confirmado, pelo servidor
 * (src/lib/tracking/despachar.ts). Este disparo existe para MELHORAR a
 * correspondência — o navegador carrega cookies e sinais que o servidor não
 * tem. Se ele se perder (aba fechada, bloqueador de anúncio, Pix pago e a
 * pessoa nunca voltou), nada é perdido.
 *
 * O `eventId` é o id do pedido, o MESMO usado no envio de servidor. É assim
 * que a Meta deduplica e que o GA4 reconhece a transação: dois caminhos, uma
 * compra só.
 *
 * O ref existe porque o React roda efeitos duas vezes em desenvolvimento
 * (StrictMode) — sem ele o evento sairia dobrado localmente.
 */
export function PurchaseTracker({ payload }: { payload: PurchasePayload }) {
  const jaDisparou = useRef(false);

  useEffect(() => {
    if (jaDisparou.current) return;
    jaDisparou.current = true;

    medirCompra({
      eventId: payload.eventId,
      valueCents: payload.valueCents,
      orderNumber: payload.orderNumber,
      contents: payload.contents,
      numItems: payload.numItems,
    });
  }, [payload]);

  return null;
}
