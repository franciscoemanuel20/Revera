import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Sincronização de `quantity_discount_rules` — extraído de
// src/app/admin/(protected)/produtos/actions.ts (26/08/2026) porque o
// módulo /admin/precos precisa da MESMA gravação (upsert por linha + remove
// o que saiu da lista), só chamada a partir de uma tela diferente (visão
// consolidada por produto, em vez de dentro do formulário de produto). O
// formulário de produto continua chamando isto — não foi reescrito, só
// passou a importar em vez de definir localmente.
//
// startsAt/endsAt/sortOrder foram ADICIONADOS nesta extração (a versão
// antiga, só dentro de produtos/actions.ts, nunca editava essas três
// colunas — `quantity_discount_rules.starts_at/ends_at/sort_order`
// ficavam paradas no valor default do banco desde 00000000000001_init.sql).
// A missão que pediu /admin/precos foi explícita sobre "vigência
// (início/fim)" e "ordem" fazerem parte do que este módulo edita; como o
// campo é compartilhado com o formulário de produto, o ganho chega aos
// dois lugares em vez de só um. Ambos nullable/opcional com fallback
// sensato (ver novaRegraDesconto em DiscountRulesEditor.tsx), então uma
// regra criada antes desta mudança continua válida sem exigir migração de
// dado.
export const regraDescontoSchema = z
  .object({
    id: z.string().uuid().optional(),
    minQty: z.number().int().positive("Quantidade mínima precisa ser maior que zero"),
    unitPriceCents: z.number().int().nonnegative().nullable(),
    discountPercent: z.number().min(0).max(100).nullable(),
    label: z.string().trim().nullable(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .refine((regra) => (regra.unitPriceCents != null) !== (regra.discountPercent != null), {
    message: "Cada regra de desconto precisa de preço unitário OU percentual — nunca os dois, nunca nenhum",
  })
  .refine((regra) => !regra.startsAt || !regra.endsAt || regra.startsAt <= regra.endsAt, {
    message: "A vigência da regra de desconto não pode terminar antes de começar",
  });

export type RegraDescontoInput = z.infer<typeof regraDescontoSchema>;

// Awaited client de src/lib/supabase/server.ts — ver o mesmo comentário em
// produtos/actions.ts sobre por que isto não importa o tipo do supabase-js
// direto.
type ClienteSupabase = Awaited<ReturnType<typeof createClient>>;

export async function sincronizarRegrasDesconto(
  supabase: ClienteSupabase,
  productId: string,
  regras: RegraDescontoInput[]
): Promise<string | null> {
  const { data: atuais, error: erroLeitura } = await supabase
    .from("quantity_discount_rules")
    .select("id")
    .eq("product_id", productId);
  if (erroLeitura) return "Não foi possível ler as regras de desconto existentes.";

  const idsMantidos = new Set(regras.filter((r) => r.id).map((r) => r.id as string));
  const idsParaRemover = (atuais ?? []).map((r) => r.id as string).filter((id) => !idsMantidos.has(id));
  if (idsParaRemover.length > 0) {
    const { error } = await supabase.from("quantity_discount_rules").delete().in("id", idsParaRemover);
    if (error) return "Não foi possível remover uma regra de desconto retirada do formulário.";
  }

  for (const regra of regras) {
    const payload = {
      product_id: productId,
      min_qty: regra.minQty,
      unit_price_cents: regra.unitPriceCents,
      discount_percent: regra.discountPercent,
      label: regra.label,
      starts_at: regra.startsAt,
      ends_at: regra.endsAt,
      sort_order: regra.sortOrder,
      is_active: regra.isActive,
    };

    if (regra.id) {
      const { error } = await supabase.from("quantity_discount_rules").update(payload).eq("id", regra.id);
      if (error) return "Não foi possível salvar uma regra de desconto.";
    } else {
      const { error } = await supabase.from("quantity_discount_rules").insert(payload);
      if (error) return "Não foi possível criar uma regra de desconto.";
    }
  }

  return null;
}
