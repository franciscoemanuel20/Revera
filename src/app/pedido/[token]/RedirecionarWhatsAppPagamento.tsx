"use client";

import { useEffect } from "react";
import {
  linkWhatsAppPagamentoConfirmado,
  type IdiomaDaMensagemWhatsApp,
} from "@/lib/config/whatsapp";

/**
 * O gateway volta para /pedido/[token]?retorno=pagamento. Esta tela só é
 * montada pelo servidor depois de confirmar que o pedido está realmente pago.
 * A marca no sessionStorage evita abrir o WhatsApp de novo ao usar Voltar.
 */
export function RedirecionarWhatsAppPagamento({
  token,
  idioma,
}: {
  token: string;
  idioma: IdiomaDaMensagemWhatsApp;
}) {
  useEffect(() => {
    const chave = `revera:whatsapp-pos-pagamento:${token}`;
    if (window.sessionStorage.getItem(chave)) return;

    window.sessionStorage.setItem(chave, "1");
    window.location.assign(linkWhatsAppPagamentoConfirmado(idioma));
  }, [idioma, token]);

  return null;
}
