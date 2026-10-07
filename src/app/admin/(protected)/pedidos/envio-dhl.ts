"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { enviarRastreioDhlAoPaypal, guiaDhlFinal } from "@/lib/shipping/dhl/paypal-tracking";
import { carregarProcessosExportacao } from "@/lib/internacional/processo-exportacao-server";
import { normalizarAwbDhl } from "@/lib/shipping/awb-dhl";

/**
 * Registrar o envio DHL de um pedido internacional (06/10/2026).
 *
 * A etiqueta internacional é emitida à mão no MyDHL+ — o painel não fala com
 * a DHL. Sem este registro, o número da guia nunca entrava no sistema: o
 * pedido ficava em "aguardando etiqueta" para sempre e o PayPal nunca recebia
 * o rastreio (o saldo da primeira venda, REV-7DA5CEBF, ficou retido por isso).
 *
 * Ordem das escritas: primeiro o NOSSO banco (envio + situação), depois o
 * PayPal. Se o PayPal falhar, o envio continua registrado e a tela diz que o
 * rastreio não chegou lá — dá para repetir. O contrário (PayPal com rastreio
 * e pedido sem envio) deixaria o painel mentindo.
 */

const schema = z.object({
  orderId: z.string().uuid(),
  awb: z.string().trim().min(1, "Cole o número da guia DHL."),
});

export type RegistrarEnvioDhlResultado =
  | { error: string }
  | { ok: true; paypal: "enviado" | "sem_paypal" | { falhou: string } };

export async function registrarEnvioDhlAction(input: unknown): Promise<RegistrarEnvioDhlResultado> {
  const parsed = schema.safeParse(input instanceof FormData
    ? { orderId: input.get("orderId"), awb: input.get("awb") } : input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  const awb = normalizarAwbDhl(parsed.data.awb);
  if (!awb) return { error: "Número de guia DHL inválido. A guia DHL Express tem 10 dígitos." };
  const { orderId } = parsed.data;

  // Sessão sob RLS: as policies de admin autorizam leitura e escrita.
  const supabase = await createClient();
  const { data: pedido, error: erroLeitura } = await supabase
    .from("orders")
    .select("id, payment_status, shipping_status, canceled_at, addresses(country), shipments(id, provider, status, tracking_code), payments(provider, status, provider_payment_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (erroLeitura || !pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }
  if (pedido.canceled_at) return { error: "Este pedido está cancelado." };
  if (pedido.payment_status !== "paid") return { error: "Este pedido não está pago." };

  const endereco = (Array.isArray(pedido.addresses) ? pedido.addresses[0] : pedido.addresses) as
    | { country?: string | null }
    | null;
  const pais = endereco?.country ?? "BR";
  if (pais === "BR") return { error: "Pedido nacional: a etiqueta sai pela SuperFrete, não por aqui." };
  const envios = (Array.isArray(pedido.shipments) ? pedido.shipments : pedido.shipments ? [pedido.shipments] : []) as Array<{
    id: string;
    provider: string;
    status: string | null;
    tracking_code: string | null;
  }>;
  const envioExistente = envios[0];
  if (envioExistente && envioExistente.provider !== "dhl") {
    return { error: "Pedido já tem remessa de outro provedor. Reconciliar antes de registrar guia DHL." };
  }
  if (envioExistente?.status === "creating") {
    return { error: "Criação DHL em andamento. Confira no MyDHL antes de registrar uma guia." };
  }
  if (envioExistente?.status === "creation_unknown") {
    return { error: "A tentativa DHL tem resposta incerta. Use a reconciliação com comprovante da consulta ao MyDHL." };
  }
  const guiaExistente = envioExistente ? guiaDhlFinal(envioExistente) : null;
  if (envioExistente?.tracking_code && !guiaExistente) {
    return { error: "A remessa existente tem rastreio, mas não está confirmada como guia DHL final. Reconcilie no MyDHL antes de reenviar ao PayPal." };
  }
  if (guiaExistente && guiaExistente !== awb) {
    return {
      error: `Este pedido já tem a guia ${guiaExistente}. Trocar a guia não é feito por aqui.`,
    };
  }

  const atual = pedido.shipping_status as string;
  const repetindo = guiaExistente === awb;
  if (!repetindo) {
    const processo = (await carregarProcessosExportacao(supabase, [orderId])).get(orderId);
    if (!processo?.avaliacao.podeRegistrarGuia) {
      return { error: processo?.avaliacao.bloqueiosGuia.join(" ") ?? "Exportação indisponível." };
    }
  }
  if (!repetindo && atual !== "awaiting_label" && atual !== "shipping_error") {
    return { error: "A situação do envio não permite registrar guia agora. Recarregue a página." };
  }

  let lookupReference: string | null = null;
  let evidencePath: string | null = null;
  if (!repetindo) {
    if (!(input instanceof FormData)) return { error: "Anexe o comprovante da guia manual no MyDHL." };
    const ref = z.string().trim().min(3).max(120).safeParse(input.get("lookupReference"));
    const file = input.get("file");
    if (!ref.success || !(file instanceof File) || file.size === 0 || file.size > 10_000_000)
      return { error: "Informe a referência e anexe o comprovante MyDHL em PDF ou imagem de até 10 MB." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!pdf && !png && !jpg) return { error: "Comprovante MyDHL inválido." };
    lookupReference = ref.data;
    evidencePath = `${orderId}/manual/${randomUUID()}.${pdf ? "pdf" : png ? "png" : "jpg"}`;
    const upload = await supabase.storage.from("export-documents").upload(evidencePath, bytes,
      { contentType: pdf ? "application/pdf" : png ? "image/png" : "image/jpeg", upsert: false });
    if (upload.error) return { error: "Não foi possível guardar o comprovante privado." };
  }
  const { error: registroError } = await supabase.rpc("register_dhl_awb_atomic", {
    p_order_id: orderId, p_awb: awb, p_expected_shipping: atual,
    p_lookup_reference: lookupReference, p_evidence_path: evidencePath });
  if (registroError) {
    if (evidencePath) await supabase.storage.from("export-documents").remove([evidencePath]);
    return { error: `Não foi possível registrar a guia: ${registroError.message}` };
  }
  if (!repetindo) {
    await registrarAuditoria(supabase, {
      action: "pedido.registrar_envio_dhl",
      entityType: "orders",
      entityId: orderId,
      diff: { guia: awb },
    });
  }

  // PayPal: só quando a venda foi paga por ele.
  const pagamentos = (Array.isArray(pedido.payments) ? pedido.payments : []) as Array<{
    provider: string;
    status: string;
    provider_payment_id: string | null;
  }>;
  const resultadoPaypal = await enviarRastreioDhlAoPaypal(pagamentos, orderId, awb);
  if (resultadoPaypal !== "sem_paypal") {
    await registrarAuditoria(supabase, {
      action: "pedido.rastreio_paypal",
      entityType: "orders",
      entityId: orderId,
      diff: { guia: awb, resultado: typeof resultadoPaypal === "string" ? resultadoPaypal : resultadoPaypal.falhou },
    });
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, paypal: resultadoPaypal };
}

/** Vincula uma resposta incerta somente após consulta documentada no MyDHL. */
export async function reconciliarGuiaDhlAction(form: FormData): Promise<{ ok: true } | { error: string }> {
  const parsed = z.object({ orderId: z.string().uuid(), awb: z.string().trim(),
    lookupReference: z.string().trim().min(3).max(120) }).safeParse({
    orderId: form.get("orderId"), awb: form.get("awb"), lookupReference: form.get("lookupReference") });
  if (!parsed.success) return { error: "Pedido, guia e referência da consulta MyDHL são necessários." };
  const awb = normalizarAwbDhl(parsed.data.awb);
  if (!awb) return { error: "Guia DHL inválida." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10_000_000) return { error: "Anexe o comprovante MyDHL em PDF ou imagem de até 10 MB." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!pdf && !png && !jpg) return { error: "Comprovante MyDHL inválido." };
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Acesso administrativo necessário." };
  const { data: admin } = await s.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  if (!admin) return { error: "Acesso administrativo necessário." };
  const { data: order } = await s.from("orders").select("id,payment_status,canceled_at,shipping_status,shipments(id,provider,status,tracking_code,metadata)")
    .eq("id", parsed.data.orderId).maybeSingle();
  if (!order || order.payment_status !== "paid" || order.canceled_at) return { error: "Pedido não está pago ou foi cancelado." };
  const shipment = (Array.isArray(order.shipments) ? order.shipments[0] : order.shipments) as
    { id: string; provider: string; status: string; tracking_code: string | null; metadata: Record<string, unknown> } | null;
  if (!shipment || shipment.provider !== "dhl" || shipment.status !== "creation_unknown" || shipment.tracking_code)
    return { error: "Não há tentativa DHL incerta para reconciliar." };
  const retornada = shipment.metadata?.tracking_code_returned;
  if (typeof retornada === "string" && normalizarAwbDhl(retornada) !== awb)
    return { error: `A DHL retornou a guia ${retornada}. Confira esse mesmo AWB no MyDHL antes de reconciliar.` };
  const path = `${parsed.data.orderId}/reconciliation/${shipment.id}/${randomUUID()}.${pdf ? "pdf" : png ? "png" : "jpg"}`;
  const upload = await s.storage.from("export-documents").upload(path, bytes,
    { contentType: pdf ? "application/pdf" : png ? "image/png" : "image/jpeg", upsert: false });
  if (upload.error) return { error: "Não foi possível guardar o comprovante privado." };
  const { error } = await s.rpc("register_dhl_awb_atomic", {
    p_order_id: parsed.data.orderId, p_awb: awb, p_expected_shipping: order.shipping_status,
    p_lookup_reference: parsed.data.lookupReference, p_evidence_path: path });
  if (error) {
    await s.storage.from("export-documents").remove([path]);
    return { error: `A tentativa mudou antes da reconciliação: ${error.message}` };
  }
  await registrarAuditoria(s, { action: "pedido.reconciliar_guia_dhl", entityType: "orders", entityId: parsed.data.orderId,
    diff: { guia: awb, consulta: parsed.data.lookupReference, comprovante: path, tentativa: shipment.id } });
  revalidatePath("/admin/pedidos"); revalidatePath(`/admin/pedidos/${parsed.data.orderId}`);
  return { ok: true };
}
