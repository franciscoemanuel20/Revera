"use client";

import { useEffect, useRef } from "react";
import type { PurchasePayload } from "@/lib/tracking/purchase";

/**
 * Dispara o evento Purchase no navegador — uma única vez.
 *
 * Este componente SÓ é renderizado quando o servidor já decidiu que este
 * pedido tem direito ao evento (pagamento confirmado com o gateway e
 * `sent_web` ainda falso — ver src/lib/tracking/purchase.ts). Ele não toma
 * decisão nenhuma: se está na tela, é porque pode disparar.
 *
 * O `event_id` é o id do pedido. Quando a Conversions API entrar, o disparo
 * server-side usará o MESMO event_id, e a Meta deduplica: uma compra, um
 * Purchase — mesmo saindo pelos dois caminhos.
 *
 * O ref existe porque, em desenvolvimento, o React roda o efeito duas vezes
 * (StrictMode). Sem ele o pixel receberia o evento duplicado localmente.
 */
export function PurchaseTracker({ payload }: { payload: PurchasePayload }) {
  const jaDisparou = useRef(false);

  useEffect(() => {
    if (jaDisparou.current) return;
    jaDisparou.current = true;

    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    if (typeof fbq !== "function") {
      // Pixel ainda não instalado (META_PIXEL_ID não configurado). Não é
      // erro: o registro no banco continua marcado como enviado, e a
      // Conversions API poderá reenviar pelo mesmo event_id quando existir.
      return;
    }

    fbq(
      "track",
      "Purchase",
      {
        value: payload.valueCents / 100,
        currency: payload.currency,
        content_type: "product",
        content_ids: payload.contentIds,
        contents: payload.contents,
        num_items: payload.numItems,
        order_id: payload.orderNumber,
      },
      { eventID: payload.eventId }
    );
  }, [payload]);

  return null;
}
