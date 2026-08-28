import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripeProvider } from "@/lib/payments";
import { confirmarPagamento, registrarReembolso } from "@/lib/payments/confirmar";
import { segredoConfere } from "@/lib/payments/webhook-url";

/**
 * PORTA 1 do pagamento INTERNACIONAL: o webhook da Stripe.
 *
 * Rota irmã de /api/webhooks/pagamento/[segredo] (InfinitePay) — mesma
 * disciplina, três diferenças que importam:
 *
 *  1. AQUI EXISTE ASSINATURA. parseWebhookHint valida o header
 *     Stripe-Signature (HMAC-SHA256 + tolerância de 5 min contra replay)
 *     e devolve null para qualquer corpo não assinado — que vira 400 sem
 *     tocar em pedido. O segredo no caminho da URL continua valendo como
 *     primeira barreira contra varredura, igual à rota irmã.
 *  2. A Stripe manda MUITOS tipos de evento. Os que não mudam pedido
 *     (kind "ignorar") são gravados em payment_events — auditoria e
 *     idempotência — e respondem 200 sem executar nada.
 *  3. Reembolso NÃO passa pela confirmação de pagamento (ver
 *     registrarReembolso em confirmar.ts).
 *
 * Tudo `await`, nada depois do return — serverless encerra o processo
 * quando a resposta sai (mesma lição da rota irmã).
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ segredo: string }> }
) {
  const { segredo } = await params;

  if (!segredoConfere(segredo)) {
    // 404, não 403: quem varre não descobre que o caminho existe.
    return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  }

  const rawBody = await request.text();

  let provider;
  try {
    provider = getStripeProvider();
  } catch (erro) {
    console.error("[stripe-webhook] pagamento internacional não configurado", erro);
    // 5xx: a Stripe reenvia o evento quando a configuração voltar.
    return NextResponse.json({ erro: "pagamento não configurado" }, { status: 503 });
  }

  const hint = provider.parseWebhookHint(rawBody, request.headers);
  if (!hint) {
    // Assinatura inválida, corpo estranho ou segredo ausente. Nenhum dado
    // do corpo é confiável — nem para log.
    return NextResponse.json({ erro: "evento não verificável" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotência decidida pelo BANCO (unique provider + provider_event_id):
  // o mesmo evento reenviado dez vezes grava uma e responde "repetido" nove.
  const { error: erroEvento } = await supabase.from("payment_events").insert({
    provider: provider.name,
    provider_event_id: hint.eventId,
    event_type: hint.kind ?? "pagamento",
    payload: parseSeguro(rawBody) as never,
  });

  if (erroEvento) {
    if (erroEvento.code === "23505") {
      return NextResponse.json({ ok: true, repetido: true });
    }
    console.error("[stripe-webhook] falha ao gravar evento", erroEvento);
    return NextResponse.json({ erro: "erro interno" }, { status: 500 });
  }

  if (hint.kind === "ignorar") {
    await marcarProcessado(supabase, provider.name, hint.eventId);
    return NextResponse.json({ ok: true, ignorado: true });
  }

  if (hint.kind === "reembolso") {
    const resultado = await registrarReembolso(hint.orderId, {
      provider: provider.name,
      transactionId: hint.transactionId,
      eventId: hint.eventId,
    });
    await marcarProcessado(supabase, provider.name, hint.eventId);
    return NextResponse.json({ ok: true, reembolso: resultado });
  }

  const resultado = await confirmarPagamento(hint.orderId, {
    transactionId: hint.transactionId,
    invoiceSlug: hint.invoiceSlug,
    eventId: hint.eventId,
  });

  if (resultado.estado === "indisponivel") {
    // Não conseguimos verificar agora. Apaga o evento para o reenvio da
    // Stripe não bater na trava de idempotência, e responde 5xx — é o
    // status que faz a Stripe reenviar com backoff.
    await supabase
      .from("payment_events")
      .delete()
      .eq("provider", provider.name)
      .eq("provider_event_id", hint.eventId);
    return NextResponse.json({ erro: resultado.motivo }, { status: 503 });
  }

  await marcarProcessado(supabase, provider.name, hint.eventId);
  return NextResponse.json({ ok: true, pago: resultado.estado === "pago" });
}

async function marcarProcessado(
  supabase: ReturnType<typeof createAdminClient>,
  provider: string,
  eventId: string
) {
  await supabase
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("provider_event_id", eventId);
}

function parseSeguro(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { _naoParseavel: raw.slice(0, 2000) };
  }
}
