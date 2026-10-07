import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { confirmarPagamento, registrarReembolso } from "@/lib/payments/confirmar";
import { PayPalProvider, type EstadoCapturaPayPal } from "@/lib/payments/paypal-provider";
import { enviarEmailOperacional } from "@/lib/notificacoes/email-operacional";

/**
 * O que fazer com um pedido PayPal depois de um aviso de captura ou na
 * conferência periódica (06/10/2026).
 *
 * Nasceu da primeira venda internacional (REV-7DA5CEBF): o PayPal segurou a
 * captura pedindo aceite manual da moeda, o site ignorou o aviso e ninguém
 * soube até o Francisco olhar o PayPal. Aqui:
 *
 *   concluída / aprovada  → confirmarPagamento() (o caminho de sempre)
 *   pendente (retida)     → e-mail à equipe dizendo o motivo e o que fazer
 *   recusada              → libera a reserva (payments 'failed') + e-mail
 *   reembolsada/estornada → registrarReembolso() + e-mail ("não despachar")
 *   parcialmente reemb.   → só e-mail (decisão humana)
 *
 * O estado vem SEMPRE do PayPal (estadoCaptura), nunca do aviso. Nada aqui
 * marca pedido como pago: isso continua só em confirmarPagamento().
 */

export type ResultadoReavaliacao =
  | { estado: "sem_paypal" }
  | { estado: "indisponivel"; motivo: string }
  | { estado: "confirmado"; pago: boolean }
  | { estado: "retido"; motivo: string | null }
  | { estado: "recusado" }
  | { estado: "reembolsado" }
  | { estado: "parcial" }
  | { estado: "nada_a_fazer"; detalhe: string };

export async function reavaliarCapturaPayPal(
  orderId: string,
  origem: { eventId: string | null; paypalOrderId?: string | null }
): Promise<ResultadoReavaliacao> {
  const supabase = createAdminClient();

  const { data: pedido, error: erroPedido } = await supabase
    .from("orders")
    .select("id, order_number, payment_status, canceled_at, currency, total_cents")
    .eq("id", orderId)
    .maybeSingle();
  if (erroPedido) return { estado: "indisponivel", motivo: "erro ao ler pedido" };
  if (!pedido) return { estado: "nada_a_fazer", detalhe: "pedido inexistente" };

  // A ordem PayPal do pedido vem do NOSSO banco; o id do aviso só serve de
  // conferência. Um aviso não escolhe qual ordem olhar.
  const { data: pagamentos, error: erroPag } = await supabase
    .from("payments")
    .select("id, status, provider_payment_id, created_at")
    .eq("order_id", orderId)
    .eq("provider", "paypal")
    .not("provider_payment_id", "is", null)
    .order("created_at", { ascending: false });
  if (erroPag) return { estado: "indisponivel", motivo: "erro ao ler pagamentos" };
  const pagamento =
    (pagamentos ?? []).find((p) => p.provider_payment_id === origem.paypalOrderId) ??
    (pagamentos ?? [])[0];
  if (!pagamento?.provider_payment_id) return { estado: "sem_paypal" };
  const paypalOrderId = pagamento.provider_payment_id as string;

  let estado: EstadoCapturaPayPal;
  try {
    estado = await new PayPalProvider().estadoCaptura(paypalOrderId, orderId);
  } catch (erro) {
    console.error("[paypal-captura] PayPal não respondeu", erro);
    return { estado: "indisponivel", motivo: "PayPal não respondeu" };
  }

  const numero = pedido.order_number as string;
  const valor = `${((pedido.total_cents as number) / 100).toFixed(2)} ${pedido.currency as string}`;
  const avisar = (chave: string, assunto: string, linhas: string[]) =>
    enviarEmailOperacional({
      assunto,
      texto: [...linhas, "", `Pedido: ${numero}`, `Valor: ${valor}`, `Ordem PayPal: ${paypalOrderId}`].join("\n"),
      // Uma vez por pedido e situação: o webhook reenviado e a conferência
      // periódica caem na mesma chave e não repetem o e-mail.
      idempotencyKey: `revera-paypal-${chave}:${orderId}`,
    }).then((r) => {
      if (r.estado === "erro") console.error("[paypal-captura] e-mail falhou", r.motivo);
    });

  switch (estado.estado) {
    case "concluida":
    case "aprovada_sem_captura": {
      if (pedido.payment_status !== "pending" || pedido.canceled_at) {
        return { estado: "nada_a_fazer", detalhe: `pedido ${pedido.payment_status}` };
      }
      const r = await confirmarPagamento(orderId, {
        transactionId: paypalOrderId,
        invoiceSlug: null,
        eventId: origem.eventId ?? undefined,
      });
      if (r.estado === "indisponivel") return { estado: "indisponivel", motivo: r.motivo };
      return { estado: "confirmado", pago: r.estado === "pago" };
    }

    case "pendente": {
      if (pedido.payment_status !== "pending") {
        return { estado: "nada_a_fazer", detalhe: `pedido ${pedido.payment_status}` };
      }
      await avisar("retido", `PayPal segurou o pagamento — ${numero}`, [
        "PAGAMENTO RETIDO NO PAYPAL",
        "",
        "O cliente pagou, mas o PayPal segurou a cobrança.",
        `Motivo informado pelo PayPal: ${estado.motivo ?? "não informado"}`,
        "",
        estado.motivo === "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION"
          ? "O que fazer: a conta PayPal pede aceite manual de moeda estrangeira. Aceite o pagamento no PayPal e ajuste em Configurações > Pagamentos para aceitar e converter automaticamente."
          : "O que fazer: abra a transação no PayPal e veja o que ele pede para liberar.",
        "Quando o PayPal concluir, o site confirma o pedido sozinho.",
      ]);
      return { estado: "retido", motivo: estado.motivo };
    }

    case "recusada": {
      // Libera a reserva para o cliente poder tentar de novo. Só sai de
      // 'pending': uma linha já aprovada nunca volta para trás por aqui.
      await supabase
        .from("payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", pagamento.id)
        .eq("status", "pending");
      await avisar("recusado", `PayPal recusou o pagamento — ${numero}`, [
        "PAGAMENTO RECUSADO NO PAYPAL",
        "",
        `Motivo: ${estado.motivo ?? "não informado"}`,
        "O pedido continua aguardando pagamento. Não despachar.",
      ]);
      return { estado: "recusado" };
    }

    case "reembolsada":
    case "estornada": {
      const r = await registrarReembolso(orderId, {
        provider: "paypal",
        transactionId: paypalOrderId,
        eventId: origem.eventId ?? `conciliacao-${estado.estado}-${paypalOrderId}`,
      });
      await avisar(estado.estado, `PayPal: pagamento ${estado.estado === "reembolsada" ? "reembolsado" : "estornado"} — ${numero}`, [
        estado.estado === "reembolsada" ? "PAGAMENTO REEMBOLSADO NO PAYPAL" : "PAGAMENTO ESTORNADO NO PAYPAL (disputa/chargeback)",
        "",
        r === "reembolsado" ? "O pedido foi marcado como estornado no painel." : "O pedido já não constava como pago.",
        "NÃO DESPACHAR. Se já foi enviado, responda a disputa no PayPal com o rastreio DHL.",
      ]);
      return { estado: "reembolsado" };
    }

    case "parcialmente_reembolsada": {
      await avisar("parcial", `PayPal: reembolso parcial — ${numero}`, [
        "REEMBOLSO PARCIAL NO PAYPAL",
        "",
        "O pedido continua pago no painel. Confira no PayPal o valor devolvido e decida o que fazer.",
      ]);
      return { estado: "parcial" };
    }

    case "outro_pedido":
      console.error("[paypal-captura] ordem PayPal não pertence ao pedido", orderId, paypalOrderId);
      return { estado: "nada_a_fazer", detalhe: "ordem de outro pedido" };

    case "sem_captura":
      return { estado: "nada_a_fazer", detalhe: `ordem ${estado.statusOrdem ?? "?"}` };
  }
}
