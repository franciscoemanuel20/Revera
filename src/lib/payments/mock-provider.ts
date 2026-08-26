import type {
  ConfirmedPayment,
  PaymentCharge,
  PaymentProvider,
  PaymentResult,
  WebhookHint,
} from "./provider";

/**
 * Provider MOCK — nunca cobra ninguém, nunca fala com rede nenhuma.
 * Padrão enquanto o gateway real não está configurado (PAYMENT_PROVIDER=mock).
 *
 * Serve para exercitar o fluxo inteiro (checkout -> pagamento -> webhook ->
 * pedido pago -> Purchase) sem dinheiro envolvido, inclusive em teste
 * automatizado. Determinístico de propósito: mesmo pedido, mesmo id.
 *
 * Segue o MESMO contrato do provider real, incluindo a reconfirmação por
 * `confirmPayment` — assim o caminho exercitado em desenvolvimento é o
 * mesmo de produção, e não um atalho que esconde bug.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createCharge(charge: PaymentCharge): Promise<PaymentResult> {
    return {
      providerPaymentId: `mock_${charge.orderId}`,
      // Página local que simula a tela do gateway (o "pague aqui").
      checkoutUrl: `/checkout/simulado?pedido=${encodeURIComponent(charge.orderId)}`,
    };
  }

  parseWebhookHint(rawBody: string): WebhookHint | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const p = parsed as { order_nsu?: unknown; transaction_nsu?: unknown };
    if (typeof p.order_nsu !== "string" || p.order_nsu.length === 0) return null;

    const transactionId =
      typeof p.transaction_nsu === "string"
        ? p.transaction_nsu
        : `mock_tx_${p.order_nsu}`;

    return {
      orderId: p.order_nsu,
      transactionId,
      invoiceSlug: null,
      eventId: transactionId,
    };
  }

  async confirmPayment(hint: WebhookHint): Promise<ConfirmedPayment> {
    // O mock "confirma" sempre. O valor volta null de propósito: quem chama
    // trata null como "gateway não informou valor" e usa o total do pedido,
    // então o caminho de conferência de valor também é exercitado.
    return {
      paid: true,
      paidAmountCents: null,
      method: "mock",
      installments: 1,
      raw: { mock: true, orderId: hint.orderId },
    };
  }
}
