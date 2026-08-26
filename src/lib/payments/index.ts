import "server-only";
import type { PaymentProvider } from "./provider";
import { MockPaymentProvider } from "./mock-provider";
import { InfinitePayProvider } from "./infinitepay-provider";

/**
 * Factory único — checkout e webhook chamam getPaymentProvider(), nunca
 * importam um adapter direto. Decide pela env PAYMENT_PROVIDER.
 *
 * O padrão é 'mock' de propósito: um deploy sem a variável configurada NÃO
 * pode cair silenciosamente em cobrança real, e também não pode quebrar a
 * loja — cai no simulador, que é visível e inofensivo.
 */
export function getPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockPaymentProvider();
    case "infinitepay":
      return new InfinitePayProvider();
    default:
      throw new Error(`PAYMENT_PROVIDER desconhecido: "${provider}"`);
  }
}

export type { PaymentProvider } from "./provider";
