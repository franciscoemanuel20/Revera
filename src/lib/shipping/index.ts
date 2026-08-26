import "server-only";
import type { ShippingProvider } from "./provider";
import { MockShippingProvider } from "./mock-provider";
import { SuperFreteShippingProvider } from "./superfrete-provider";

/**
 * Não há uma env "SHIPPING_PROVIDER" separada (diferente de payments): a
 * escolha segue a presença de SUPERFRETE_TOKEN, mesmo princípio do factory de
 * providers do projeto irmão — credencial ausente => mock, sem precisar de uma
 * segunda variável só para isso.
 *
 * A consequência a ter em mente: o dia em que o token entrar na Vercel, o
 * frete real passa a valer sozinho, sem deploy. É de propósito — mas é também
 * o motivo de o token ser a ÚLTIMA coisa a ser configurada, depois de o resto
 * estar conferido.
 */
export function getShippingProvider(): ShippingProvider {
  if (process.env.SUPERFRETE_TOKEN) {
    return new SuperFreteShippingProvider();
  }
  return new MockShippingProvider();
}

export { ShippingUnavailable } from "./provider";
export type {
  ShippingQuote,
  ShippingProvider,
  ShippableOrder,
  ShipmentResult,
  ShipmentStatus,
  ShipmentRecipient,
} from "./provider";
