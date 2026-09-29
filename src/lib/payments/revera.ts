import "server-only";
import {
  getStripeProvider,
  PagamentoIndisponivel,
  providerPorNome,
  type PaymentProvider,
} from "@/lib/payments";
import { PayPalProvider } from "@/lib/payments/paypal-provider";
import { StripeProvider } from "@/lib/payments/stripe-provider";

type ProviderNacionalRevera = "asaas" | "infinitepay" | "mock";
type ProviderInternacionalRevera = "stripe" | "paypal";

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
  return currency === "BRL" ? getReveraNationalProvider() : getReveraInternationalProvider();
}

export function getReveraProviderByName(name: string): PaymentProvider {
  if (name === "stripe") return getStripeProvider();
  if (name === "paypal") return new PayPalProvider();
  if (name === "asaas" || name === "infinitepay" || name === "mock") {
    return providerPorNome(name);
  }
  throw new PagamentoIndisponivel(`Provider desconhecido na Revera: "${name}".`);
}

export function getReveraInternationalProviderName(): ProviderInternacionalRevera {
  const nome = process.env.REVERA_INTERNATIONAL_PAYMENT_PROVIDER?.trim() || "stripe";
  if (nome === "stripe") return nome;
  if (nome === "paypal" && process.env.PAYPAL_CHECKOUT_ENABLED?.trim() === "1") return nome;
  if (nome === "paypal") {
    throw new PagamentoIndisponivel(
      "PayPal internacional está em WIP e fica desligado até PAYPAL_CHECKOUT_ENABLED=1."
    );
  }
  throw new PagamentoIndisponivel(
    `Provider internacional da Revera inválido: "${nome}". Use 'stripe' ou 'paypal'.`
  );
}

export function getReveraInternationalProvider(): PaymentProvider {
  const nome = getReveraInternationalProviderName();
  return nome === "paypal" ? new PayPalProvider() : getStripeProvider();
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
  try {
    const nome = getReveraInternationalProviderName();
    if (nome === "paypal") {
      return Boolean(
        process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim()
      );
    }
    getStripeProvider();
    return true;
  } catch {
    return false;
  }
}

export async function reveraInternationalCheckoutDisponivel(): Promise<boolean> {
  try {
    const provider = getReveraInternationalProvider();
    if (provider.name === "paypal") return new PayPalProvider().disponivel();
    return new StripeProvider().disponivel();
  } catch {
    return false;
  }
}

export async function reveraApplePayDisponivel(): Promise<boolean> {
  if (process.env.REVERA_APPLE_PAY_ENABLED?.trim() !== "1") return false;
  try {
    getStripeProvider();
  } catch {
    return false;
  }
  return new StripeProvider().disponivel();
}
