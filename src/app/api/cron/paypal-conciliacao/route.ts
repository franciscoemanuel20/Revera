import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ACAO_PAYPAL_RETIDO, reavaliarCapturaPayPal } from "@/lib/payments/paypal-captura";
import { PayPalProvider } from "@/lib/payments/paypal-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conferência periódica dos pedidos PayPal ainda pendentes (06/10/2026).
 *
 * Rede de segurança do webhook: se um aviso do PayPal se perder (fora do ar,
 * assinatura recusada, evento não assinado), o pedido não fica "aguardando
 * pagamento" para sempre. A cada rodada, pedidos internacionais pendentes dos
 * últimos 7 dias com ordem PayPal passam por reavaliarCapturaPayPal(), que
 * pergunta ao PayPal e, se pago, confirma pelo caminho de sempre.
 *
 * Mesma porta fechada do carrinho abandonado: sem CRON_SECRET, 404.
 * Devolve 200 mesmo sem nada a fazer; erro vira log.
 */
const JANELA_DIAS = 7;
// Dá tempo ao fluxo normal (retorno do cliente + webhook) antes de conferir.
const MATURACAO_MINUTOS = 10;
const LIMITE_POR_RODADA = 25;
// Reserva ainda 'pending' depois disto é, quase sempre, checkout abandonado
// antes da aprovação: sai da fila para não tomar o lugar dos recentes.
// Captura RETIDA também fica 'pending', mas o webhook PENDING já avisou.
const PENDENTE_MAX_HORAS = 24;
// Timeout da consulta da ordem; quem protege os 60 s é o corte de 45 s no laço.
const TIMEOUT_POR_PEDIDO_MS = 8_000;

export async function GET(req: NextRequest) {
  const segredo = (process.env.CRON_SECRET ?? "").trim();
  if (!segredo || (req.headers.get("authorization") ?? "") !== `Bearer ${segredo}`) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const supabase = createAdminClient();
  const agora = Date.now();
  const { data, error } = await supabase
    .from("payments")
    .select("order_id, provider_payment_id, orders!inner(payment_status, canceled_at, currency, created_at)")
    .eq("provider", "paypal")
    .or(
      `status.eq.approved,and(status.eq.pending,created_at.gte.${new Date(agora - PENDENTE_MAX_HORAS * 3_600_000).toISOString()})`
    )
    .not("provider_payment_id", "is", null)
    .eq("orders.payment_status", "pending")
    .is("orders.canceled_at", null)
    .neq("orders.currency", "BRL")
    .gte("orders.created_at", new Date(agora - JANELA_DIAS * 86_400_000).toISOString())
    .lte("orders.created_at", new Date(agora - MATURACAO_MINUTOS * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(LIMITE_POR_RODADA);

  if (error) {
    console.error("[cron/paypal] falha ao ler pendentes", error.message);
    return NextResponse.json({ ok: false });
  }

  // Fila longa: capturas que o PayPal SEGUROU (marcadas no histórico por
  // reavaliarCapturaPayPal) continuam sendo conferidas por 7 dias, mesmo com
  // a reserva 'pending' passando das 24 h. Vêm primeiro: são vendas pagas.
  const { data: marcas, error: erroMarcas } = await supabase
    .from("audit_logs")
    .select("entity_id")
    .eq("action", ACAO_PAYPAL_RETIDO)
    .gte("created_at", new Date(agora - JANELA_DIAS * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(LIMITE_POR_RODADA);
  if (erroMarcas) console.error("[cron/paypal] falha ao ler retidos", erroMarcas.message);
  const idsRetidos = [...new Set((marcas ?? []).map((m) => m.entity_id as string).filter(Boolean))];
  let retidosPendentes: string[] = [];
  if (idsRetidos.length > 0) {
    const { data: aindaPendentes } = await supabase
      .from("orders")
      .select("id")
      .in("id", idsRetidos)
      .eq("payment_status", "pending")
      .is("canceled_at", null);
    retidosPendentes = (aindaPendentes ?? []).map((o) => o.id as string);
  }

  const fila: Array<{ orderId: string; paypalOrderId: string | null }> = [
    ...retidosPendentes.map((orderId) => ({ orderId, paypalOrderId: null })),
    ...(data ?? []).map((l) => ({ orderId: l.order_id as string, paypalOrderId: l.provider_payment_id as string })),
  ];

  // Uma instância só: o token OAuth é guardado por instância.
  const paypal = new PayPalProvider();
  const inicio = Date.now();
  const vistos = new Set<string>();
  const resultados: Record<string, number> = {};
  for (const { orderId, paypalOrderId } of fila) {
    if (vistos.has(orderId)) continue;
    if (Date.now() - inicio > 45_000) break; // a próxima rodada continua
    vistos.add(orderId);
    const r = await reavaliarCapturaPayPal(
      orderId,
      { eventId: null, paypalOrderId },
      paypal,
      { timeoutMs: TIMEOUT_POR_PEDIDO_MS }
    );
    resultados[r.estado] = (resultados[r.estado] ?? 0) + 1;
  }

  console.info("[cron/paypal]", JSON.stringify({ pedidos: vistos.size, resultados }));
  return NextResponse.json({ ok: true, pedidos: vistos.size, resultados }, { headers: { "cache-control": "no-store" } });
}
