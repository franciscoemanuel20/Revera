import "server-only";
import type { PaymentProvider } from "./provider";
import { MockPaymentProvider } from "./mock-provider";

// Factory único — rota de checkout chama getPaymentProvider(), nunca
// importa MockPaymentProvider nem um adapter real diretamente. Decide pela
// env PAYMENT_PROVIDER (ver .env.example).
//
// 'infinitepay' lança de propósito: não existe adapter real neste scaffold
// (é linha que não se cruza fora da conversa principal com o Francisco —
// pagamento é regra crítica do projeto). Quando o gateway for decidido e o
// adapter implementado, troca-se este branch, nunca o contrato em provider.ts.
export function getPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockPaymentProvider();
    case "infinitepay":
      throw new Error(
        "PAYMENT_PROVIDER=infinitepay, mas o adapter real ainda não foi " +
          "implementado — aguardando decisão do Francisco."
      );
    default:
      throw new Error(`PAYMENT_PROVIDER desconhecido: "${provider}"`);
  }
}
