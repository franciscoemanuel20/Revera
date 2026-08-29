import "server-only";
import { valorDasPecas } from "./despachar";
import type { createAdminClient } from "@/lib/supabase/server";
import { podeEnviarConversao } from "./permissao";

/**
 * Controle do evento Purchase (Meta Pixel / futura Conversions API).
 *
 * ===========================================================================
 * A REGRA (seção 14 da missão, e a mais cara de errar)
 * ===========================================================================
 * Purchase SÓ pode disparar quando existe confirmação confiável de pagamento
 * aprovado — nunca ao clicar em comprar, ao abrir o checkout, ao chegar numa
 * URL, nem ao clicar em WhatsApp. E não pode disparar duas vezes.
 *
 * Como isto é garantido aqui:
 *
 * 1. Quem cria o registro é EXCLUSIVAMENTE o webhook, depois de reconfirmar
 *    o pagamento com o gateway (ver src/app/api/webhooks/pagamento/route.ts).
 *    Nenhuma página, nenhuma ação de usuário cria este registro.
 *
 * 2. `pixel_event_log` tem unique (event_name, event_id). Usamos
 *    event_id = orders.id. Portanto o banco — não um if — garante que existe
 *    no máximo UM Purchase por pedido, para sempre.
 *
 * 3. O disparo no navegador (`sent_web`) e o disparo server-side pela CAPI
 *    (`sent_capi`) são marcados separadamente, mas compartilham o MESMO
 *    event_id. É assim que a Meta deduplica quando os dois caminhos
 *    existirem: mesmo event_id = mesma compra, contada uma vez.
 *
 * A página de obrigado só pode perguntar "devo disparar?" — nunca decidir
 * sozinha. Se não houver linha aqui, não houve pagamento confirmado, e nada
 * é disparado, mesmo que alguém abra a URL na mão.
 */

const EVENTO = "Purchase";

// Tipo derivado do próprio client admin do projeto, em vez de
// SupabaseClient<never,...>: com `never` como schema o supabase-js infere
// todas as colunas como `never` e qualquer acesso vira erro de tipo.
type Cliente = ReturnType<typeof createAdminClient>;

/**
 * Registra que este pedido TEM direito a um Purchase, ainda não enviado.
 * Idempotente: chamar duas vezes não cria dois registros.
 */
export async function registrarPurchasePendente(
  supabase: Cliente,
  orderId: string
): Promise<void> {
  const { error } = await supabase.from("pixel_event_log").insert({
    event_name: EVENTO,
    event_id: orderId,
    order_id: orderId,
    sent_web: false,
    sent_capi: false,
  });

  // 23505 = já existe. É o comportamento esperado num reenvio de webhook.
  if (error && error.code !== "23505") {
    console.error("[purchase] falha ao registrar pendência", error);
  }
}

export interface PurchasePayload {
  eventId: string;
  valueCents: number;
  currency: "BRL";
  orderId: string;
  orderNumber: string;
  contentIds: string[];
  contents: Array<{ id: string; quantity: number; item_price: number }>;
  numItems: number;
}

/**
 * Devolve o payload do Purchase se — e somente se — este pedido está pago e
 * o evento ainda não foi enviado ao navegador. Caso contrário devolve null.
 *
 * Marca `sent_web = true` na mesma operação, de forma condicional: se duas
 * abas abrirem a página de obrigado ao mesmo tempo, só uma recebe o payload.
 */
export async function consumirPurchaseParaNavegador(
  supabase: Cliente,
  orderId: string
): Promise<PurchasePayload | null> {
  // O pedido precisa estar pago DE FATO. Não basta existir o registro.
  const { data: pedido } = await supabase
    .from("orders")
    .select("id, order_number, status, total_cents, shipping_cents")
    .eq("id", orderId)
    .maybeSingle();

  if (!pedido || pedido.status === "new" || pedido.status === "canceled") {
    return null;
  }

  /**
   * CAMADA 2 de 3 (P0-3, 27/08/2026) — o navegador também não pode disparar
   * Purchase de uma compra simulada.
   *
   * Bloquear só o envio de servidor não bastaria: `medirCompra` chama
   * `fbq('track','Purchase')` com o NEXT_PUBLIC_META_PIXEL_ID real, que está
   * no bundle por natureza. Se este payload chegasse ao PurchaseTracker, o
   * evento sairia pelo navegador mesmo com a CAPI calada — e a Meta contaria
   * a venda do mesmo jeito.
   *
   * O provedor é lido de `payments` (e não recebido por parâmetro) porque
   * esta função também roda quando o cliente volta à página do pedido dias
   * depois, sem nenhuma confirmação acontecendo naquele momento.
   */
  const { data: pagamento } = await supabase
    .from("payments")
    .select("provider")
    .eq("order_id", orderId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const permissao = podeEnviarConversao({
    providerPagamento: (pagamento?.provider as string | null) ?? null,
  });
  if (!permissao.pode) {
    console.warn(
      "[purchase] payload de navegador recusado:",
      orderId,
      permissao.motivo
    );
    return null;
  }

  // Marca como enviado só se ainda não estava. O `.eq("sent_web", false)`
  // é o que torna isto seguro contra duas abas simultâneas: a segunda não
  // encontra linha para atualizar e recebe null.
  const { data: marcado } = await supabase
    .from("pixel_event_log")
    .update({ sent_web: true })
    .eq("event_name", EVENTO)
    .eq("event_id", orderId)
    .eq("sent_web", false)
    .select("event_id")
    .maybeSingle();

  if (!marcado) return null;

  const { data: itens } = await supabase
    .from("order_items")
    .select("variant_id, quantity, unit_price_cents")
    .eq("order_id", orderId);

  const linhas = itens ?? [];

  return {
    eventId: orderId,
    /**
     * MESMO valor do lado servidor — só as peças, sem frete (29/08/2026).
     *
     * Os dois Purchase compartilham o `event_id` (o id do pedido) para a Meta
     * juntar navegador e CAPI num evento só. Se cada lado mandasse um valor
     * diferente, a deduplicação continuaria funcionando mas o valor final
     * dependeria de qual chegou primeiro — receita instável por sorte de
     * corrida. Ver valorDasPecas em src/lib/tracking/despachar.ts.
     */
    valueCents: valorDasPecas(pedido),
    currency: "BRL",
    orderId,
    orderNumber: pedido.order_number,
    contentIds: linhas.map((i) => i.variant_id as string),
    contents: linhas.map((i) => ({
      id: i.variant_id as string,
      quantity: i.quantity as number,
      // A Meta espera preço unitário em unidade monetária, não centavos.
      item_price: (i.unit_price_cents as number) / 100,
    })),
    numItems: linhas.reduce((soma, i) => soma + (i.quantity as number), 0),
  };
}
