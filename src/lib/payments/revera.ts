import "server-only";
import {
  getStripeProvider,
  PagamentoIndisponivel,
  pagamentoInternacionalDisponivel,
  providerPorNome,
  type PaymentProvider,
} from "@/lib/payments";
import { StripeProvider } from "@/lib/payments/stripe-provider";

type ProviderNacionalRevera = "asaas" | "infinitepay" | "mock";

function providerNacionalConfigurado(): string | undefined {
  return (
    process.env.REVERA_PAYMENT_PROVIDER?.trim() ||
    process.env.PAYMENT_PROVIDER?.trim() ||
    undefined
  );
}

export function getReveraNationalProvider(): PaymentProvider {
  const nome = providerNacionalConfigurado();
  if (!nome) {
    throw new PagamentoIndisponivel(
      "REVERA_PAYMENT_PROVIDER/PAYMENT_PROVIDER não está definida. " +
        "A Revera fica isolada e falha fechada: sem provedor nacional explícito, não cobra."
    );
  }

  if (!["asaas", "infinitepay", "mock"].includes(nome)) {
    throw new PagamentoIndisponivel(
      `Provider nacional da Revera inválido: "${nome}". Use 'asaas' ou 'infinitepay' em produção.`
    );
  }

  return providerPorNome(nome as ProviderNacionalRevera);
}

export function getReveraProviderForCurrency(currency: string): PaymentProvider {
  return currency === "BRL" ? getReveraNationalProvider() : getStripeProvider();
}

export function getReveraProviderByName(name: string): PaymentProvider {
  if (name === "stripe") return getStripeProvider();
  if (name === "asaas" || name === "infinitepay" || name === "mock") {
    return providerPorNome(name);
  }
  throw new PagamentoIndisponivel(`Provider desconhecido na Revera: "${name}".`);
}

export function reveraNationalPaymentAvailable(): boolean {
  try {
    getReveraNationalProvider();
    return true;
  } catch {
    return false;
  }
}

export function reveraInternationalPaymentAvailable(): boolean {
  return pagamentoInternacionalDisponivel();
}

export async function reveraApplePayDisponivel(): Promise<boolean> {
  if (process.env.REVERA_APPLE_PAY_ENABLED?.trim() === "0") return false;
  if (!reveraInternationalPaymentAvailable()) return false;
  return new StripeProvider().disponivel();
}
