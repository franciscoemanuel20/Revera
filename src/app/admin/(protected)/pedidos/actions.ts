"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import {
  ENVIO_LABEL,
  validarTransicaoEnvio,
  type ShippingStatusValue,
} from "@/lib/admin/venda-status";

/**
 * As ações manuais da responsável sobre um pedido.
 *
 * ===========================================================================
 * O QUE MUDOU EM 27/08/2026 (migration 8)
 * ===========================================================================
 * Antes existia UMA ação que movia `orders.status` por uma máquina de
 * estados que misturava dinheiro e caixa. Agora são duas, porque são duas
 * coisas diferentes:
 *
 *   marcarEnvioAction   — anda no eixo do ENVIO ("enviei", "chegou")
 *   cancelarPedidoAction — cancela, com motivo e data
 *
 * O eixo do PAGAMENTO não tem ação manual nenhuma, de propósito: só
 * confirmarPagamento() escreve nele, e só depois de perguntar ao gateway.
 * Marcar "pago" na mão é o caminho mais curto para despachar mercadoria sem
 * ter recebido.
 *
 * Emitir etiqueta também não está aqui — aquilo não é mudar status, é gastar
 * dinheiro, e mora em etiqueta.ts com trava própria.
 *
 * Usa createClient() (sessão, sob RLS): a policy "admin manage orders" da
 * migration 05 é quem autoriza a escrita. Esta função só garante que a
 * transição faz sentido, porque RLS não sabe validar sequência de estado.
 */

const ENVIOS_VALIDOS = [
  "not_ready",
  "awaiting_label",
  "label_processing",
  "label_created",
  "shipped",
  "delivered",
  "shipping_error",
] as const;

const marcarEnvioSchema = z.object({
  orderId: z.string().uuid(),
  novoEnvio: z.enum(ENVIOS_VALIDOS),
});

export type MarcarEnvioInput = z.infer<typeof marcarEnvioSchema>;
export type AcaoPedidoResultado = { error: string } | { ok: true };

export async function marcarEnvioAction(input: MarcarEnvioInput): Promise<AcaoPedidoResultado> {
  const parsed = marcarEnvioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { orderId, novoEnvio } = parsed.data;
  const supabase = await createClient();

  const { data: pedido, error: erroLeitura } = await supabase
    .from("orders")
    .select("id, payment_status, shipping_status, canceled_at")
    .eq("id", orderId)
    .maybeSingle();
  if (erroLeitura || !pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }

  if (pedido.canceled_at) {
    return { error: "Este pedido está cancelado. Não é possível mexer no envio." };
  }
  if (pedido.payment_status !== "paid") {
    return { error: "Este pedido não está pago. Não é possível mexer no envio." };
  }

  const atual = pedido.shipping_status as ShippingStatusValue;
  const validacao = validarTransicaoEnvio(atual, novoEnvio as ShippingStatusValue);
  if (!validacao.ok) {
    return { error: validacao.erro };
  }

  const { data: aplicado, error: erroUpdate } = await supabase
    .from("orders")
    .update({ shipping_status: novoEnvio, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    // Mesma defesa de corrida do webhook e da emissão de etiqueta: só aplica
    // se a situação ainda for a que esta tela leu — evita duas abas do admin
    // resolvendo a mesma transição uma em cima da outra.
    .eq("shipping_status", atual)
    .select("id")
    .maybeSingle();

  if (erroUpdate || !aplicado) {
    return {
      error:
        "Não foi possível atualizar. A situação do pedido pode ter mudado em outra aba — recarregue a página.",
    };
  }

  await registrarAuditoria(supabase, {
    action: "pedido.marcar_envio",
    entityType: "orders",
    entityId: orderId,
    diff: { de: ENVIO_LABEL[atual], para: ENVIO_LABEL[novoEnvio as ShippingStatusValue] },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin");
  return { ok: true };
}

const cancelarSchema = z.object({
  orderId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Escreva o motivo do cancelamento.").max(500),
});

export type CancelarPedidoInput = z.infer<typeof cancelarSchema>;

/**
 * Cancelar NÃO apaga nada — grava data e motivo, e o pedido continua na aba
 * de cancelados com todo o histórico. Pedido some é pedido que ninguém
 * consegue explicar ao cliente depois.
 *
 * Um pedido cujo envio já saiu não é cancelável por aqui: aquilo é
 * devolução, um fluxo com outras regras (e outro dinheiro), e fingir que um
 * botão resolve seria pior que não ter o botão.
 */
export async function cancelarPedidoAction(
  input: CancelarPedidoInput
): Promise<AcaoPedidoResultado> {
  const parsed = cancelarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { orderId, motivo } = parsed.data;
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("orders")
    .select("id, shipping_status, canceled_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }
  if (pedido.canceled_at) {
    return { error: "Este pedido já está cancelado." };
  }
  if (["shipped", "delivered"].includes(pedido.shipping_status as string)) {
    return {
      error:
        "Este pedido já foi enviado. Cancelar aqui não traz a encomenda de volta — trate como devolução com o cliente.",
    };
  }

  const { data: aplicado, error: erroUpdate } = await supabase
    .from("orders")
    .update({
      canceled_at: new Date().toISOString(),
      cancel_reason: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("canceled_at", null)
    .select("id")
    .maybeSingle();

  if (erroUpdate || !aplicado) {
    return { error: "Não foi possível cancelar. Recarregue a página e tente de novo." };
  }

  await registrarAuditoria(supabase, {
    action: "pedido.cancelar",
    entityType: "orders",
    entityId: orderId,
    diff: { motivo },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Marca as vendas como VISTAS — só apaga o contador do menu.
 *
 * Deliberadamente não toca em status nenhum: ver uma venda não a prepara,
 * não a paga e não a envia. Misturar as duas coisas faria o simples ato de
 * abrir a tela mudar a situação de um pedido, que é exatamente o tipo de
 * efeito colateral que ninguém espera de "dar uma olhada".
 */
export async function marcarVendasVistasAction(): Promise<AcaoPedidoResultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ seen_at: new Date().toISOString() })
    .is("seen_at", null)
    .eq("payment_status", "paid");
  if (error) {
    return { error: "Não foi possível marcar como visto." };
  }
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
  return { ok: true };
}
