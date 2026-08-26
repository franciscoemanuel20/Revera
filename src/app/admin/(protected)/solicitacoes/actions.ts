"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";

// Server Actions do módulo /admin/solicitacoes — três formulários (ajuda de
// cor, garantia, profissional), cada um com sua própria tabela e sua
// própria pequena máquina de estado. Todas usam createClient() (sessão,
// sob RLS): a policy "admin manage <tabela>" de
// supabase/migrations/00000000000005_admin_pedidos_policies.sql autoriza.
//
// A EXCEÇÃO desta entrega é a leitura da FOTO de color_help_requests, que
// usa createAdminClient() só para gerar a signed URL — não nestas actions,
// mas em page.tsx (ver comentário lá): o bucket "color-help" não tem
// nenhuma policy de SELECT (nem para o admin autenticado), de propósito
// (ver supabase/migrations/00000000000004_storage_color_help.sql) — só o
// service role consegue gerar a URL assinada.

const respostaAjudaCorSchema = z.object({
  id: z.string().uuid(),
  suggestedColorId: z.string().uuid().nullable(),
  notes: z.string().trim().nullable(),
});

export type RespostaAjudaCorInput = z.infer<typeof respostaAjudaCorSchema>;
export type AcaoResultado = { error: string } | { ok: true };

export async function responderAjudaCorAction(input: RespostaAjudaCorInput): Promise<AcaoResultado> {
  const parsed = respostaAjudaCorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { id, suggestedColorId, notes } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("color_help_requests")
    .update({
      suggested_color_id: suggestedColorId,
      admin_notes: notes,
      status: "answered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return { error: "Não foi possível salvar a resposta. Confira se você tem permissão de admin." };
  }

  await registrarAuditoria(supabase, {
    action: "solicitacao.responder_ajuda_cor",
    entityType: "color_help_requests",
    entityId: id,
    diff: { suggestedColorId, notes },
  });

  revalidatePath("/admin/solicitacoes");
  return { ok: true };
}

// --- Garantia -----------------------------------------------------------

const STATUS_GARANTIA = ["new", "in_review", "approved", "denied"] as const;
type StatusGarantia = (typeof STATUS_GARANTIA)[number];

// new -> in_review -> approved/denied. Ficar no mesmo status (ex.: salvar
// só uma nota nova sem mudar o status) é sempre permitido — só pular etapa
// ou voltar para trás é rejeitado.
const TRANSICOES_GARANTIA: Record<StatusGarantia, StatusGarantia[]> = {
  new: ["in_review"],
  in_review: ["approved", "denied"],
  approved: [],
  denied: [],
};

const statusGarantiaSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUS_GARANTIA),
  notes: z.string().trim().nullable(),
});

export type StatusGarantiaInput = z.infer<typeof statusGarantiaSchema>;

export async function mudarStatusGarantiaAction(input: StatusGarantiaInput): Promise<AcaoResultado> {
  const parsed = statusGarantiaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { id, status: novoStatus, notes } = parsed.data;
  const supabase = await createClient();

  const { data: solicitacao, error: erroLeitura } = await supabase
    .from("warranty_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura || !solicitacao) {
    return { error: "Solicitação de garantia não encontrada." };
  }

  const statusAtual = solicitacao.status as StatusGarantia;
  if (statusAtual !== novoStatus && !TRANSICOES_GARANTIA[statusAtual].includes(novoStatus)) {
    return {
      error: `Não é possível mover a garantia de "${statusAtual}" direto para "${novoStatus}". Siga a sequência (novo → em análise → aprovado/negado).`,
    };
  }

  const { error } = await supabase
    .from("warranty_requests")
    .update({ status: novoStatus, admin_notes: notes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { error: "Não foi possível salvar. Confira se você tem permissão de admin." };
  }

  await registrarAuditoria(supabase, {
    action: "solicitacao.mudar_status_garantia",
    entityType: "warranty_requests",
    entityId: id,
    diff: { de: statusAtual, para: novoStatus, notes },
  });

  revalidatePath("/admin/solicitacoes");
  return { ok: true };
}

// --- Profissionais --------------------------------------------------------

const STATUS_PROFISSIONAL = ["new", "contacted", "converted", "declined"] as const;
type StatusProfissional = (typeof STATUS_PROFISSIONAL)[number];

const TRANSICOES_PROFISSIONAL: Record<StatusProfissional, StatusProfissional[]> = {
  new: ["contacted"],
  contacted: ["converted", "declined"],
  converted: [],
  declined: [],
};

const statusProfissionalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUS_PROFISSIONAL),
});

export type StatusProfissionalInput = z.infer<typeof statusProfissionalSchema>;

export async function mudarStatusProfissionalAction(input: StatusProfissionalInput): Promise<AcaoResultado> {
  const parsed = statusProfissionalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { id, status: novoStatus } = parsed.data;
  const supabase = await createClient();

  const { data: lead, error: erroLeitura } = await supabase
    .from("professional_leads")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura || !lead) {
    return { error: "Cadastro de profissional não encontrado." };
  }

  const statusAtual = lead.status as StatusProfissional;
  if (statusAtual !== novoStatus && !TRANSICOES_PROFISSIONAL[statusAtual].includes(novoStatus)) {
    return {
      error: `Não é possível mover de "${statusAtual}" direto para "${novoStatus}". Siga a sequência (novo → contatado → convertido/recusado).`,
    };
  }

  const { error } = await supabase.from("professional_leads").update({ status: novoStatus }).eq("id", id);
  if (error) {
    return { error: "Não foi possível salvar. Confira se você tem permissão de admin." };
  }

  await registrarAuditoria(supabase, {
    action: "solicitacao.mudar_status_profissional",
    entityType: "professional_leads",
    entityId: id,
    diff: { de: statusAtual, para: novoStatus },
  });

  revalidatePath("/admin/solicitacoes");
  return { ok: true };
}
