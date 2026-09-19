import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripeProvider } from "@/lib/payments";
import { getReveraNationalProvider, getReveraProviderByName } from "@/lib/payments/revera";
import { confirmarPagamento, registrarReembolso } from "@/lib/payments/confirmar";
import type { PaymentProvider, WebhookHint } from "@/lib/payments/provider";
import { segredoConfere } from "@/lib/payments/webhook-url";
import { enviarEmailOperacional } from "@/lib/notificacoes/email-operacional";

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
  let roteado: { provider: PaymentProvider; hint: WebhookHint } | null = null;
  try {
    roteado = rotearWebhook(rawBody, request.headers);
  } catch (erro) {
    console.error("[webhook] pagamento não configurado — recusando aviso", erro);
    return NextResponse.json(
      { erro: "pagamento não configurado" },
      { status: 503 }
    );
  }

  if (!roteado) {
    // A conta Asaas é UMA só para Reverá, Prótese, One Buy e OneMark: todo
    // aviso da conta chega aqui. Aviso autenticado da Asaas que não é de
    // checkout (PAYMENT_* etc.) não é nosso. Responder 4xx penaliza a
    // configuração e, com 15 falhas, a Asaas INTERROMPE a fila inteira — foi
    // o que parou esta fila em 18/09/2026. Responde 200 e ignora.
    if (avisoAutenticadoDaAsaas(request.headers)) {
      return NextResponse.json({ ok: true, ignorado: "aviso asaas sem checkout" });
    }
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const { provider, hint } = roteado;

  const supabase = createAdminClient();

  // Checkout da Asaas de OUTRO produto da mesma conta: a referência não é um
  // pedido da Reverá. Sem este corte, o id alheio (nem sempre uuid) quebrava a
  // leitura do pedido (400) ou a liberação da reserva (500), e cada resposta
  // de erro penalizava a fila. Só a falha real do banco pede reenvio.
  if (provider.name === "asaas") {
    const deste = await pedidoExisteNaRevera(supabase, hint.orderId);
    if (deste === "erro") {
      return NextResponse.json({ erro: "falha ao conferir o pedido" }, { status: 500 });
    }
    if (deste === "nao") {
      return NextResponse.json({ ok: true, ignorado: "pedido de outro produto" });
    }
  }

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

  if (hint.kind === "ignorar") {
    await supabase
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("provider_event_id", hint.eventId);
    return NextResponse.json({ ok: true, ignorado: true });
  }

  if (hint.kind === "reembolso") {
    const resultado = await registrarReembolso(hint.orderId, {
      provider: provider.name,
      transactionId: hint.transactionId,
      eventId: hint.eventId,
    });
    await supabase
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("provider_event_id", hint.eventId);
    return NextResponse.json({ ok: true, reembolso: resultado });
  }

  if (hint.kind === "checkout_expirado") {
    let confirmado = false;
    try {
      confirmado = (await provider.confirmCheckoutExpired?.(hint)) === true;
    } catch (erro) {
      console.error("[webhook] não foi possível confirmar expiração do checkout", erro);
    }

    if (!confirmado) {
      await supabase
        .from("payment_events")
        .delete()
        .eq("provider", provider.name)
        .eq("provider_event_id", hint.eventId);
      return NextResponse.json(
        { erro: "expiração não confirmada pelo gateway" },
        { status: 400 }
      );
    }

    let { data: reservaLiberada, error: erroLiberarReserva } = await supabase
      .from("payments")
      .update({
        status: "failed",
        raw_response: {
          checkout_expirado: true,
          transaction_id: hint.transactionId,
          event_id: hint.eventId,
        },
      })
      .eq("order_id", hint.orderId)
      .eq("provider", provider.name)
      .eq("provider_payment_id", hint.transactionId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!erroLiberarReserva && !reservaLiberada) {
      const resultadoSemId = await supabase
        .from("payments")
        .update({
          status: "failed",
          provider_payment_id: hint.transactionId,
          raw_response: {
            checkout_expirado: true,
            transaction_id: hint.transactionId,
            event_id: hint.eventId,
            provider_payment_id_recuperado: true,
          },
        })
        .eq("order_id", hint.orderId)
        .eq("provider", provider.name)
        .is("provider_payment_id", null)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      reservaLiberada = resultadoSemId.data;
      erroLiberarReserva = resultadoSemId.error;
    }

    if (erroLiberarReserva || !reservaLiberada) {
      const { data: jaEncerrada } = await supabase
        .from("payments")
        .select("id, status")
        .eq("order_id", hint.orderId)
        .eq("provider", provider.name)
        .eq("provider_payment_id", hint.transactionId)
        .limit(1)
        .maybeSingle();

      if (erroLiberarReserva || !jaEncerrada || jaEncerrada.status === "pending") {
        if (erroLiberarReserva) {
          console.error("[webhook] falha ao liberar reserva de checkout expirado", erroLiberarReserva);
        }
        await supabase
          .from("payment_events")
          .delete()
          .eq("provider", provider.name)
          .eq("provider_event_id", hint.eventId);
        return NextResponse.json(
          { erro: "não foi possível liberar a reserva expirada" },
          { status: 500 }
        );
      }
    }

    await supabase
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("provider_event_id", hint.eventId);
    const envioEmail = await enviarEmailOperacional({
      assunto: `Checkout Reverá encerrado — ${hint.orderId}`,
      texto: [
        "CHECKOUT REVERÁ ENCERRADO",
        "",
        `Pedido: ${hint.orderId}`,
        `Gateway: ${provider.name}`,
        `Transação: ${hint.transactionId ?? "—"}`,
        `Evento: ${hint.eventId}`,
        "",
        "Status: checkout cancelado ou expirado no gateway.",
        "Ação: se for cliente real, conferir no painel antes de abordar manualmente.",
      ].join("\n"),
      idempotencyKey: `revera-checkout-expirado:${provider.name}:${hint.eventId}`,
    });
    if (envioEmail.estado === "erro") {
      console.error("[webhook-email] falha ao avisar checkout encerrado", envioEmail.motivo);
    }
    return NextResponse.json({ ok: true, checkout_expirado: true });
  }

  const resultado = await confirmarPagamento(hint.orderId, {
    transactionId: hint.transactionId,
    invoiceSlug: hint.invoiceSlug,
    eventId: hint.eventId,
  });

  if (resultado.estado === "indisponivel") {
    // Não conseguimos verificar. Apaga o evento para permitir o reenvio.
    // InfinitePay reenvia em 400; Stripe só reenvia quando recebe 5xx.
    await supabase
      .from("payment_events")
      .delete()
      .eq("provider", provider.name)
      .eq("provider_event_id", hint.eventId);
    return NextResponse.json(
      { erro: resultado.motivo },
      { status: provider.name === "stripe" ? 503 : 400 }
    );
  }

  // Marca o evento como processado, para auditoria.
  await supabase
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", provider.name)
    .eq("provider_event_id", hint.eventId);

  return NextResponse.json({ ok: true, pago: resultado.estado === "pago" });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function pedidoExisteNaRevera(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string
): Promise<"sim" | "nao" | "erro"> {
  if (!UUID.test(orderId)) return "nao";
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[webhook] falha ao conferir pedido do aviso asaas", error);
    return "erro";
  }
  return data ? "sim" : "nao";
}

function avisoAutenticadoDaAsaas(headers: Headers): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_AUTH_TOKEN?.trim();
  return Boolean(esperado) && headers.get("asaas-access-token") === esperado;
}

function parseSeguro(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { _naoParseavel: raw.slice(0, 2000) };
  }
}

function rotearWebhook(
  rawBody: string,
  headers: Headers
): { provider: PaymentProvider; hint: WebhookHint } | null {
  if (headers.get("stripe-signature")) {
    const provider = getStripeProvider();
    const hint = provider.parseWebhookHint(rawBody, headers);
    return hint ? { provider, hint } : null;
  }

  const candidatos: PaymentProvider[] = [];
  candidatos.push(getReveraNationalProvider());
  for (const nome of ["asaas", "infinitepay"] as const) {
    if (candidatos.some((p) => p.name === nome)) continue;
    candidatos.push(getReveraProviderByName(nome));
  }

  for (const provider of candidatos) {
    const hint = provider.parseWebhookHint(rawBody, headers);
    if (hint) return { provider, hint };
  }
  return null;
}
