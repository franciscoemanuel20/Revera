import "server-only";
import type { createAdminClient } from "@/lib/supabase/server";
import { baseUrl } from "@/lib/config/urls";
import { enviarPurchaseMeta } from "./meta-capi";
import { enviarPurchaseGa4 } from "./ga4";
import { podeEnviarConversao } from "./permissao";
import type { ResultadoEnvio } from "./meta-capi";

type Cliente = ReturnType<typeof createAdminClient>;

/**
 * Envia o Purchase para a Meta e para o Google, pelo servidor.
 *
 * ===========================================================================
 * QUEM CHAMA ISTO
 * ===========================================================================
 * Só src/lib/payments/confirmar.ts, e só depois de o pagamento ter sido
 * reconfirmado contra o gateway. Nenhuma página, nenhum clique, nenhuma ação
 * de usuário chega aqui. Abrir a URL da tela de obrigado na mão não dispara
 * conversão nenhuma.
 *
 * ===========================================================================
 * DUAS COISAS QUE ESTE ARQUIVO NUNCA FAZ
 * ===========================================================================
 * 1. Não derruba a confirmação do pagamento. Se a Meta estiver fora do ar, a
 *    venda continua confirmada e o cliente continua vendo o pedido pago —
 *    métrica quebrada é problema; venda travada por métrica é pior.
 *
 * 2. Não fica calado. TODA tentativa vira linha em conversion_logs, inclusive
 *    as puladas, com o motivo dizendo qual variável está vazia. Regra herdada
 *    do site irmão: silêncio não é diagnóstico. Sem isso, "a venda não
 *    apareceu no Google" é uma investigação; com isso, é uma consulta.
 *
 * As flags sent_capi e sent_ga4 são marcadas SEPARADAMENTE. Se a Meta
 * responder e o Google falhar, um reenvio manda só para o Google — em vez de
 * duplicar a receita na Meta.
 */
/**
 * O valor que a META recebe: só as peças, sem frete (Francisco, 29/08/2026).
 *
 * `orders.total_cents` é peça + frete − desconto. Mandar isso à Meta inflaria
 * o ROAS com dinheiro que é da transportadora, não da Reverá: numa venda de
 * 5 peças o frete responde por R$ 64 dos R$ 3.164, e a campanha passaria a
 * ser avaliada por uma receita que ninguém embolsa.
 *
 * Então o Purchase da Meta reporta `total − frete`, que é exatamente o que
 * foi cobrado pelas próteses, já com o desconto por quantidade aplicado.
 *
 * O GA4 NÃO usa esta função de propósito: lá a convenção é `value` cheio com
 * `shipping` numa chave separada, e o relatório do Google já sabe descontar.
 * Uniformizar os dois quebraria o lado que está certo.
 *
 * O `Math.max(0, …)` existe porque frete maior que o total só aconteceria com
 * dado corrompido — e valor negativo na Meta é evento recusado, não erro
 * visível.
 */
export function valorDasPecas(pedido: {
  total_cents: number;
  shipping_cents?: number | null;
}): number {
  return Math.max(0, pedido.total_cents - (pedido.shipping_cents ?? 0));
}

export async function despacharPurchase(
  supabase: Cliente,
  orderId: string,
  /**
   * payments.provider do pagamento que acabou de confirmar este pedido.
   * OBRIGATÓRIO desde o P0-3 (27/08/2026): sem saber quem confirmou, não dá
   * para distinguir uma venda de uma simulação — e era exatamente por essa
   * fresta que um Purchase de mock chegava à conta de anúncios real.
   */
  providerPagamento: string | null
): Promise<void> {
  try {
    await despachar(supabase, orderId, providerPagamento);
  } catch (e) {
    // Rede de segurança do princípio nº 1 acima: nada aqui pode escapar e
    // derrubar quem confirmou o pagamento.
    console.error("[purchase] despacho falhou inteiro", orderId, e);
  }
}

async function registrar(
  supabase: Cliente,
  orderId: string,
  eventId: string,
  plataforma: string,
  r: ResultadoEnvio
): Promise<void> {
  const { error } = await supabase.from("conversion_logs").insert({
    order_id: orderId,
    event_name: "Purchase",
    event_id: eventId,
    plataforma,
    sucesso: r.sucesso,
    motivo_pulado: r.motivoPulado ?? null,
    http_status: r.httpStatus ?? null,
    resposta: (r.resposta as object) ?? null,
  });
  if (error) {
    // Se nem o log grava, ao menos o console do servidor guarda.
    console.error("[purchase] log não gravado", plataforma, error, r);
  }
}

async function despachar(
  supabase: Cliente,
  orderId: string,
  providerPagamento: string | null
): Promise<void> {
  /**
   * CAMADA 1 de 3 (P0-3) — a permissão é checada ANTES de ler o pedido.
   *
   * Fica no topo de propósito: nenhuma linha de dado pessoal precisa ser
   * carregada para descobrir que este evento não vai sair. E a recusa vira
   * linha em conversion_logs com o motivo, porque "a venda não apareceu na
   * Meta" precisa ser uma consulta, não uma investigação.
   */
  const permissao = podeEnviarConversao({ providerPagamento });
  if (!permissao.pode) {
    console.warn("[purchase] envio recusado:", orderId, permissao.motivo);
    const recusa: ResultadoEnvio = {
      sucesso: false,
      motivoPulado: permissao.motivo ?? "envio não permitido",
    };
    await Promise.all([
      registrar(supabase, orderId, orderId, "meta", recusa),
      registrar(supabase, orderId, orderId, "ga4", recusa),
    ]);
    return;
  }

  const { data: pedido } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, shipping_cents, customer_id, address_id, fbp, fbc, ga_client_id, client_ip, user_agent"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!pedido) {
    console.error("[purchase] pedido não encontrado", orderId);
    return;
  }
  // Defesa em profundidade: quem chama já garantiu isto, mas um Purchase de
  // pedido não pago é o erro mais caro deste sistema.
  if (pedido.status === "new" || pedido.status === "canceled") {
    console.error("[purchase] recusado — pedido não está pago", orderId, pedido.status);
    return;
  }

  const { data: evento } = await supabase
    .from("pixel_event_log")
    .select("sent_capi, sent_ga4")
    .eq("event_name", "Purchase")
    .eq("event_id", orderId)
    .maybeSingle();

  if (!evento) {
    console.error("[purchase] sem registro em pixel_event_log", orderId);
    return;
  }

  const [{ data: itens }, { data: cliente }, { data: endereco }] =
    await Promise.all([
      supabase
        .from("order_items")
        .select("variant_id, quantity, unit_price_cents")
        .eq("order_id", orderId),
      pedido.customer_id
        ? supabase
            .from("customers")
            .select("full_name, email, phone, cpf")
            .eq("id", pedido.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      pedido.address_id
        ? supabase
            .from("addresses")
            .select("cep, city, state")
            .eq("id", pedido.address_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const linhas = itens ?? [];
  const contents = linhas.map((i) => ({
    id: i.variant_id as string,
    quantity: i.quantity as number,
    item_price: (i.unit_price_cents as number) / 100,
  }));
  const numItems = linhas.reduce((s, i) => s + (i.quantity as number), 0);

  // Segundos, não milissegundos: a Meta rejeita o evento se vier em ms, e a
  // mensagem de erro não diz isso claramente.
  const agoraSegundos = Math.floor(Date.now() / 1000);

  // Os dois envios em paralelo: um não deve esperar o outro, e uma plataforma
  // lenta não pode atrasar a outra.
  const [meta, ga4] = await Promise.all([
    evento.sent_capi
      ? Promise.resolve<ResultadoEnvio>({
          sucesso: true,
          motivoPulado: "já enviado antes (sent_capi)",
        })
      : enviarPurchaseMeta({
          comoTeste: permissao.comoTeste,
          eventId: orderId,
          eventTimeSegundos: agoraSegundos,
          valorCents: valorDasPecas(pedido),
          orderNumber: pedido.order_number,
          sourceUrl: `${baseUrl()}/pedido`,
          contents,
          numItems,
          pessoa: {
            email: cliente?.email ?? null,
            phone: cliente?.phone ?? null,
            fullName: cliente?.full_name ?? null,
            cpf: cliente?.cpf ?? null,
            cep: endereco?.cep ?? null,
            city: endereco?.city ?? null,
            state: endereco?.state ?? null,
            fbp: pedido.fbp,
            fbc: pedido.fbc,
            clientIp: pedido.client_ip,
            userAgent: pedido.user_agent,
          },
        }),

    evento.sent_ga4
      ? Promise.resolve<ResultadoEnvio>({
          sucesso: true,
          motivoPulado: "já enviado antes (sent_ga4)",
        })
      : enviarPurchaseGa4({
          eventId: orderId,
          clientId: pedido.ga_client_id,
          valorCents: pedido.total_cents,
          freteCents: pedido.shipping_cents,
          orderNumber: pedido.order_number,
          contents,
        }),
  ]);

  await Promise.all([
    registrar(supabase, orderId, orderId, "meta", meta),
    registrar(supabase, orderId, orderId, "ga4", ga4),
  ]);

  // Marca só o que REALMENTE foi. Uma plataforma que falhou continua com a
  // flag falsa, e um reenvio futuro tenta só ela.
  const atualizacao: Record<string, boolean> = {};
  if (meta.sucesso) atualizacao.sent_capi = true;
  if (ga4.sucesso) atualizacao.sent_ga4 = true;

  if (Object.keys(atualizacao).length > 0) {
    await supabase
      .from("pixel_event_log")
      .update(atualizacao)
      .eq("event_name", "Purchase")
      .eq("event_id", orderId);
  }
}
