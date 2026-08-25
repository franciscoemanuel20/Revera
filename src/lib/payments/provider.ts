/**
 * Contrato de pagamento — a rota de checkout depende só desta interface,
 * nunca de um provider específico. Isso existe porque o gateway real
 * (InfinitePay) ainda não foi decidido/homologado; trocar de provider no
 * futuro não pode exigir tocar em rota nem em UI, só em src/lib/payments/*.
 *
 * IMPORTANTE (regra do projeto, não deste arquivo): implementação real de
 * pagamento é linha que não se cruza fora da conversa principal com o
 * Francisco. Este scaffold só define o contrato e a implementação MOCK —
 * ver mock-provider.ts e index.ts.
 */

export interface PaymentCharge {
  orderId: string;
  amountCents: number;
  customerEmail?: string;
}

export interface PaymentResult {
  providerPaymentId: string;
  checkoutUrl?: string;
  status: "pending" | "approved" | "failed";
}

export interface PaymentProvider {
  createCharge(charge: PaymentCharge): Promise<PaymentResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  parseWebhookEvent(rawBody: string): {
    providerEventId: string;
    providerPaymentId: string;
    status: PaymentResult["status"];
  };
}
