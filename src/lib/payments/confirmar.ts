import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import type { WebhookHint } from "@/lib/payments/provider";
import { registrarPurchasePendente } from "@/lib/tracking/purchase";
import { despacharPurchase } from "@/lib/tracking/despachar";

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
  let provider;
  try {
    provider = getPaymentProvider();
  } catch (erro) {
    console.error("[confirmar] pagamento não configurado", erro);
    return { estado: "indisponivel", motivo: "pagamento não configurado" };
  }

  const { data: pedido, error: erroPedido } = await supabase
    .from("orders")
    .select("id, status, total_cents")
    .eq("id", orderId)
    .maybeSingle();

  if (erroPedido) {
    console.error("[confirmar] falha ao ler pedido", erroPedido);
    return { estado: "indisponivel", motivo: "erro ao ler pedido" };
  }
  if (!pedido) {
    return { estado: "nao_pago", motivo: "pedido inexistente" };
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
      transactionId: pistas?.transactionId ?? null,
      invoiceSlug: pistas?.invoiceSlug ?? null,
      eventId: pistas?.eventId ?? `order:${orderId}`,
    });
  } catch (erro) {
    // Gateway fora do ar não é "não pago" — é "não sei ainda". Devolver
    // indisponível faz o webhook responder 400 (gateway reenvia) e a página
    // de obrigado mostrar "confirmando pagamento" em vez de "recusado".
    console.error("[confirmar] verificação falhou", erro);
    return { estado: "indisponivel", motivo: "gateway não respondeu" };
  }

  if (!confirmacao.paid) {
    await registrarTentativa(supabase, provider.name, pedido, pistas, confirmacao, "failed");
    return { estado: "nao_pago", motivo: "gateway diz que não foi pago" };
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
    await registrarTentativa(supabase, provider.name, pedido, pistas, confirmacao, "failed");
    return { estado: "nao_pago", motivo: "valor divergente" };
  }

  await registrarTentativa(supabase, provider.name, pedido, pistas, confirmacao, "approved");

  // A trava contra corrida: só transiciona quem encontrar o pedido AINDA em
  // 'new'. Se as duas portas chegarem juntas, só uma atualiza — a outra vê
  // zero linhas e entende que já foi.
  const { data: atualizado, error: erroUpdate } = await supabase
    .from("orders")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", pedido.id)
    .eq("status", "new")
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
