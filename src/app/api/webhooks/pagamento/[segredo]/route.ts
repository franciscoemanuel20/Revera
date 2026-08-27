import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import { confirmarPagamento } from "@/lib/payments/confirmar";
import { segredoConfere } from "@/lib/payments/webhook-url";

/**
 * PORTA 1 de confirmação de pagamento: o aviso do gateway.
 *
 * Esta rota NÃO decide se algo foi pago — ela só traduz o aviso e chama
 * `confirmarPagamento`, que pergunta ao gateway. Ver o comentário longo em
 * src/lib/payments/confirmar.ts para o porquê de existirem duas portas.
 *
 * O segredo vai no CAMINHO da URL, não em query string (ver
 * src/lib/payments/webhook-url.ts — query string já sumiu em produção no
 * projeto irmão e custou uma venda).
 *
 * ATENÇÃO ao editar: tudo aqui é `await`. Nada de "processar em background"
 * depois do return. Copiado verbatim do projeto irmão
 * (`repo/novo-site/src/lib/webhook-handler.ts`):
 *
 *   "Em ambiente serverless (Vercel), a execução é encerrada assim que a
 *    resposta é enviada. Uma promise solta depois do return seria
 *    interrompida no meio e o Purchase nunca chegaria às plataformas —
 *    silenciosamente."
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ segredo: string }> }
) {
  const { segredo } = await params;

  // Barreira contra varredura. Não é a segurança principal — ver confirmar.ts.
  if (!segredoConfere(segredo)) {
    // 404, não 403: quem varre não descobre que o caminho existe.
    return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  }

  const rawBody = await request.text();

  /**
   * P0-2 (27/08/2026): getPaymentProvider() agora lança quando o pagamento
   * não está configurado. Aqui isso vira 503, não 500 — e a distinção
   * importa: a InfinitePay reenvia o aviso depois de um 5xx, então um
   * webhook que chegar durante uma janela de má configuração não se perde.
   * O pedido continua 'new' e a porta 2 (retorno do cliente) ainda cobre.
   */
  let provider;
  try {
    provider = getPaymentProvider();
  } catch (erro) {
    console.error("[webhook] pagamento não configurado — recusando aviso", erro);
    return NextResponse.json(
      { erro: "pagamento não configurado" },
      { status: 503 }
    );
  }

  const hint = provider.parseWebhookHint(rawBody);
  if (!hint) {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotência decidida pelo BANCO (unique em provider + provider_event_id),
  // não por um if — dois avisos simultâneos não podem ambos passar.
  const { error: erroEvento } = await supabase.from("payment_events").insert({
    provider: provider.name,
    provider_event_id: hint.eventId,
    event_type: "webhook",
    payload: parseSeguro(rawBody) as never,
  });

  if (erroEvento) {
    if (erroEvento.code === "23505") {
      // Já processado. 200 para o gateway parar de reenviar.
      return NextResponse.json({ ok: true, repetido: true });
    }
    console.error("[webhook] falha ao gravar evento", erroEvento);
    return NextResponse.json({ erro: "erro interno" }, { status: 500 });
  }

  const resultado = await confirmarPagamento(hint.orderId, {
    transactionId: hint.transactionId,
    invoiceSlug: hint.invoiceSlug,
    eventId: hint.eventId,
  });

  if (resultado.estado === "indisponivel") {
    // Não conseguimos verificar. Apaga o evento para permitir o reenvio, e
    // responde 400 — a InfinitePay reenvia quando recebe 400.
    await supabase
      .from("payment_events")
      .delete()
      .eq("provider", provider.name)
      .eq("provider_event_id", hint.eventId);
    return NextResponse.json({ erro: resultado.motivo }, { status: 400 });
  }

  // Marca o evento como processado, para auditoria.
  await supabase
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", provider.name)
    .eq("provider_event_id", hint.eventId);

  return NextResponse.json({ ok: true, pago: resultado.estado === "pago" });
}

function parseSeguro(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { _naoParseavel: raw.slice(0, 2000) };
  }
}
