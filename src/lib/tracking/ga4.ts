import "server-only";
import type { Moeda } from "@/lib/internacional/moeda";
import { GA4_MEASUREMENT_ID, MOEDA, centavosParaMoeda } from "./config";
import { ehProducao, descricaoDoAmbiente } from "@/lib/config/ambiente";
import type { ResultadoEnvio } from "./meta-capi";

/**
 * Measurement Protocol do GA4 — o purchase que sai do SERVIDOR.
 *
 * Mesma razão do lado da Meta: quem paga por Pix sai do site e muitas vezes
 * não volta. Um purchase que só existe no navegador perde essas vendas.
 *
 * ===========================================================================
 * O client_id É O PONTO CRÍTICO AQUI
 * ===========================================================================
 * O GA4 identifica navegador por `client_id`, que vive no cookie `_ga`. Se o
 * servidor enviar um client_id inventado, o GA4 registra a compra como de um
 * usuário NOVO — e a jornada se parte: o anúncio trouxe uma pessoa, a compra
 * foi de outra. O relatório mostra tráfego sem conversão e conversão sem
 * origem, e ninguém entende por quê.
 *
 * Por isso o client_id é capturado do cookie no checkout e guardado no pedido
 * (orders.ga_client_id). Sem ele, este módulo PULA o envio e diz o motivo, em
 * vez de mandar um evento que suja o relatório. Um dado errado é pior que um
 * dado ausente: o ausente você percebe.
 */

export async function enviarPurchaseGa4(input: {
  eventId: string;
  eventTimeSegundos?: number;
  currency?: Moeda;
  clientId: string | null;
  valorCents: number;
  freteCents: number;
  orderNumber: string;
  contents: Array<{ id: string; quantity: number; item_price: number }>;
}): Promise<ResultadoEnvio> {
  // Guarda própria (CAMADA 3 do P0-3). O GA4 não tem equivalente ao
  // test_event_code da Meta que sirva para este uso, então fora de produção
  // o envio simplesmente não acontece — nunca contamina a propriedade real.
  if (!ehProducao()) {
    return {
      sucesso: false,
      motivoPulado: `envio ao GA4 bloqueado fora de produção (${descricaoDoAmbiente()})`,
    };
  }

  const apiSecret = process.env.GA4_API_SECRET;

  if (!GA4_MEASUREMENT_ID) {
    return { sucesso: false, motivoPulado: "NEXT_PUBLIC_GA4_MEASUREMENT_ID vazia" };
  }
  if (!apiSecret) {
    return { sucesso: false, motivoPulado: "GA4_API_SECRET vazia" };
  }
  if (!input.clientId) {
    return {
      sucesso: false,
      motivoPulado:
        "pedido sem ga_client_id — o cookie _ga não existia no checkout (bloqueador, ou o Google ainda não estava configurado quando este pedido foi feito)",
    };
  }

  // O Measurement Protocol só aceita eventos retroativos por até 72 horas.
  // Depois disso ele ainda pode responder 204, mas descarta o evento em
  // silêncio. Não transformamos esse falso aceite em "entregue": a Meta
  // continua com sua janela própria e a fila registra o GA4 como bloqueado.
  if (
    input.eventTimeSegundos &&
    Math.floor(Date.now() / 1000) - input.eventTimeSegundos > 72 * 60 * 60
  ) {
    return {
      sucesso: false,
      motivoPulado:
        "evento fora da janela de 72 horas do GA4 — não enviado para evitar falso aceite 204",
    };
  }

  const corpo = {
    client_id: input.clientId,
    // Em recuperação tardia, preserva a hora em que o pagamento foi
    // confirmado. Sem isto o GA4 atribuiria a compra ao instante do retry.
    ...(input.eventTimeSegundos
      ? { timestamp_micros: input.eventTimeSegundos * 1_000_000 }
      : {}),
    events: [
      {
        name: "purchase",
        params: {
          // Mesma chave do disparo de navegador: o GA4 deduplica por
          // transaction_id dentro da janela dele.
          transaction_id: input.eventId,
          value: centavosParaMoeda(input.valorCents),
          currency: input.currency ?? MOEDA,
          shipping: centavosParaMoeda(input.freteCents),
          // O número que a operação e o cliente usam para falar do pedido.
          affiliation: "Reverá",
          items: input.contents.map((c) => ({
            item_id: c.id,
            price: c.item_price,
            quantity: c.quantity,
          })),
        },
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
        GA4_MEASUREMENT_ID
      )}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      }
    );
  } catch (e) {
    return {
      sucesso: false,
      motivoPulado: `Google não respondeu: ${e instanceof Error ? e.message : e}`,
    };
  }

  /**
   * ATENÇÃO AO 204 MUDO.
   *
   * O Measurement Protocol responde 204 (sem conteúdo) mesmo para evento
   * malformado — ele NÃO valida em produção. Um 204 significa "recebi", não
   * "está certo". Quem valida de verdade é o endpoint /debug/mp/collect, e
   * é lá que se confere formato quando algo não aparece no relatório.
   *
   * Registramos o 204 como sucesso porque é o melhor sinal disponível, mas
   * este comentário existe para ninguém concluir, olhando o log, que "deu
   * 204 então o GA4 está medindo".
   */
  return {
    sucesso: res.ok,
    httpStatus: res.status,
    resposta: res.status === 204 ? { nota: "204 sem conteúdo — o GA4 não valida em produção" } : await res.text().catch(() => null),
  };
}
