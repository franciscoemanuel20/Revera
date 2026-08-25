import type { PaymentCharge, PaymentProvider, PaymentResult } from "./provider";

/**
 * Provider MOCK — nunca cobra ninguém de verdade, nunca fala com rede
 * nenhuma. Usado quando PAYMENT_PROVIDER=mock (padrão enquanto o
 * InfinitePay não for decidido, ver .env.example).
 *
 * Determinístico de propósito: o id do pagamento é derivado do orderId
 * (mesmo pedido -> mesmo id sempre), e o status final é sempre "approved"
 * depois de "processado". Isso permite escrever teste sem mock de rede e
 * sem estado global escondido.
 */
export class MockPaymentProvider implements PaymentProvider {
  async createCharge(charge: PaymentCharge): Promise<PaymentResult> {
    const providerPaymentId = `mock_${charge.orderId}`;

    return {
      providerPaymentId,
      checkoutUrl: `/checkout/mock?orderId=${encodeURIComponent(charge.orderId)}`,
      // MOCK aprova sempre — não existe recusa/estorno de verdade aqui.
      // Fluxo de erro real fica para quando o provider de verdade existir.
      status: "approved",
    };
  }

  verifyWebhookSignature(_rawBody: string, _signatureHeader: string): boolean {
    // Não há segredo nenhum para validar em modo mock — sempre "válido".
    return true;
  }

  parseWebhookEvent(rawBody: string): {
    providerEventId: string;
    providerPaymentId: string;
    status: PaymentResult["status"];
  } {
    // Formato do corpo é o que o MOCK escolhe emitir (não segue formato do
    // InfinitePay — quando o adapter real existir, ele parseia o formato
    // deles, não este).
    const parsed = JSON.parse(rawBody) as {
      orderId: string;
      eventId?: string;
    };

    return {
      providerEventId: parsed.eventId ?? `mock_evt_${parsed.orderId}`,
      providerPaymentId: `mock_${parsed.orderId}`,
      status: "approved",
    };
  }
}
