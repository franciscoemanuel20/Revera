import "server-only";
import type { PaymentProvider } from "./provider";
import { MockPaymentProvider } from "./mock-provider";
import { InfinitePayProvider } from "./infinitepay-provider";
import { StripeProvider } from "./stripe-provider";
import { descricaoDoAmbiente, permiteSimulacao } from "@/lib/config/ambiente";

/**
 * Erro de configuração de pagamento.
 *
 * Tipo próprio (e não Error genérico) para quem chama conseguir distinguir
 * "não está configurado" de "o gateway caiu" — são situações diferentes e
 * merecem telas diferentes: a primeira é culpa nossa e não adianta o cliente
 * tentar de novo; a segunda passa sozinha.
 */
export class PagamentoIndisponivel extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PagamentoIndisponivel";
  }
}

/**
 * Factory único — checkout e webhook chamam getPaymentProvider(), nunca
 * importam um adapter direto.
 *
 * ===========================================================================
 * FAIL-CLOSED (P0-2, 27/08/2026) — o que mudou e por quê
 * ===========================================================================
 * Este arquivo fazia:
 *
 *     const provider = process.env.PAYMENT_PROVIDER ?? "mock";
 *
 * O raciocínio original está no histórico e não era bobo: "um deploy sem a
 * variável NÃO pode cair silenciosamente em cobrança real". O problema é que
 * ele protegia contra o erro menor e abria a porta do maior. Sem a variável,
 * a loja não cobrava ninguém — ela APROVAVA todo mundo, porque
 * MockPaymentProvider.confirmPayment() devolve paid:true sempre. Prótese de
 * R$ 1.600 entregue de graça, e um Purchase falso para a Meta em cima.
 *
 * Reproduzido em 27/08/2026 com VERCEL_ENV=production e a variável ausente:
 * o provider escolhido foi 'mock'.
 *
 * A regra agora tem duas travas independentes:
 *
 *   1. PAYMENT_PROVIDER AUSENTE  → erro. Nunca há padrão. Nem mock, nem real.
 *   2. PAYMENT_PROVIDER=mock     → só vale se o ambiente for desenvolvimento
 *                                  (ver src/lib/config/ambiente.ts, que trata
 *                                  ausência de sinal como produção).
 *
 * Ou seja: para o mock rodar é preciso pedir por ele E estar num lugar onde
 * ele é permitido. Esquecer a variável não aprova nada; e definir mock por
 * engano na Vercel também não.
 *
 * O preço disso é que um deploy mal configurado deixa a loja sem pagamento.
 * É o desfecho certo: uma loja que não consegue cobrar perde vendas daquele
 * dia; uma loja que aprova sem cobrar perde o estoque e a conta de anúncios.
 */
export function getPaymentProvider(): PaymentProvider {
  const configurado = process.env.PAYMENT_PROVIDER?.trim();

  if (!configurado) {
    throw new PagamentoIndisponivel(
      "PAYMENT_PROVIDER não está definida. O pagamento fica indisponível de " +
        "propósito: sem essa variável não existe padrão, para nunca aprovar " +
        `uma compra sem cobrar. Defina 'infinitepay' em produção. ${descricaoDoAmbiente()}`
    );
  }

  switch (configurado) {
    case "mock":
      if (!permiteSimulacao()) {
        throw new PagamentoIndisponivel(
          "PAYMENT_PROVIDER=mock foi recusado: o provedor simulado aprova " +
            "qualquer pagamento sem cobrar, e só pode rodar em " +
            `desenvolvimento. ${descricaoDoAmbiente()}. Use 'infinitepay'.`
        );
      }
      return new MockPaymentProvider();

    case "infinitepay":
      return new InfinitePayProvider();

    default:
      throw new PagamentoIndisponivel(
        `PAYMENT_PROVIDER desconhecido: "${configurado}". Valores aceitos: ` +
          "'infinitepay' (real) ou 'mock' (só em desenvolvimento)."
      );
  }
}

/**
 * Provider INTERNACIONAL — Stripe, exigida por STRIPE_SECRET_KEY.
 *
 * Mesma filosofia fail-closed do nacional: sem a variável não existe
 * padrão, e o construtor do adapter ainda recusa chave live fora de
 * produção e chave de teste em produção (ver stripe-provider.ts). Não há
 * "mock internacional": o fluxo internacional se testa apontando
 * STRIPE_API_BASE para um dublê local — o código que roda é o real.
 */
export function getStripeProvider(): PaymentProvider {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    throw new PagamentoIndisponivel(
      "STRIPE_SECRET_KEY não está definida. Pagamento internacional fica " +
        `indisponível de propósito — nenhum país estrangeiro abre sem ela. ${descricaoDoAmbiente()}`
    );
  }
  return new StripeProvider();
}

/**
 * A decisão de roteamento inteira, num lugar só: moeda → gateway.
 *
 * BRL → provider nacional (InfinitePay em produção, mock onde simulação é
 * permitida). Qualquer outra moeda suportada → Stripe. Não existe terceiro
 * caminho, e não existe pedido sem moeda (orders.currency é not null).
 */
export function providerParaMoeda(moeda: string): PaymentProvider {
  if (moeda === "BRL") return getPaymentProvider();
  return getStripeProvider();
}

/**
 * Se o pagamento está configurado, sem lançar. Para tela/diagnóstico decidir
 * o que mostrar antes de tentar cobrar.
 */
export function pagamentoEstaDisponivel(): boolean {
  try {
    getPaymentProvider();
    return true;
  } catch {
    return false;
  }
}

/** O mesmo, para o caminho internacional. */
export function pagamentoInternacionalDisponivel(): boolean {
  try {
    getStripeProvider();
    return true;
  } catch {
    return false;
  }
}

export type { PaymentProvider } from "./provider";
