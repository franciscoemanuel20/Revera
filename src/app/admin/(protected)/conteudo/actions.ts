"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";

// Server Actions do módulo /admin/conteudo — FAQ e Depoimentos seguem o
// MESMO padrão de sincronizarVariantes/sincronizarRegrasDesconto (upsert
// por linha + apaga o que saiu da lista, tudo numa chamada só), só que sem
// escopo de produto: aqui a lista inteira da tabela é o "conjunto atual",
// porque faq_items e reviews não pertencem a um produto específico (reviews
// tem product_id, mas nullable — este módulo não usa esse vínculo, ver
// comentário no schema abaixo). Seções (content_blocks) são só EDIÇÃO —
// nunca cria nem apaga section_key por aqui, ver comentário na função
// própria.

// --- FAQ ------------------------------------------------------------------

const faqItemSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().trim().min(1, "A pergunta não pode ficar em branco"),
  answer: z.string().trim().min(1, "A resposta não pode ficar em branco"),
  sortOrder: z.number().int().nonnegative(),
  isVisible: z.boolean(),
});

const salvarFaqSchema = z.object({ items: z.array(faqItemSchema) });
export type SalvarFaqInput = z.infer<typeof salvarFaqSchema>;
export type AcaoResultado = { error: string } | { ok: true };

export async function salvarFaqAction(input: SalvarFaqInput): Promise<AcaoResultado> {
  const parsed = salvarFaqSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const supabase = await createClient();

  const { data: atuais, error: erroLeitura } = await supabase.from("faq_items").select("id");
  if (erroLeitura) return { error: "Não foi possível ler as perguntas existentes." };

  const idsMantidos = new Set(parsed.data.items.filter((i) => i.id).map((i) => i.id as string));
  const idsParaRemover = (atuais ?? []).map((i) => i.id as string).filter((id) => !idsMantidos.has(id));
  if (idsParaRemover.length > 0) {
    const { error } = await supabase.from("faq_items").delete().in("id", idsParaRemover);
    if (error) return { error: "Não foi possível remover uma pergunta retirada da lista." };
  }

  for (const item of parsed.data.items) {
    const payload = {
      question: item.question,
      answer: item.answer,
      sort_order: item.sortOrder,
      is_visible: item.isVisible,
    };
    if (item.id) {
      const { error } = await supabase.from("faq_items").update(payload).eq("id", item.id);
      if (error) return { error: "Não foi possível salvar uma pergunta." };
    } else {
      const { error } = await supabase.from("faq_items").insert(payload);
      if (error) return { error: "Não foi possível criar uma pergunta." };
    }
  }

  await registrarAuditoria(supabase, {
    action: "conteudo.salvar_faq",
    entityType: "faq_items",
    entityId: null,
    diff: { quantidade: parsed.data.items.length },
  });

  revalidatePath("/admin/conteudo");
  revalidatePath("/faq");
  return { ok: true };
}

// --- Depoimentos ------------------------------------------------------------

const reviewItemSchema = z.object({
  id: z.string().uuid().optional(),
  customerName: z.string().trim().min(1, "Nome do cliente é obrigatório"),
  city: z.string().trim().nullable(),
  professionalName: z.string().trim().nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  comment: z.string().trim().nullable(),
  photoUrl: z.string().trim().nullable(),
  videoUrl: z.string().trim().nullable(),
  isPublished: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

const salvarReviewsSchema = z.object({ items: z.array(reviewItemSchema) });
export type SalvarReviewsInput = z.infer<typeof salvarReviewsSchema>;

export async function salvarReviewsAction(input: SalvarReviewsInput): Promise<AcaoResultado> {
  const parsed = salvarReviewsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const supabase = await createClient();

  const { data: atuais, error: erroLeitura } = await supabase.from("reviews").select("id");
  if (erroLeitura) return { error: "Não foi possível ler os depoimentos existentes." };

  const idsMantidos = new Set(parsed.data.items.filter((i) => i.id).map((i) => i.id as string));
  const idsParaRemover = (atuais ?? []).map((i) => i.id as string).filter((id) => !idsMantidos.has(id));
  if (idsParaRemover.length > 0) {
    const { error } = await supabase.from("reviews").delete().in("id", idsParaRemover);
    if (error) return { error: "Não foi possível remover um depoimento retirado da lista." };
  }

  for (const item of parsed.data.items) {
    const payload = {
      customer_name: item.customerName,
      city: item.city,
      professional_name: item.professionalName,
      rating: item.rating,
      comment: item.comment,
      photo_url: item.photoUrl,
      video_url: item.videoUrl,
      is_published: item.isPublished,
      sort_order: item.sortOrder,
    };
    if (item.id) {
      const { error } = await supabase.from("reviews").update(payload).eq("id", item.id);
      if (error) return { error: "Não foi possível salvar um depoimento." };
    } else {
      const { error } = await supabase.from("reviews").insert(payload);
      if (error) return { error: "Não foi possível criar um depoimento." };
    }
  }

  await registrarAuditoria(supabase, {
    action: "conteudo.salvar_reviews",
    entityType: "reviews",
    entityId: null,
    diff: { quantidade: parsed.data.items.length },
  });

  revalidatePath("/admin/conteudo");
  revalidatePath("/");
  return { ok: true };
}

// --- Seções (content_blocks) -----------------------------------------------
//
// Só EDITA linhas que já existem — nunca cria nem apaga `section_key` por
// aqui. A missão foi explícita ("editar título/texto/mídia dos blocos por
// section_key"): section_key é o identificador que o código de uma página
// pública usaria para buscar aquele bloco (nenhuma página pública lê
// content_blocks ainda — grep confirmou, 26/08/2026), então inventar uma
// chave nova aqui não teria efeito nenhum na vitrine e só criaria lixo que
// um desenvolvedor futuro precisaria adivinhar se foi ele que deveria criar
// ou não.

const contentBlockSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().nullable(),
  body: z.string().trim().nullable(),
  mediaUrl: z.string().trim().nullable(),
  isVisible: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export type SalvarContentBlockInput = z.infer<typeof contentBlockSchema>;

export async function salvarContentBlockAction(input: SalvarContentBlockInput): Promise<AcaoResultado> {
  const parsed = contentBlockSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { id, title, body, mediaUrl, isVisible, sortOrder } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("content_blocks")
    .update({
      title,
      body,
      media_url: mediaUrl,
      is_visible: isVisible,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return { error: "Não foi possível salvar a seção. Confira se você tem permissão de admin." };
  }

  await registrarAuditoria(supabase, {
    action: "conteudo.salvar_bloco",
    entityType: "content_blocks",
    entityId: id,
    diff: { title, isVisible, sortOrder },
  });

  revalidatePath("/admin/conteudo");
  return { ok: true };
}
