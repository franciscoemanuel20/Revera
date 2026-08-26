"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { validarTransicaoPedido, type OrderStatusValue } from "@/lib/admin/order-status";

// Server Action de mudança de status de pedido — o único jeito do admin
// mexer em orders.status (além do webhook, que nunca passa por aqui: ver
// src/app/api/webhooks/pagamento/route.ts). Usa createClient() (sessão,
// sob RLS) — a policy "admin manage orders" de
// supabase/migrations/00000000000005_admin_pedidos_policies.sql autoriza a
// escrita; esta função só garante que a transição pedida faz sentido ANTES
// de mandar o update, porque RLS não sabe validar sequência de estado.

const STATUS_VALIDOS = [
  "new",
  "paid",
  "preparing",
  "label_ready",
  "shipped",
  "delivered",
  "canceled",
  "warranty",
] as const;

const mudarStatusSchema = z.object({
  orderId: z.string().uuid(),
  novoStatus: z.enum(STATUS_VALIDOS),
});

export type MudarStatusPedidoInput = z.infer<typeof mudarStatusSchema>;
export type MudarStatusPedidoResultado = { error: string } | { ok: true };

export async function mudarStatusPedidoAction(
  input: MudarStatusPedidoInput
): Promise<MudarStatusPedidoResultado> {
  const parsed = mudarStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { orderId, novoStatus } = parsed.data;
  const supabase = await createClient();

  const { data: pedido, error: erroLeitura } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (erroLeitura || !pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }

  const statusAtual = pedido.status as OrderStatusValue;
  const validacao = validarTransicaoPedido(statusAtual, novoStatus as OrderStatusValue);
  if (!validacao.ok) {
    return { error: validacao.erro };
  }

  const { error: erroUpdate } = await supabase
    .from("orders")
    .update({ status: novoStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    // Mesma defesa de corrida do webhook (route.ts, passo 5): só aplica se
    // o status ainda for o que esta tela leu — evita duas abas do admin
    // (ou o admin e o webhook) resolverem a mesma transição em cima uma da
    // outra.
    .eq("status", statusAtual);
  if (erroUpdate) {
    return { error: "Não foi possível mudar o status. Confira se você tem permissão de admin." };
  }

  await registrarAuditoria(supabase, {
    action: "pedido.mudar_status",
    entityType: "orders",
    entityId: orderId,
    diff: { de: statusAtual, para: novoStatus },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin");
  return { ok: true };
}
