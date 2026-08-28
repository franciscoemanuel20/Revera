import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { providerParaMoeda } from "@/lib/payments";
import type { WebhookHint } from "@/lib/payments/provider";
import { registrarPurchasePendente } from "@/lib/tracking/purchase";
import { despacharPurchase } from "@/lib/tracking/despachar";
import { avisarVendaPaga } from "@/lib/notificacoes/venda-paga";

/**
 * Confirmação de pagamento — a ÚNICA função do sistema que marca um pedido
 * como pago. Chamada por DUAS portas independentes (ver abaixo).
 *
 * ===========================================================================
 * POR QUE DUAS PORTAS, E NÃO SÓ O WEBHOOK
 * ===========================================================================
 * Esta arquitetura não é teórica: veio de um prejuízo real registrado no
 * projeto irmão (`repo/novo-site/src/lib/process-payment.ts`), que atende a
 * mesma operação. Copiado verbatim de lá:
 *
 *   "Em 12/08/2026 um pagamento real de R$ 5,00 foi feito e o webhook NUNCA
 *    chegou: zero requisições registradas. O pedido ficou 'pending' para
 *    sempre, o Trinks não liberou e o Purchase nunca saiu. Depender de um
 *    único aviso externo foi um erro de projeto."
 *
 * Portanto:
 *   PORTA 1 — o webhook do gateway (POST /api/webhooks/pagamento/[segredo])
 *   PORTA 2 — o retorno do cliente à página de obrigado, depois de pagar
 *
 * As duas passam OBRIGATORIAMENTE por aqui, e aqui a resposta nunca vem do
 * que o navegador ou o corpo do webhook afirmam: vem de uma chamada de saída
 * ao gateway (`confirmPayment`). Nenhuma das duas portas tem autoridade
 * própria; as duas só sabem dizer "vá olhar este pedido".
 *
 * Se o webhook sumir, o cliente voltando já confirma. Se o cliente fechar o
 * navegador antes de voltar, o webhook confirma. Uma porta cobre a outra.
 */

export type ResultadoConfirmacao =
  | { estado: "pago"; jaEstavaPago: boolean }
  | { estado: "nao_pago"; motivo: string }
  | { estado: "indisponivel"; motivo: string };

/**
 * @param orderId  orders.id (é o `order_nsu` mandado ao gateway)
 * @param pistas   dados extras vindos do webhook, quando houver. No retorno
 *                 do cliente não temos transaction_nsu — e tudo bem: o
 *                 gateway aceita consultar só pelo order_nsu.
 */
export async function confirmarPagamento(
  orderId: string,
  pistas?: Partial<Pick<WebhookHint, "transactionId" | "invoiceSlug" | "eventId">>
): Promise<ResultadoConfirmacao> {
  const supabase = createAdminClient();

  /**
   * P0-2, segunda passagem (27/08/2026).
   *
   * `getPaymentProvider()` passou a LANÇAR quando o pagamento não está
   * configurado — que é o comportamento certo. Mas aqui a chamada estava
   * solta, e esta função é chamada por `/pedido/[token]` SEM try/catch
   * (page.tsx:60). O resultado seria uma tela de erro do Next para quem
   * acabou de pagar e só quer ver o próprio pedido.
   *
   * `indisponivel` já existe no contrato desta função exatamente para isto:
   * "não consegui decidir agora". O pedido continua 'new', a outra porta
   * continua valendo, e a tela mostra o estado real em vez de quebrar.
   *
   * Falhar fechado é sobre não aprovar pagamento indevido. Não é desculpa
   * para tratar mal quem estava comprando — o mesmo raciocínio já escrito
   * em src/app/checkout/pagamento/page.tsx.
   */
  const { data: pedido, error: erroPedido } = await supabase
    .from("orders")
    .select("id, status, total_cents, currency")
    .eq("id", orderId)
    .maybeSingle();

  if (erroPedido) {
    console.error("[confirmar] falha ao ler pedido", erroPedido);
    return { estado: "indisponivel", motivo: "erro ao ler pedido" };
  }
  if (!pedido) {
    return { estado: "nao_pago", motivo: "pedido inexistente" };
  }

  /**
   * O provider é decidido pela MOEDA DO PEDIDO, nunca pela rota que chamou
   * (multi-gateway, 28/08/2026): BRL → nacional, resto → Stripe. Por isso o
   * pedido é lido ANTES do provider — a leitura acima é o que diz qual
   * gateway tem autoridade para confirmar este pagamento. Um webhook da
   * Stripe apontando para um pedido BRL vai perguntar à InfinitePay (que
   * dirá "não pago"), e vice-versa: gateway nenhum confirma pedido que não
   * é dele.
   */
  let provider;
  try {
    provider = providerParaMoeda(pedido.currency as string);
  } catch (erro) {
    console.error("[confirmar] pagamento não configurado", erro);
    return { estado: "indisponivel", motivo: "pagamento não configurado" };
  }

  /**
   * PORTA 2 sem pista: o cliente voltou à página do pedido e ninguém trouxe
   * o id da transação. Para a Stripe isso importa — o retrieve por id de
   * sessão é imediato, enquanto a busca por metadata tem consistência
   * eventual. A linha `pending` de payments, gravada na criação da
   * cobrança, guarda exatamente esse id. Usa quando existir.
   */
  let pistasEfetivas = pistas;
  if (!pistas?.transactionId) {
    const { data: pendente } = await supabase
      .from("payments")
      .select("provider_payment_id")
      .eq("order_id", pedido.id)
      .eq("provider", provider.name)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendente?.provider_payment_id) {
      pistasEfetivas = { ...pistas, transactionId: pendente.provider_payment_id as string };
    }
  }

  // Já pago (por qualquer uma das portas). Não reprocessa, não redispara.
  if (pedido.status !== "new") {
    if (pedido.status === "canceled") {
      return { estado: "nao_pago", motivo: "pedido cancelado" };
    }
    return { estado: "pago", jaEstavaPago: true };
  }

  // A verificação que vale.
  let confirmacao;
  try {
    confirmacao = await provider.confirmPayment({
      orderId,
      transactionId: pistasEfetivas?.transactionId ?? null,
      invoiceSlug: pistasEfetivas?.invoiceSlug ?? null,
      eventId: pistasEfetivas?.eventId ?? `order:${orderId}`,
    });
  } catch (erro) {
    // Gateway fora do ar não é "não pago" — é "não sei ainda". Devolver
    // indisponível faz o webhook responder 400 (gateway reenvia) e a página
    // de obrigado mostrar "confirmando pagamento" em vez de "recusado".
    console.error("[confirmar] verificação falhou", erro);
    return { estado: "indisponivel", motivo: "gateway não respondeu" };
  }

  if (!confirmacao.paid) {
    await registrarTentativa(supabase, provider.name, pedido, pistasEfetivas, confirmacao, "failed");
    return { estado: "nao_pago", motivo: "gateway diz que não foi pago" };
  }

  /**
   * Conferência de MOEDA, antes da de valor (multi-moeda, 28/08/2026).
   * "Pagou 770" não diz nada sozinho: 770 USD e 770 BRL diferem por fator
   * cinco. Só compara quando o gateway informou moeda (o mock não informa —
   * e aí vale a conferência de valor contra o total, como sempre).
   */
  if (confirmacao.currency != null && confirmacao.currency !== pedido.currency) {
    console.error("[confirmar] moeda paga diverge da moeda do pedido", {
      pedido: pedido.id,
      moedaPedido: pedido.currency,
      moedaPaga: confirmacao.currency,
    });
    await registrarTentativa(supabase, provider.name, pedido, pistasEfetivas, confirmacao, "failed");
    return { estado: "nao_pago", motivo: "moeda divergente" };
  }

  // Conferência de valor: pagar R$ 1 num pedido de R$ 1.600 não libera nada.
  // Só compara quando o gateway informou valor (o mock não informa).
  if (
    confirmacao.paidAmountCents != null &&
    confirmacao.paidAmountCents < pedido.total_cents
  ) {
    console.error("[confirmar] valor pago menor que o pedido", {
      pedido: pedido.id,
      pago: confirmacao.paidAmountCents,
      total: pedido.total_cents,
    });
    await registrarTentativa(supabase, provider.name, pedido, pistasEfetivas, confirmacao, "failed");
    return { estado: "nao_pago", motivo: "valor divergente" };
  }

  await registrarTentativa(supabase, provider.name, pedido, pistasEfetivas, confirmacao, "approved");

  // A trava contra corrida: se as duas portas chegarem juntas, só uma
  // atualiza — a outra vê zero linhas e entende que já foi.
  //
  // Ela mora em payment_status desde 27/08/2026: `status` virou coluna gerada
  // (migration 00000000000008) e não aceita escrita nem filtro de escrita.
  // O efeito de corrida é idêntico — quem encontrar 'pending' ganha — e de
  // quebra o pedido já sai com o eixo de envio no lugar certo: pago é o
  // instante em que ele passa a esperar etiqueta.
  const { data: atualizado, error: erroUpdate } = await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      shipping_status: "awaiting_label",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pedido.id)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();

  if (erroUpdate) {
    console.error("[confirmar] falha ao marcar pago", erroUpdate);
    return { estado: "indisponivel", motivo: "erro ao gravar" };
  }

  if (!atualizado) {
    // A outra porta ganhou a corrida. Pago, sem redisparar nada.
    return { estado: "pago", jaEstavaPago: true };
  }

  // Só quem efetivamente transicionou registra o direito ao Purchase.
  await registrarPurchasePendente(supabase, pedido.id);

  /**
   * E envia, aqui, pelo servidor — não na tela de obrigado.
   *
   * Este é o único ponto do sistema onde um Purchase pode nascer, e ele fica
   * DEPOIS da reconfirmação com o gateway de propósito. Quem paga por Pix sai
   * para o aplicativo do banco e muitas vezes não volta: se a conversão
   * dependesse da tela de obrigado, essas vendas sumiriam do relatório e as
   * campanhas otimizariam contra elas.
   *
   * `await` e não "dispara e esquece": numa função serverless, o processo
   * pode ser encerrado assim que a resposta sai, e uma promessa solta morre
   * pela metade — a conversão se perderia de forma intermitente, o pior tipo
   * de bug para diagnosticar. despacharPurchase engole os próprios erros, e
   * portanto esperar por ela não arrisca a confirmação do pagamento.
   */
  await despacharPurchase(supabase, pedido.id, provider.name);

  /**
   * O histórico do pedido e o aviso, nesta ordem e nos dois casos com
   * `await`, pelo mesmo motivo do Purchase acima: numa função serverless a
   * promessa solta morre pela metade quando a resposta sai.
   *
   * Nenhum dos dois lança — avisarVendaPaga engole os próprios erros de
   * propósito. Um aviso perdido é recuperável (a venda está no painel); uma
   * confirmação de pagamento perdida não é.
   */
  await supabase.from("audit_logs").insert({
    admin_user_id: null,
    action: "pedido.pagamento_confirmado",
    entity_type: "orders",
    entity_id: pedido.id,
    diff: { por: provider.name },
  });

  await avisarVendaPaga(supabase, pedido.id);

  return { estado: "pago", jaEstavaPago: false };
}

async function registrarTentativa(
  supabase: ReturnType<typeof createAdminClient>,
  providerName: string,
  pedido: { id: string; total_cents: number },
  pistas: Partial<Pick<WebhookHint, "transactionId">> | undefined,
  confirmacao: { paidAmountCents: number | null; method: string | null; raw: unknown },
  status: "approved" | "failed"
) {
  const { error } = await supabase.from("payments").insert({
    order_id: pedido.id,
    provider: providerName,
    provider_payment_id: pistas?.transactionId ?? null,
    method: confirmacao.method,
    status,
    amount_cents: confirmacao.paidAmountCents ?? pedido.total_cents,
    raw_response: confirmacao.raw as never,
  });
  if (error) console.error("[confirmar] falha ao registrar payment", error);
}

/**
 * Reembolso avisado pelo gateway (hoje: charge.refunded da Stripe).
 *
 * NÃO passa por confirmarPagamento de propósito: lá a pergunta é "foi
 * pago?", e a resposta do gateway para um pagamento estornado continua
 * sendo "sim, foi" — o caminho de confirmação marcaria como pago um pedido
 * que acabou de ser devolvido. Aqui a transição é outra e é estreita:
 * paid → refunded, e só. Pedido que nunca foi pago não tem o que estornar
 * (o update condicional encontra zero linhas e nada acontece).
 *
 * O eixo de envio fica como está: estorno de pedido já enviado é decisão
 * operacional (a peça volta? reenvia?) que pertence ao admin, não a um
 * webhook.
 */
export async function registrarReembolso(
  orderId: string,
  origem: { provider: string; transactionId: string | null; eventId: string }
): Promise<"reembolsado" | "ignorado"> {
  const supabase = createAdminClient();

  const { data: atualizado, error } = await supabase
    .from("orders")
    .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("payment_status", "paid")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[reembolso] falha ao marcar", error);
    return "ignorado";
  }
  if (!atualizado) return "ignorado";

  await supabase.from("payments").insert({
    order_id: orderId,
    provider: origem.provider,
    provider_payment_id: origem.transactionId,
    method: null,
    status: "refunded",
    amount_cents: 0,
    raw_response: { evento: origem.eventId } as never,
  });

  await supabase.from("audit_logs").insert({
    admin_user_id: null,
    action: "pedido.reembolso_registrado",
    entity_type: "orders",
    entity_id: orderId,
    diff: { por: origem.provider, evento: origem.eventId },
  });

  return "reembolsado";
}
