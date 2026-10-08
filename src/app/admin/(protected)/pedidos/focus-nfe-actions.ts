"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { carregarProcessosExportacao } from "@/lib/internacional/processo-exportacao-server";
import { FocusNfeProvider, FocusRequestError, focusReference, type FocusEnvironment, type FocusResult } from "@/lib/fiscal/focus-nfe";
import { focusBlockers, validateFocusPayload, type FiscalSettings } from "@/lib/fiscal/focus-validation";
import { issueWithPermanentReservation } from "@/lib/fiscal/focus-idempotency";

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
  result: FocusResult, actor: string, reconciled: boolean) {
  const status = statusFrom(result);
  const { error } = await db.from("order_focus_nfe").update({ status,
    number: result.number, series: result.series, access_key: result.accessKey,
    protocol: result.protocol, rejection_reason: result.rejection,
    response_sanitized: result.safeResponse,
    consulted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...(status === "authorized" ? { authorized_at: new Date().toISOString() } : {}),
  }).eq("id", row.id).neq("status", "cancelled");
  if (error) throw new Error("Falha ao persistir resposta Focus.");
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
  const blockers = focusBlockers(processo.entrada, config as FiscalSettings | null);
  if (blockers.length) return { error: blockers.join(" ") };
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(payloadJson); } catch { return { error: "JSON fiscal inválido." }; }
  const invalid = validateFocusPayload(payload, processo.entrada, config as FiscalSettings);
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
        fiscal_settings: config } }, requested_by: a.user.id,
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
  await db.from("order_focus_nfe").update({ consultation_attempts: row.consultation_attempts + 1,
    consulted_at: new Date().toISOString() }).eq("id", row.id);
  let result: FocusResult;
  try { result = await focus.consult(row.reference); }
  catch (error) {
    // Mesmo 404 não autoriza outro POST: o primeiro pedido pode estar em fila.
    await event(db, row.id, "response_unknown", a.user.id, { reason: failure(error) });
    return { error: "Consulta inconclusiva. A emissão permanece reservada; confira a referência na Focus." };
  }
  if (row.status === "authorized" && result.status === "cancelled") {
    const { error } = await db.from("order_focus_nfe").update({ status: "cancelled",
      response_sanitized: result.safeResponse, consulted_at: new Date().toISOString(),
      updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "authorized");
    if (error) return { error: "Cancelamento detectado, mas não foi possível bloquear a NF-e local. Interrompa o despacho e consulte novamente." };
    await event(db, row.id, "cancelled_detected", a.user.id, { reference: row.reference });
    await registrarAuditoria(a.s, { action: "focus.cancelamento_detectado", entityType: "orders", entityId: row.order_id,
      diff: { reference: row.reference } });
    refresh(row.order_id);
    return { ok: true, message: "NF-e cancelada na Focus. Etiqueta e despacho estão bloqueados; reconcilie o pedido." };
  }
  if (row.status === "cancelled") return { error: "NF-e cancelada. Este pedido exige reconciliação fiscal antes de qualquer envio." };
  if (row.status !== "authorized" && row.status !== "cancelled") {
    try { await applyResult(db, row, result, a.user.id, true); }
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
      const { error } = await db.from("order_focus_nfe").update({ xml_storage_path: xmlPath,
        danfe_storage_path: danfePath, documents_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      await event(db, row.id, "documents_retrieved", a.user.id);
      const { data: doc } = await a.s.from("order_export_documents").select("kind")
        .eq("order_id", row.order_id).eq("kind", "nfe").maybeSingle();
      if (!doc) await db.from("order_export_documents").insert({ order_id: row.order_id, kind: "nfe",
        source: "external", status: "pending", reference: result.accessKey,
        storage_path: danfePath, regime: null });
    } catch {
      refresh(row.order_id);
      return { error: "NF-e autorizada, mas XML ou DANFE não foram recuperados. Consulte novamente; a etiqueta permanece bloqueada." };
    }
  }
  refresh(row.order_id);
  return { ok: true, message: `Consulta concluída: ${result.rawStatus ?? "status desconhecido"}.` };
}
