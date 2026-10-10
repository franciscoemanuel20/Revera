"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { carregarProcessosExportacao } from "@/lib/internacional/processo-exportacao-server";
import { FocusNfeProvider, FocusRequestError, focusReference, type FocusEnvironment, type FocusResult } from "@/lib/fiscal/focus-nfe";
import { amountBlockers, focusBlockers, validateFocusPayload, type FiscalAmounts, type FiscalSettings } from "@/lib/fiscal/focus-validation";
import { issueWithPermanentReservation } from "@/lib/fiscal/focus-idempotency";
import { reconcileFocusDocumentLink } from "@/lib/fiscal/focus-document-link";

const uuid = z.string().uuid();
const inputSchema = z.object({ orderId: uuid, confirmed: z.literal(true), payloadJson: z.string().min(2).max(65536) });
type Result = { ok: true; message: string } | { error: string };
const refresh = (id: string) => revalidatePath(`/admin/pedidos/${id}`);
async function admin() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const { data } = await s.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  return data ? { s, user } : null;
}
function ambiente(): FocusEnvironment | null {
  return process.env.FOCUS_NFE_AMBIENTE === "homologacao" || process.env.FOCUS_NFE_AMBIENTE === "producao"
    ? process.env.FOCUS_NFE_AMBIENTE : null;
}
function provider(environment: FocusEnvironment): FocusNfeProvider {
  return new FocusNfeProvider(environment, process.env.FOCUS_NFE_TOKEN ?? "");
}
function failure(error: unknown): string {
  return error instanceof FocusRequestError ? error.message : "Operação Focus indisponível; consulte o estado da referência.";
}
async function event(db: ReturnType<typeof createAdminClient>, id: string, name: string,
  actor: string, safeDetail: Record<string, unknown> = {}) {
  await db.from("order_focus_nfe_events").insert({ focus_nfe_id: id, event: name,
    actor, safe_detail: safeDetail });
}
function statusFrom(result: FocusResult) {
  return result.status === "authorized" && !/^[0-9]{44}$/.test(result.accessKey ?? "")
    ? "response_unknown" : result.status === "processing" ? "processing"
      : result.status === "authorized" ? "authorized"
        : result.status === "rejected" ? "rejected"
          : result.status === "cancelled" ? "cancelled" : "response_unknown";
}
async function applyResult(db: ReturnType<typeof createAdminClient>, row: { id: string; order_id: string; status: string },
  result: FocusResult, actor: string, reconciled: boolean, consultationNonce?: string) {
  const status = statusFrom(result);
  let update = db.from("order_focus_nfe").update({ status,
    number: result.number, series: result.series, access_key: result.accessKey,
    protocol: result.protocol, rejection_reason: result.rejection,
    response_sanitized: result.safeResponse,
    consulted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...(status === "authorized" ? { authorized_at: new Date().toISOString() } : {}),
  }).eq("id", row.id).neq("status", "cancelled");
  if (consultationNonce) update = update.eq("consultation_nonce", consultationNonce);
  const { data: saved, error } = await update.select("id").maybeSingle();
  if (error || !saved) throw new Error("Falha ao persistir resposta Focus atual.");
  await event(db, row.id, status === "authorized" ? "authorized" : status === "rejected" ? "rejected"
    : status === "processing" ? "processing" : "response_unknown", actor,
    { status_focus: result.rawStatus });
  if (reconciled) await event(db, row.id, "reconciled", actor, { status });
}

export async function emitirFocusNfeAction(input: unknown): Promise<Result> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Confirme explicitamente a emissão e forneça o JSON fiscal revisado." };
  const { orderId, payloadJson } = parsed.data;
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const env = ambiente();
  if (process.env.FOCUS_NFE_ISSUANCE_ENABLED !== "1" || !env)
    return { error: "WAITING_FOR_OWNER: emissão Focus desabilitada no ambiente." };
  if (env === "producao" && process.env.FOCUS_NFE_PRODUCTION_APPROVED !== "1")
    return { error: "WAITING_FOR_OWNER: produção Focus não habilitada para emissão." };
  let focus: FocusNfeProvider;
  try { focus = provider(env); } catch { return { error: "Token Focus indisponível neste ambiente." }; }
  const processo = (await carregarProcessosExportacao(a.s, [orderId])).get(orderId);
  if (!processo) return { error: "Pedido indisponível." };
  const { data: config } = await a.s.from("focus_nfe_settings").select("*").eq("singleton", true).maybeSingle();
  const { data: amounts } = await a.s.from("order_focus_amounts").select("*").eq("order_id", orderId).maybeSingle();
  const blockers = focusBlockers(processo.entrada, config as FiscalSettings | null,
    amounts as FiscalAmounts | null);
  if (blockers.length) return { error: blockers.join(" ") };
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(payloadJson); } catch { return { error: "JSON fiscal inválido." }; }
  const invalid = validateFocusPayload(payload, processo.entrada, config as FiscalSettings, amounts as FiscalAmounts);
  if (invalid.length) return { error: invalid.join(" ") };
  const { data: existingDoc } = await a.s.from("order_export_documents").select("reference")
    .eq("order_id", orderId).eq("kind", "nfe").maybeSingle();
  if (existingDoc) return { error: "Este pedido já tem NF-e vinculada. Confira antes de qualquer emissão." };
  const db = createAdminClient();
  const reference = focusReference(orderId);
  const outcome = await issueWithPermanentReservation(async () => {
    const { data, error } = await db.from("order_focus_nfe").insert({
      order_id: orderId, reference, environment: env, status: "reserved_unsent",
      request_snapshot: { payload, order: {
        id: orderId, lines: processo.entrada.linhas, items: processo.entrada.itens,
        package: processo.entrada.pacote, destination: processo.entrada.destino,
        fiscal_settings: config, approved_amounts: amounts, contact: processo.entrada.contato,
        exporter: processo.entrada.exportador } }, requested_by: a.user.id,
    }).select("id,order_id,status").maybeSingle();
    return error ? null : data;
  }, async inserted => {
    await event(db, inserted.id, "issue_requested", a.user.id, { environment: env, reference });
    await registrarAuditoria(a.s, { action: "focus.emissao_solicitada", entityType: "orders", entityId: orderId,
      diff: { environment: env, reference } });
    // Releitura após a reserva detecta uma edição concluída antes do lock.
    const fresh = (await carregarProcessosExportacao(a.s, [orderId])).get(orderId);
    if (!fresh || JSON.stringify(fresh.entrada.itens) !== JSON.stringify(processo.entrada.itens) ||
      JSON.stringify(fresh.entrada.pacote) !== JSON.stringify(processo.entrada.pacote) ||
      JSON.stringify(fresh.entrada.destino) !== JSON.stringify(processo.entrada.destino) ||
      JSON.stringify(fresh.entrada.contato) !== JSON.stringify(processo.entrada.contato) ||
      JSON.stringify(fresh.entrada.exportador) !== JSON.stringify(processo.entrada.exportador) ||
      !fresh.entrada.pago || fresh.entrada.cancelado ||
      fresh.entrada.documentos.some(d => d.kind === "nfe"))
      throw new Error("Snapshot do pedido mudou antes da emissão; referência reservada para reconciliação manual.");
    const { data: freshAmounts } = await a.s.from("order_focus_amounts").select("*").eq("order_id", orderId).maybeSingle();
    if (JSON.stringify(freshAmounts) !== JSON.stringify(amounts) ||
      amountBlockers(fresh.entrada, freshAmounts as FiscalAmounts | null).length)
      throw new Error("Valores fiscais mudaram antes do POST Focus.");
    // Este update acontece antes do POST. Se o processo morrer depois dele,
    // a resposta é ambígua; se morrer antes, a reserva pode ser liberada.
    const { data: started, error } = await db.from("order_focus_nfe").update({
      status: "response_unknown", post_started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", inserted.id).eq("status", "reserved_unsent").is("post_started_at", null)
      .select("id").maybeSingle();
    if (error || !started) throw new Error("Não foi possível registrar início do POST Focus.");
  }, async () => focus.issueOnce(reference, payload));
  if (outcome.state === "existing") return { error: "Já existe tentativa de NF-e para este pedido. Consulte a referência; outra emissão está bloqueada." };
  if (outcome.state === "sent") {
    try { await applyResult(db, outcome.row, outcome.result, a.user.id, false); }
    catch { refresh(orderId); return { error: "Resposta recebida, mas persistência fiscal falhou. Consulte a referência." }; }
    refresh(orderId);
    return { ok: true, message: outcome.result.status === "authorized"
      ? "NF-e autorizada. Consulte para recuperar XML e DANFE privados."
      : "Solicitação registrada. Consulte a referência para acompanhar autorização ou rejeição." };
  }
  const { data: released } = await db.from("order_focus_nfe").delete().eq("id", outcome.row.id)
    .eq("status", "reserved_unsent").is("post_started_at", null).select("id").maybeSingle();
  if (released) {
    await registrarAuditoria(a.s, { action: "focus.reserva_nao_enviada_liberada", entityType: "orders", entityId: orderId,
      diff: { reference } });
    refresh(orderId);
    return { error: "A requisição não começou e a reserva foi liberada. Reconfira o pedido antes de tentar novamente." };
  }
  await event(db, outcome.row.id, "response_unknown", a.user.id, { reason: failure(outcome.error) });
  refresh(orderId);
  return { error: "Resposta de emissão desconhecida. A referência está reservada; use Consultar Focus. Não repita a emissão." };
}

export async function liberarReservaFocusNaoEnviadaAction(input: unknown): Promise<Result> {
  const p = z.object({ orderId: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!p.success) return { error: "Confirme a liberação da reserva." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const db = createAdminClient();
  const { data: row } = await db.from("order_focus_nfe").select("id,reference,status,post_started_at")
    .eq("order_id", p.data.orderId).maybeSingle();
  if (!row || row.status !== "reserved_unsent" || row.post_started_at)
    return { error: "A requisição pode ter começado. Consulte a Focus; esta reserva não pode ser liberada." };
  const { data: deleted, error } = await db.from("order_focus_nfe").delete().eq("id", row.id)
    .eq("status", "reserved_unsent").is("post_started_at", null).select("id").maybeSingle();
  if (error || !deleted) return { error: "A reserva mudou; recarregue e consulte a Focus." };
  await registrarAuditoria(a.s, { action: "focus.reserva_nao_enviada_liberada", entityType: "orders", entityId: p.data.orderId,
    diff: { reference: row.reference } });
  refresh(p.data.orderId);
  return { ok: true, message: "Reserva não enviada liberada. Reconfira os dados antes de emitir." };
}

const amountInput = z.object({ orderId: uuid, accountantConfirmed: z.literal(true),
  shippingTreatment: z.enum(["included","excluded"]),
  discountTreatment: z.enum(["included_in_items","separate"]),
  fxRate: z.number().positive(), fxSource: z.string().trim().min(3), fxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  freight: z.number().int().nonnegative(), discount: z.number().int().nonnegative(),
  insurance: z.number().int().nonnegative(), other: z.number().int().nonnegative(),
  ii: z.number().int().nonnegative(), ipi: z.number().int().nonnegative(),
  services: z.number().int().nonnegative(), icmsRelief: z.number().int().nonnegative(),
  icmsSt: z.number().int().nonnegative(),
});
export async function salvarValoresFocusAction(input: unknown): Promise<Result> {
  const p = amountInput.safeParse(input);
  if (!p.success) return { error: "Todos os componentes fiscais precisam de valor e validação do contador." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const processo = (await carregarProcessosExportacao(a.s, [p.data.orderId])).get(p.data.orderId);
  if (!processo?.entrada.internacional || !processo.entrada.pago || processo.entrada.cancelado)
    return { error: "Pedido internacional pago e não cancelado obrigatório." };
  const d = p.data;
  const amounts = {
    order_id: d.orderId,
    shipping_order_cents: processo.entrada.valorFretePedidoCents,
    discount_order_cents: processo.entrada.valorDescontoPedidoCents,
    shipping_treatment: d.shippingTreatment, discount_treatment: d.discountTreatment,
    fx_rate_brl_per_order_unit: d.fxRate, fx_source: d.fxSource, fx_date: d.fxDate,
    freight_brl_cents: d.freight, discount_brl_cents: d.discount,
    insurance_brl_cents: d.insurance, other_brl_cents: d.other,
    ii_brl_cents: d.ii, ipi_brl_cents: d.ipi, services_brl_cents: d.services,
    icms_relief_brl_cents: d.icmsRelief, icms_st_brl_cents: d.icmsSt,
    approved_by: a.user.id, approved_at: new Date().toISOString(),
  };
  if (amountBlockers(processo.entrada, amounts as FiscalAmounts).length)
    return { error: "Frete ou desconto em BRL não correspondem ao tratamento e câmbio informados." };
  const { data: existing } = await a.s.from("order_focus_nfe").select("id").eq("order_id", d.orderId).maybeSingle();
  if (existing) return { error: "Valores congelados após tentativa Focus." };
  const { error } = await a.s.from("order_focus_amounts").upsert(amounts);
  if (error) return { error: "Não foi possível salvar os valores fiscais." };
  await registrarAuditoria(a.s, { action: "focus.valores_fiscais_aprovados", entityType: "orders", entityId: d.orderId,
    diff: { shipping_treatment: d.shippingTreatment, discount_treatment: d.discountTreatment,
      fx_rate: d.fxRate, fx_source: d.fxSource, fx_date: d.fxDate,
      freight_brl_cents: d.freight, discount_brl_cents: d.discount,
      insurance_brl_cents: d.insurance, other_brl_cents: d.other, ii_brl_cents: d.ii,
      ipi_brl_cents: d.ipi, services_brl_cents: d.services,
      icms_relief_brl_cents: d.icmsRelief, icms_st_brl_cents: d.icmsSt } });
  refresh(d.orderId);
  return { ok: true, message: "Componentes fiscais aprovados para este pedido." };
}

export async function consultarFocusNfeAction(input: unknown): Promise<Result> {
  const parsed = z.object({ orderId: uuid }).safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido." };
  const a = await admin(); if (!a) return { error: "Acesso administrativo necessário." };
  const db = createAdminClient();
  const { data: row } = await db.from("order_focus_nfe").select("*").eq("order_id", parsed.data.orderId).maybeSingle();
  if (!row) return { error: "Nenhuma tentativa Focus para este pedido." };
  if (row.status === "reserved_unsent") return { error: "Nenhum POST Focus começou. Libere a reserva não enviada após conferir o snapshot." };
  let focus: FocusNfeProvider;
  try { focus = provider(row.environment as FocusEnvironment); } catch { return { error: "Token Focus indisponível para este ambiente." }; }
  // A consulta anterior deixa de autorizar ações físicas antes da chamada externa.
  const consultationNonce = randomUUID();
  const { error: attemptError } = await db.from("order_focus_nfe").update({
    consultation_attempts: row.consultation_attempts + 1, consultation_nonce: consultationNonce,
    consulted_at: null,
  }).eq("id", row.id);
  if (attemptError) return { error: "Não foi possível iniciar a consulta fiscal com segurança." };
  let result: FocusResult;
  try { result = await focus.consult(row.reference); }
  catch (error) {
    // Mesmo 404 não autoriza outro POST: o primeiro pedido pode estar em fila.
    await event(db, row.id, "response_unknown", a.user.id, { reason: failure(error) });
    return { error: "Consulta inconclusiva. A emissão permanece reservada; confira a referência na Focus." };
  }
  if (row.status === "authorized" && result.status === "cancelled") {
    const { data: cancelled, error } = await db.from("order_focus_nfe").update({ status: "cancelled",
      response_sanitized: result.safeResponse, consulted_at: new Date().toISOString(),
      updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "authorized")
      .eq("consultation_nonce", consultationNonce).select("id").maybeSingle();
    if (error || !cancelled) return { error: "Cancelamento detectado, mas não foi possível bloquear a NF-e local. Interrompa o despacho e consulte novamente." };
    await event(db, row.id, "cancelled_detected", a.user.id, { reference: row.reference });
    await registrarAuditoria(a.s, { action: "focus.cancelamento_detectado", entityType: "orders", entityId: row.order_id,
      diff: { reference: row.reference } });
    refresh(row.order_id);
    return { ok: true, message: "NF-e cancelada na Focus. Etiqueta e despacho estão bloqueados; reconcilie o pedido." };
  }
  if (row.status === "cancelled") return { error: "NF-e cancelada. Este pedido exige reconciliação fiscal antes de qualquer envio." };
  if (row.status === "authorized" && (result.status !== "authorized" || result.accessKey !== row.access_key))
    return { error: "A Focus não confirmou a autorização e chave desta NF-e. Remessa e despacho bloqueados até reconciliação." };
  if (row.status === "authorized") {
    const { data: confirmed, error: confirmError } = await db.from("order_focus_nfe").update({
      consulted_at: new Date().toISOString(), response_sanitized: result.safeResponse,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "authorized")
      .eq("consultation_nonce", consultationNonce).select("id").maybeSingle();
    if (confirmError || !confirmed) return { error: "Consulta substituída por outra tentativa; reconfirme a Focus." };
  }
  if (row.status !== "authorized" && row.status !== "cancelled") {
    try { await applyResult(db, row, result, a.user.id, true, consultationNonce); }
    catch { return { error: "Resposta obtida, mas persistência fiscal falhou. Consulte novamente." }; }
  }
  if (result.status === "authorized" && result.accessKey && result.xmlPath && result.danfePath) {
    const xmlPath = row.xml_storage_path ?? `${row.order_id}/focus/${row.reference}/${randomUUID()}.xml`;
    const danfePath = row.danfe_storage_path ?? `${row.order_id}/focus/${row.reference}/${randomUUID()}.pdf`;
    try {
      const [xml, danfe] = await Promise.all([
        row.xml_storage_path ? Promise.resolve(null) : focus.download(result.xmlPath),
        row.danfe_storage_path ? Promise.resolve(null) : focus.download(result.danfePath),
      ]);
      if (xml && !xml.toString("utf8", 0, 100).includes("<?xml") && !xml.toString("utf8", 0, 100).includes("<nfeProc"))
        throw new Error("XML inválido");
      if (danfe && danfe.subarray(0, 5).toString() !== "%PDF-") throw new Error("DANFE inválido");
      if (xml) { const { error } = await db.storage.from("export-documents").upload(xmlPath, xml,
        { contentType: "application/xml", upsert: false }); if (error) throw error; }
      if (danfe) { const { error } = await db.storage.from("export-documents").upload(danfePath, danfe,
        { contentType: "application/pdf", upsert: false }); if (error) throw error; }
      const { data: linked, error } = await db.from("order_focus_nfe").update({ xml_storage_path: xmlPath,
        danfe_storage_path: danfePath, documents_at: new Date().toISOString() }).eq("id", row.id)
        .eq("status", "authorized").eq("access_key", result.accessKey)
        .eq("consultation_nonce", consultationNonce).select("id").maybeSingle();
      if (error || !linked) throw new Error("Consulta fiscal substituída antes de vincular documentos");
      await event(db, row.id, "documents_retrieved", a.user.id);
      await reconcileFocusDocumentLink({ reference: result.accessKey, storage_path: danfePath }, async () => {
        const { data, error } = await db.from("order_export_documents")
          .select("reference,storage_path,source").eq("order_id", row.order_id).eq("kind", "nfe").maybeSingle();
        if (error) throw error;
        return data;
      }, async () => {
        const { error } = await db.from("order_export_documents").insert({ order_id: row.order_id, kind: "nfe",
          source: "external", status: "pending", reference: result.accessKey,
          storage_path: danfePath, regime: null });
        if (error) throw error;
      });
    } catch {
      refresh(row.order_id);
      return { error: "NF-e autorizada, mas XML ou DANFE não foram recuperados. Consulte novamente; a etiqueta permanece bloqueada." };
    }
  }
  refresh(row.order_id);
  return { ok: true, message: `Consulta concluída: ${result.rawStatus ?? "status desconhecido"}.` };
}
