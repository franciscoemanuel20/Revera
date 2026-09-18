"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import {
  enviarReengajamento,
  lerFilaDeReengajamento,
  type ResultadoEnvioReengajamento,
} from "@/lib/notificacoes/reengajamento-checkout";

/**
 * Ações do reengajamento único (ver src/lib/notificacoes/reengajamento-checkout.ts).
 *
 * O envio usa o client de SERVICE ROLE — é o mesmo caminho do cron, que
 * precisa ler clientes e gravar em order_notifications. Por isso a checagem
 * de admin_users acontece AQUI, na sessão de quem clicou, antes de qualquer
 * coisa: sem ela, a action seria uma porta para disparo em massa.
 */
async function exigirAdmin(): Promise<{ erro: string } | { supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre de novo no painel." };
  const { data: admin } = await supabase.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  if (!admin) return { erro: "Só administradores podem disparar mensagens." };
  return { supabase };
}

export type PreviaReengajamento =
  | { error: string }
  | { pessoas: Array<{ codigo: string; nome: string; telefone: string }>; fora: Record<string, number> };

export async function previaReengajamentoAction(): Promise<PreviaReengajamento> {
  const guarda = await exigirAdmin();
  if ("erro" in guarda) return { error: guarda.erro };

  const fila = await lerFilaDeReengajamento(createAdminClient(), new Date());
  if ("erro" in fila) return { error: fila.erro };

  const fora: Record<string, number> = {};
  for (const f of fila.fora) fora[f.motivo] = (fora[f.motivo] ?? 0) + 1;
  return {
    pessoas: fila.escolhidos.map((p) => ({
      codigo: p.codigo,
      nome: (p.nome ?? "").trim() || "(sem nome)",
      // Só o final: a prévia é para conferir, não para copiar a lista.
      telefone: `…${p.destino.slice(-4)}`,
    })),
    fora,
  };
}

export async function enviarReengajamentoAction(): Promise<{ error: string } | ResultadoEnvioReengajamento> {
  const guarda = await exigirAdmin();
  if ("erro" in guarda) return { error: guarda.erro };

  const template = (process.env.CLINT_TEMPLATE_REENGAJAMENTO_ID ?? "").trim();
  const resultado = await enviarReengajamento(createAdminClient(), new Date(), template);

  await registrarAuditoria(guarda.supabase, {
    action: "recuperacao.reengajamento_enviar",
    entityType: "order_notifications",
    entityId: null,
    diff: { enviados: resultado.enviados, pulados: resultado.pulados, erro: resultado.erro ?? null },
  });
  revalidatePath("/admin/recuperacao");

  if (resultado.erro && resultado.enviados === 0) return { error: resultado.erro };
  return resultado;
}
