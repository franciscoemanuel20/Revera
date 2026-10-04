import "server-only";
import type { createAdminClient } from "@/lib/supabase/server";
import { baseUrl } from "@/lib/config/urls";
import { enviarPurchaseMeta } from "./meta-capi";
import { enviarPurchaseGa4 } from "./ga4";
import { podeEnviarConversao } from "./permissao";
import { fbcAPartirDeFbclid } from "./fbc";
import type { ResultadoEnvio } from "./meta-capi";

type Cliente = ReturnType<typeof createAdminClient>;
type ResultadoDespacho = { meta: ResultadoEnvio; ga4: ResultadoEnvio };

function motivoPermanente(r: ResultadoEnvio | undefined): boolean {
  return Boolean(
    r?.motivoPulado &&
      /consentimento|não permitido|simulado|fora de produção|pedido não está pago|sem ga_client_id|janela de 72 horas/.test(
        r.motivoPulado
      )
  );
}

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
    await processarPurchasePendente(supabase, orderId);
    // A fila registra o provider aprovado; o argumento legado não autoriza envio.
    void providerPagamento;
  } catch (e) {
    // Rede de segurança do princípio nº 1 acima: nada aqui pode escapar e
    // derrubar quem confirmou o pagamento.
    console.error("[purchase] despacho falhou inteiro", orderId, e);
  }
}

export async function processarPurchasePendente(
  supabase: Cliente,
  orderId: string | null = null
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_purchase_outbox", { p_order_id: orderId });
  if (error) throw new Error("purchase_outbox_claim_failed");
  const job = data?.[0];
  if (!job) return false;
  let result: ResultadoDespacho | undefined;
  let infraFailure = false;
  try {
    result = await despachar(supabase, job.order_id, job.provider, {
      eventTime: Math.floor(new Date(job.event_time).getTime() / 1000),
      valueCents: job.value_cents,
      currency: job.currency,
    });
  } catch {
    // Não contém dados pessoais ou resposta crua do provedor.
    infraFailure = true;
    console.error("[purchase] tentativa da fila interrompida");
  }
  const metaEntregue = result?.meta.sucesso === true;
  const ga4Entregue = result?.ga4.sucesso === true;
  const entregue = metaEntregue && ga4Entregue;
  // A fila só termina bloqueada quando TODA plataforma ainda não entregue
  // chegou a um impedimento permanente. Se o GA4 expirou mas a Meta teve um
  // 503, por exemplo, a Meta continua elegível e precisa ser tentada de novo.
  const bloqueado =
    !entregue &&
    (metaEntregue || motivoPermanente(result?.meta)) &&
    (ga4Entregue || motivoPermanente(result?.ga4));
  const { data: finished, error: finishError } = await supabase.rpc("finish_purchase_outbox", {
    p_order_id: job.order_id,
    p_lease_token: job.lease_token,
    p_delivered: entregue,
    p_blocked: bloqueado,
    p_http_status: result?.meta.httpStatus ?? null,
    p_infrastructure_failure: infraFailure,
    p_meta_delivered: metaEntregue,
    p_ga4_delivered: ga4Entregue,
  });
  if (finishError || finished !== true) throw new Error("purchase_outbox_finish_failed");
  if (infraFailure) throw new Error("purchase_outbox_read_failed");
  return true;
}

async function registrar(
  supabase: Cliente,
  orderId: string,
  eventId: string,
  plataforma: string,
  r: ResultadoEnvio
): Promise<boolean> {
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
    console.error("[purchase] log não gravado", plataforma, error);
  }
  return !error;
}

async function despachar(
  supabase: Cliente,
  orderId: string,
  providerPagamento: string | null,
  snapshot: { eventTime: number; valueCents: number; currency: "BRL" | "USD" | "EUR" | "GBP" | "AUD" | "CAD" }
): Promise<ResultadoDespacho> {
  /**
   * CAMADA 1 de 3 (P0-3) — a permissão é checada ANTES de ler o pedido.
   *
   * Fica no topo de propósito: nenhuma linha de dado pessoal precisa ser
   * carregada para descobrir que este evento não vai sair. E a recusa vira
   * linha em conversion_logs com o motivo, porque "a venda não apareceu na
   * Meta" precisa ser uma consulta, não uma investigação.
   */
  const { data: pedido, error: pedidoError } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, shipping_cents, customer_id, address_id, fbp, fbc, fbclid, ga_client_id, client_ip, user_agent, tracking_consent, created_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (pedidoError || !pedido) throw new Error("purchase_order_read_failed");
  const permissao = pedido.tracking_consent
    ? podeEnviarConversao({ providerPagamento })
    : { pode: false, motivo: "consentimento para rastreamento opcional ausente", comoTeste: false };
  if (!permissao.pode) {
    const recusa: ResultadoEnvio = { sucesso: false, motivoPulado: permissao.motivo ?? "envio não permitido" };
    await Promise.all([registrar(supabase, orderId, orderId, "meta", recusa), registrar(supabase, orderId, orderId, "ga4", recusa)]);
    return { meta: recusa, ga4: recusa };
  }
  // Defesa em profundidade: quem chama já garantiu isto, mas um Purchase de
  // pedido não pago é o erro mais caro deste sistema.
  if (pedido.status === "new" || pedido.status === "canceled") {
    console.error("[purchase] recusado — pedido não está pago", orderId, pedido.status);
    const recusa = { sucesso: false, motivoPulado: "pedido não está pago" };
    return { meta: recusa, ga4: recusa };
  }

  const { data: evento, error: eventoError } = await supabase
    .from("pixel_event_log")
    .select("sent_capi, sent_ga4")
    .eq("event_name", "Purchase")
    .eq("event_id", orderId)
    .maybeSingle();

  if (eventoError || !evento) throw new Error("purchase_event_read_failed");

  // O log de aceite é persistido antes da finalização da lease. Se esse
  // último RPC falhar, não perder o conhecimento da entrega externa.
  const { data: aceites, error: erroAceites } = await supabase
    .from("conversion_logs")
    .select("plataforma")
    .eq("order_id", orderId)
    .eq("event_name", "Purchase")
    .eq("event_id", orderId)
    .eq("sucesso", true);
  if (erroAceites) throw new Error("purchase_acceptance_read_failed");
  const metaJaAceita = evento.sent_capi || aceites?.some((r) => r.plataforma === "meta");
  const ga4JaAceita = evento.sent_ga4 || aceites?.some((r) => r.plataforma === "ga4");

  const [{ data: itens, error: itensError }, { data: cliente, error: clienteError }, { data: endereco, error: enderecoError }] =
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
        : Promise.resolve({ data: null, error: null }),
      pedido.address_id
        ? supabase
            .from("addresses")
            .select("cep, city, state")
            .eq("id", pedido.address_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (itensError || clienteError || enderecoError || !itens?.length) throw new Error("purchase_details_read_failed");
  const linhas = itens;
  const contents = linhas.map((i) => ({
    id: i.variant_id as string,
    quantity: i.quantity as number,
    item_price: (i.unit_price_cents as number) / 100,
  }));
  const numItems = linhas.reduce((s, i) => s + (i.quantity as number), 0);

  // Segundos, não milissegundos: a Meta rejeita o evento se vier em ms, e a
  // mensagem de erro não diz isso claramente.
  const agoraSegundos = snapshot.eventTime;
  if (!Number.isFinite(agoraSegundos) || !Number.isInteger(snapshot.valueCents)) throw new Error("purchase_snapshot_invalid");

  // Os dois envios em paralelo: um não deve esperar o outro, e uma plataforma
  // lenta não pode atrasar a outra.
  const [meta, ga4] = await Promise.all([
    metaJaAceita
      ? Promise.resolve<ResultadoEnvio>({
          sucesso: true,
          motivoPulado: "já enviado antes (sent_capi)",
        })
      : enviarPurchaseMeta({
          comoTeste: permissao.comoTeste,
          currency: snapshot.currency,
          eventId: orderId,
          eventTimeSegundos: agoraSegundos,
          valorCents: snapshot.valueCents,
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
            fbc:
              pedido.fbc ??
              fbcAPartirDeFbclid(
                (pedido.fbclid as string | null) ?? null,
                (pedido.created_at as string | null) ?? null
              ),
            clientIp: pedido.client_ip,
            userAgent: pedido.user_agent,
          },
        }),

    ga4JaAceita
      ? Promise.resolve<ResultadoEnvio>({
          sucesso: true,
          motivoPulado: "já enviado antes (sent_ga4)",
        })
      : enviarPurchaseGa4({
          eventId: orderId,
          eventTimeSegundos: snapshot.eventTime,
          clientId: pedido.ga_client_id,
          currency: snapshot.currency,
          valorCents: pedido.total_cents,
          freteCents: pedido.shipping_cents,
          orderNumber: pedido.order_number,
          contents,
        }),
  ]);

  const [logMeta, logGa4] = await Promise.all([
    registrar(supabase, orderId, orderId, "meta", meta),
    registrar(supabase, orderId, orderId, "ga4", ga4),
  ]);

  if ((meta.sucesso && !metaJaAceita && !logMeta) || (ga4.sucesso && !ga4JaAceita && !logGa4)) {
    throw new Error("purchase_acceptance_write_failed");
  }
  // Flags de cada plataforma e estado da fila são gravados atomicamente no RPC.
  return { meta, ga4 };
}
