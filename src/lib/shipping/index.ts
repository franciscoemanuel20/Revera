import "server-only";
import type { ShippingProvider } from "./provider";
import { MockShippingProvider } from "./mock-provider";
import { SuperFreteShippingProvider } from "./superfrete-provider";
import { permiteSimulacao } from "@/lib/config/ambiente";

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
 *
 * ===========================================================================
 * O MOCK SÓ EXISTE ONDE SIMULAÇÃO É PERMITIDA (28/08/2026)
 * ===========================================================================
 * A versão anterior caía em mock SEMPRE que o token faltasse — inclusive em
 * produção. É o mesmo buraco do P0-2 de pagamentos, com outra roupa: um
 * deploy de produção sem a variável passaria a cobrar do cliente um frete
 * INVENTADO (R$ 19,90 + dígito do CEP), silenciosamente, e a etiqueta
 * daquele serviço nunca existiria.
 *
 * Agora, onde há comprador real, token ausente devolve o provider REAL —
 * cuja primeira chamada falha com ShippingUnavailable("SUPERFRETE_TOKEN não
 * configurado"). Esse é o caminho já desenhado para indisponibilidade: a
 * venda acontece com frete 0 e o motivo gravado em shipping_quotes (decisão
 * da assimetria, em cotarFrete) — em vez de um número falso que ninguém
 * combinou. O mock continua valendo em desenvolvimento e staging, onde é
 * exatamente o que se quer.
 */
export function getShippingProvider(): ShippingProvider {
  if (process.env.SUPERFRETE_TOKEN) {
    return new SuperFreteShippingProvider();
  }
  if (permiteSimulacao()) {
    return new MockShippingProvider();
  }
  return new SuperFreteShippingProvider();
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
