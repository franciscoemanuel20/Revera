"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { shippingEmailDraft } from "@/lib/internacional/email-envio";
import { guiaDhlFinal } from "@/lib/shipping/dhl/paypal-tracking";
import { registrarAuditoria } from "@/lib/admin/audit";

export async function prepararComunicacaoEnvioAction(input: unknown): Promise<{ ok: true; message: string } | { error: string }> {
  const p = z.object({ orderId: z.string().uuid(), locale: z.enum(["pt","en","es","fr","de"]) }).safeParse(input);
  if (!p.success) return { error: "Pedido ou idioma inválido." };
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Acesso administrativo necessário." };
  const { data: admin } = await s.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  if (!admin) return { error: "Acesso administrativo necessário." };
  const { data: order } = await s.from("orders").select("order_number,shipments(provider,status,tracking_code)")
    .eq("id", p.data.orderId).maybeSingle();
  if (!order) return { error: "Pedido não encontrado." };
  const tracking = (order.shipments ?? []).map(guiaDhlFinal).find(Boolean);
  if (!tracking) return { error: "A comunicação exige guia DHL final." };
  const draft = shippingEmailDraft(p.data.locale, order.order_number, tracking);
  const { error } = await s.from("order_shipping_email_drafts").insert({ order_id: p.data.orderId,
    locale: p.data.locale, tracking_code: tracking, subject: draft.subject, body: draft.body,
    prepared_by: user.id });
  if (error) return { error: "Já existe um rascunho para este pedido ou não foi possível salvá-lo." };
  await registrarAuditoria(s, { action: "pedido.comunicacao_preparada", entityType: "orders", entityId: p.data.orderId,
    diff: { locale: p.data.locale, tracking } });
  revalidatePath(`/admin/pedidos/${p.data.orderId}`);
  return { ok: true, message: "Rascunho localizado salvo. Nenhum e-mail foi enviado." };
}
