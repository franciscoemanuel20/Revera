import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { FocusNfeProvider, type FocusEnvironment } from "./focus-nfe";

/** Consulta a fonte fiscal imediatamente antes de uma ação física irreversível. */
export async function exigirFocusAutorizadaRecente(orderId: string): Promise<{ ok: true } | { error: string }> {
  const db = createAdminClient();
  const { data: row } = await db.from("order_focus_nfe").select("id,reference,environment,status,access_key")
    .eq("order_id", orderId).maybeSingle();
  if (!row || row.status !== "authorized" || !row.access_key)
    return { error: "NF-e Focus não está autorizada para este pedido." };
  const consultationNonce = randomUUID();
  const { error: resetError } = await db.from("order_focus_nfe").update({
    consulted_at: null, consultation_nonce: consultationNonce,
  })
    .eq("id", row.id).eq("status", "authorized");
  if (resetError) return { error: "Não foi possível invalidar a confirmação fiscal anterior." };
  let result;
  try {
    result = await new FocusNfeProvider(row.environment as FocusEnvironment,
      process.env.FOCUS_NFE_TOKEN ?? "").consult(row.reference);
  } catch {
    return { error: "Não foi possível confirmar a NF-e na Focus agora. Remessa e despacho bloqueados." };
  }
  const consultedAt = new Date().toISOString();
  if (result.status === "cancelled") {
    const { error } = await db.from("order_focus_nfe").update({ status: "cancelled",
      response_sanitized: result.safeResponse, consulted_at: consultedAt, updated_at: consultedAt })
      .eq("id", row.id).eq("status", "authorized");
    if (!error) await db.from("order_focus_nfe_events").insert({ focus_nfe_id: row.id,
      event: "cancelled_detected", safe_detail: { source: "pre_shipping_check" } });
    return { error: "NF-e cancelada na Focus. Remessa e despacho bloqueados." };
  }
  if (result.status !== "authorized" || result.accessKey !== row.access_key)
    return { error: "Status ou chave da NF-e divergente na Focus. Remessa e despacho bloqueados." };
  const { data: saved, error } = await db.from("order_focus_nfe").update({
    consulted_at: consultedAt, response_sanitized: result.safeResponse, updated_at: consultedAt,
  }).eq("id", row.id).eq("status", "authorized")
    .eq("consultation_nonce", consultationNonce).select("id").maybeSingle();
  return error || !saved ? { error: "Não foi possível registrar a confirmação fiscal recente." } : { ok: true };
}
