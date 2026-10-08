"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";

const schema = z.object({
  cfop: z.string().trim().max(4), natureza_operacao: z.string().trim().max(120),
  tributacao: z.string().trim().max(120), regime_exportacao: z.string().trim().max(120),
  serie: z.string().trim().max(10), numeracao: z.string().trim().max(120),
  emitente_confirmado: z.boolean(), contador_validou: z.boolean(),
});
export async function salvarConfiguracaoFocusAction(input: unknown): Promise<{ ok: true } | { error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Configuração fiscal inválida." };
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Acesso administrativo necessário." };
  const { data: admin } = await s.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  if (!admin) return { error: "Acesso administrativo necessário." };
  const d = parsed.data;
  if (d.cfop && !/^\d{4}$/.test(d.cfop)) return { error: "CFOP deve ter quatro dígitos." };
  if ((d.emitente_confirmado || d.contador_validou) &&
    [d.cfop, d.natureza_operacao, d.tributacao, d.regime_exportacao, d.serie, d.numeracao].some(x => !x))
    return { error: "Preencha todos os campos fiscais antes de confirmar ou validar." };
  const { error } = await s.from("focus_nfe_settings").update({ ...d,
    cfop: d.cfop || null, natureza_operacao: d.natureza_operacao || null,
    tributacao: d.tributacao || null, regime_exportacao: d.regime_exportacao || null,
    serie: d.serie || null, numeracao: d.numeracao || null,
    updated_by: user.id, updated_at: new Date().toISOString() }).eq("singleton", true);
  if (error) return { error: "Não foi possível salvar a configuração fiscal." };
  await registrarAuditoria(s, { action: "focus.configuracao_fiscal", entityType: "focus_nfe_settings", entityId: "singleton",
    diff: { cfop: d.cfop, natureza_operacao: d.natureza_operacao, tributacao: d.tributacao,
      regime_exportacao: d.regime_exportacao, serie: d.serie, numeracao: d.numeracao,
      emitente_confirmado: d.emitente_confirmado, contador_validou: d.contador_validou } });
  revalidatePath("/admin/internacional");
  return { ok: true };
}
