import { PayPalProvider } from "@/lib/payments/paypal-provider";
import { normalizarAwbDhl } from "@/lib/shipping/awb-dhl";

export type PagamentoRastreavel = {
  provider: string;
  status: string;
  provider_payment_id: string | null;
};

export type ResultadoRastreioPaypal =
  | "enviado"
  | "sem_paypal"
  | { falhou: string };

export function guiaDhlFinal(remessa: {
  provider?: string | null;
  status?: string | null;
  tracking_code?: string | null;
}): string | null {
  if (remessa.provider !== "dhl" ||
      !["label_created", "registrado_manual"].includes(remessa.status ?? "") ||
      !remessa.tracking_code) return null;
  return normalizarAwbDhl(remessa.tracking_code);
}

export function deveRepararStatusAposGuia(status: string | null | undefined): boolean {
  return ["label_processing", "awaiting_label", "shipping_error"].includes(status ?? "");
}

/**
 * Envia (ou reenvia) a mesma guia ao PayPal. O provider usa a chave
 * pedido+guia como idempotency key, portanto esta função é segura para a
 * recuperação de uma falha transitória depois que a DHL já criou a remessa.
 */
export async function enviarRastreioDhlAoPaypal(
  pagamentos: PagamentoRastreavel[],
  orderId: string,
  awb: string
): Promise<ResultadoRastreioPaypal> {
  const paypal = pagamentos.find(
    (p) => p.provider === "paypal" && p.status === "approved" && p.provider_payment_id
  );
  if (!paypal?.provider_payment_id) return "sem_paypal";

  try {
    const resposta = await new PayPalProvider().adicionarRastreio(
      paypal.provider_payment_id,
      orderId,
      awb
    );
    return resposta.ok ? "enviado" : { falhou: resposta.motivo };
  } catch (erro) {
    console.error("[envio-dhl] rastreio PayPal falhou", erro);
    return { falhou: "Não foi possível falar com o PayPal agora." };
  }
}
