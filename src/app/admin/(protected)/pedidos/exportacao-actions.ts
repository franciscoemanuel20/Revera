"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { carregarProcessosExportacao } from "@/lib/internacional/processo-exportacao-server";

type Resultado = { ok: true } | { error: string };
const uuid = z.string().uuid();
async function admin() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const { data } = await s.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  return data ? { s, user } : null;
}
const atualizar = (id: string) => { revalidatePath(`/admin/pedidos/${id}`); revalidatePath("/admin/pedidos"); };

export async function reconciliarReservaDhlAction(input: unknown): Promise<Resultado> {
  const p = z.object({ orderId: uuid }).safeParse(input);
  if (!p.success) return { error: "Pedido inválido." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const { data, error } = await a.s.rpc("reconcile_stale_dhl_reservation", { p_order_id: p.data.orderId });
  if (error) return { error: error.message };
  await registrarAuditoria(a.s, { action: "pedido.reconciliar_reserva_dhl", entityType: "orders", entityId: p.data.orderId,
    diff: { resultado: data } });
  atualizar(p.data.orderId);
  return { ok: true };
}

export async function reconciliarModoInvoiceLegadoAction(input: unknown): Promise<Resultado> {
  const p = z.object({ orderId: uuid }).safeParse(input);
  if (!p.success) return { error: "Pedido inválido." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const { error } = await a.s.rpc("reconcile_legacy_shipment_invoice_mode", { p_order_id: p.data.orderId });
  if (error) return { error: error.message };
  atualizar(p.data.orderId);
  return { ok: true };
}

const itemSchema = z.object({ orderId: uuid, itemId: uuid, ncm: z.string().regex(/^\d{8}$/),
  hsCode: z.string().regex(/^\d{6,10}$/), origin: z.string().regex(/^[A-Z]{2}$/),
  descriptionEn: z.string().trim().min(3), netWeightG: z.number().int().positive(),
  customsValueCents: z.number().int().positive(), fiscalValueBrlCents: z.number().int().positive(),
  fxRate: z.number().positive(), fxSource: z.string().trim().min(3), fxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export async function salvarItemExportacaoAction(input: unknown): Promise<Resultado> {
  const p = itemSchema.safeParse(input); if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const d = p.data;
  if (Math.abs(Math.round(d.customsValueCents * d.fxRate) - d.fiscalValueBrlCents) > 1)
    return { error: "Valor fiscal em reais não corresponde ao valor aduaneiro e à taxa informada." };
  const [{ data: linha }, { data: pedido }, { data: docs }, { data: envio }] = await Promise.all([
    a.s.from("order_items").select("id,quantity").eq("id", d.itemId).eq("order_id", d.orderId).maybeSingle(),
    a.s.from("orders").select("shipping_status,canceled_at").eq("id", d.orderId).maybeSingle(),
    a.s.from("order_export_documents").select("kind").eq("order_id", d.orderId).limit(1),
    a.s.from("shipments").select("id").eq("order_id", d.orderId).limit(1),
  ]);
  if (!linha || !pedido || pedido.canceled_at || ["shipped", "delivered"].includes(pedido.shipping_status)) return { error: "Pedido ou item indisponível." };
  if (d.customsValueCents % linha.quantity !== 0) return { error: "Distribua o valor aduaneiro em centavos igualmente entre as unidades deste item." };
  if (docs?.length || envio?.length) return { error: "Já existe documento ou remessa. Corrigir este snapshot exige reconciliação fiscal antes de alterar o pedido." };
  const { error } = await a.s.from("order_export_items").upsert({ order_item_id: d.itemId, order_id: d.orderId,
    ncm: d.ncm, hs_code: d.hsCode, country_of_origin: d.origin, description_en: d.descriptionEn,
    net_weight_g: d.netWeightG, customs_value_cents: d.customsValueCents,
    fiscal_value_brl_cents: d.fiscalValueBrlCents, fx_rate_brl_per_unit: d.fxRate,
    fx_source: d.fxSource, fx_date: d.fxDate,
    validated_by: a.user.id, validated_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) return { error: "Não foi possível salvar o item fiscal." };
  await registrarAuditoria(a.s, { action: "exportacao.validar_item", entityType: "orders", entityId: d.orderId,
    diff: { item_id: d.itemId, ncm: d.ncm, hs_code: d.hsCode, origin: d.origin,
      customs_value_cents: d.customsValueCents, fiscal_value_brl_cents: d.fiscalValueBrlCents,
      fx_rate: d.fxRate, fx_source: d.fxSource, fx_date: d.fxDate } });
  atualizar(d.orderId); return { ok: true };
}

const pacoteSchema = z.object({ orderId: uuid, grossWeightG: z.number().int().positive(),
  lengthCm: z.number().positive(), widthCm: z.number().positive(), heightCm: z.number().positive(),
  incoterm: z.enum(["DAP", "DDP"]) });
export async function salvarPacoteExportacaoAction(input: unknown): Promise<Resultado> {
  const p = pacoteSchema.safeParse(input); if (!p.success) return { error: "Peso ou dimensões inválidos." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const d = p.data;
  const processo = (await carregarProcessosExportacao(a.s, [d.orderId])).get(d.orderId);
  if (!processo?.entrada.internacional || processo.entrada.cancelado) return { error: "Pedido internacional indisponível." };
  const liquido = processo.entrada.itens.reduce((sum, i) => sum + i.net_weight_g * (processo.entrada.linhas.find(l => l.id === i.order_item_id)?.quantity ?? 0), 0);
  if (d.grossWeightG < liquido) return { error: "O peso bruto não pode ser menor que o peso líquido dos itens." };
  const [{ data: docs }, { data: envio }] = await Promise.all([
    a.s.from("order_export_documents").select("kind").eq("order_id", d.orderId).limit(1),
    a.s.from("shipments").select("id").eq("order_id", d.orderId).limit(1),
  ]);
  if (docs?.length || envio?.length) return { error: "Já existe documento ou remessa; confira antes de mudar a embalagem." };
  const { error } = await a.s.from("order_export_packages").upsert({ order_id: d.orderId,
    gross_weight_g: d.grossWeightG, length_cm: d.lengthCm, width_cm: d.widthCm, height_cm: d.heightCm,
    incoterm: d.incoterm,
    measured_by: a.user.id, measured_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) return { error: "Não foi possível salvar a embalagem." };
  await registrarAuditoria(a.s, { action: "exportacao.medir_pacote", entityType: "orders", entityId: d.orderId,
    diff: { gross_weight_g: d.grossWeightG, length_cm: d.lengthCm, width_cm: d.widthCm, height_cm: d.heightCm,
      incoterm: d.incoterm } });
  atualizar(d.orderId); return { ok: true };
}

const docSchema = z.object({ orderId: uuid, kind: z.enum(["nfe", "invoice", "declaration"]),
  reference: z.string().trim().min(1).max(100), regime: z.enum(["DRE", "DUE"]).nullable(),
  source: z.enum(["external", "dhl"]).default("external") });
const BUCKET = "export-documents";
export async function anexarDocumentoExportacaoAction(form: FormData): Promise<Resultado> {
  const p = docSchema.safeParse({ orderId: form.get("orderId"), kind: form.get("kind"),
    reference: form.get("reference"), regime: form.get("regime") || null,
    source: form.get("source") || "external" });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Documento inválido." };
  const d = p.data; if (d.kind === "declaration" && !d.regime) return { error: "Informe DRE ou DU-E." };
  if (d.source === "dhl") return { error: "Invoice DHL exige PDF retornado pela API e registrado na remessa." };
  if (d.kind === "nfe" && !/^\d{44}$/.test(d.reference)) return { error: "A chave da NF-e deve ter 44 dígitos." };
  const arquivo = form.get("file");
  if (!(arquivo instanceof File) || !arquivo.size || arquivo.size > 10_000_000) return { error: "Envie um PDF ou imagem de até 10 MB." };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!pdf && !png && !jpg) return { error: "Formato de arquivo inválido." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const processo = (await carregarProcessosExportacao(a.s, [d.orderId])).get(d.orderId);
  if (!processo?.entrada.internacional || processo.entrada.cancelado) return { error: "Pedido internacional indisponível." };
  if (d.kind === "invoice" && d.source === "external" && processo.entrada.rastreio &&
      processo.entrada.invoiceModeForOrder === "api")
    return { error: "Esta remessa exige invoice devolvida pela API DHL. Consulte a DHL para resolver a emissão." };
  const atual = processo.entrada.documentos.find(x => x.kind === d.kind);
  if (atual?.status === "verified") return { error: "Documento já conferido. Uma substituição exige reconciliação fiscal." };
  if (atual?.status === "pending") return { error: "Documento já aguarda conferência. Rejeite antes de substituí-lo." };
  const ext = pdf ? "pdf" : png ? "png" : "jpg";
  const path = `${d.orderId}/${d.kind}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await a.s.storage.from(BUCKET).upload(path, bytes,
    { contentType: pdf ? "application/pdf" : png ? "image/png" : "image/jpeg", upsert: false });
  if (uploadError) return { error: "Não foi possível guardar o documento privado." };
  const payload = { order_id: d.orderId, kind: d.kind,
    source: d.source, status: "pending", reference: d.reference, storage_path: path, regime: d.regime,
    validated_by: null, validated_at: null, updated_at: new Date().toISOString() };
  const gravacao = atual
    ? await a.s.from("order_export_documents").update(payload).eq("order_id", d.orderId).eq("kind", d.kind)
        .eq("status", "rejected").eq("storage_path", atual.storage_path).select("order_id").maybeSingle()
    : await a.s.from("order_export_documents").insert(payload).select("order_id").maybeSingle();
  if (gravacao.error || !gravacao.data) { await a.s.storage.from(BUCKET).remove([path]); return { error: "O documento mudou em outra aba. Recarregue antes de anexar." }; }
  if (atual?.storage_path && atual.storage_path !== path) await a.s.storage.from(BUCKET).remove([atual.storage_path]);
  await registrarAuditoria(a.s, { action: "exportacao.anexar_documento", entityType: "orders", entityId: d.orderId,
    diff: { kind: d.kind, source: d.source, reference: d.reference, regime: d.regime, storage_path: path } });
  atualizar(d.orderId); return { ok: true };
}

export async function conferirDocumentoExportacaoAction(input: unknown): Promise<Resultado> {
  const p = z.object({ orderId: uuid, kind: z.enum(["nfe", "invoice", "declaration"]), aprovado: z.boolean() }).safeParse(input);
  if (!p.success) return { error: "Documento inválido." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const d = p.data;
  const { data: doc } = await a.s.from("order_export_documents").select("storage_path,reference,status")
    .eq("order_id", d.orderId).eq("kind", d.kind).maybeSingle();
  if (!doc || doc.status !== "pending") return { error: "Documento não está aguardando conferência." };
  const { data: signed, error: fileError } = await a.s.storage.from(BUCKET).createSignedUrl(doc.storage_path, 30);
  if (fileError || !signed) return { error: "Arquivo indisponível. A conferência foi bloqueada." };
  const { data: aplicado, error } = await a.s.from("order_export_documents").update({ status: d.aprovado ? "verified" : "rejected",
    validated_by: d.aprovado ? a.user.id : null, validated_at: d.aprovado ? new Date().toISOString() : null,
    updated_at: new Date().toISOString() }).eq("order_id", d.orderId).eq("kind", d.kind).eq("status", "pending")
    .eq("storage_path", doc.storage_path).select("order_id").maybeSingle();
  if (error || !aplicado) return { error: "O documento mudou em outra aba. Recarregue antes de conferir." };
  await registrarAuditoria(a.s, { action: "exportacao.conferir_documento", entityType: "orders", entityId: d.orderId,
    diff: { kind: d.kind, reference: doc.reference, aprovado: d.aprovado } });
  atualizar(d.orderId); return { ok: true };
}
