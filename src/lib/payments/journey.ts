import "server-only";

type SupabaseLike = {
  from(tabela: string): {
    insert(valor: Record<string, unknown>): PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
};

export type PaymentJourneyEvent =
  | "checkout_created"
  | "checkout_redirected"
  | "checkout_returned_unpaid"
  | "checkout_canceled"
  | "payment_declined"
  | "payment_approved"
  | "checkout_abandoned";

export type PaymentJourneySource = "server" | "browser" | "webhook" | "reconciliation" | "admin";

/**
 * Observabilidade não autoriza nenhum efeito financeiro. A chave determinística
 * torna chamadas repetidas (webhook + retorno + reconciliação) inofensivas.
 */
export async function registrarEventoPagamento(
  supabase: SupabaseLike,
  evento: {
    orderId: string;
    paymentId?: string | null;
    provider?: string | null;
    eventType: PaymentJourneyEvent;
    source: PaymentJourneySource;
    eventKey: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  const { error } = await supabase.from("payment_journey_events").insert({
    order_id: evento.orderId,
    payment_id: evento.paymentId ?? null,
    provider: evento.provider ?? null,
    event_type: evento.eventType,
    source: evento.source,
    event_key: evento.eventKey,
    metadata: evento.metadata ?? {},
  });
  if (!error || error.code === "23505") return true;
  console.error("[payment-journey] falha ao registrar evento", {
    orderId: evento.orderId,
    eventType: evento.eventType,
    errorCode: error.code,
  });
  return false;
}
