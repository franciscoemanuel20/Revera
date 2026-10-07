import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { reavaliarCapturaPayPal } from "@/lib/payments/paypal-captura";
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
// 25 pedidos × 8 s ainda cabe nos 60 s mesmo com o PayPal lento.
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

  // Uma instância só: o token OAuth é guardado por instância.
  const paypal = new PayPalProvider();
  const inicio = Date.now();
  const vistos = new Set<string>();
  const resultados: Record<string, number> = {};
  for (const linha of data ?? []) {
    const orderId = linha.order_id as string;
    if (vistos.has(orderId)) continue;
    if (Date.now() - inicio > 45_000) break; // a próxima rodada continua
    vistos.add(orderId);
    const r = await reavaliarCapturaPayPal(
      orderId,
      { eventId: null, paypalOrderId: linha.provider_payment_id as string },
      paypal,
      { timeoutMs: TIMEOUT_POR_PEDIDO_MS }
    );
    resultados[r.estado] = (resultados[r.estado] ?? 0) + 1;
  }

  console.info("[cron/paypal]", JSON.stringify({ pedidos: vistos.size, resultados }));
  return NextResponse.json({ ok: true, pedidos: vistos.size, resultados }, { headers: { "cache-control": "no-store" } });
}
