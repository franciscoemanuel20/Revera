"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { MOEDAS_SUPORTADAS } from "@/lib/internacional/moeda";
import { ehPaisSuportado } from "@/lib/internacional/paises";

/**
 * Server Actions do painel Internacional — preço por mercado e cotações
 * manuais de frete. Duas regras acima de tudo:
 *
 *  1. NENHUM valor nasce aqui: o Francisco digita, o sistema grava. Campo
 *     vazio = "sem preço nesse mercado" (linha desativada), nunca um
 *     preço convertido do real.
 *  2. Tudo passa pelo cliente de SESSÃO (createClient) — a RLS de
 *     admin_users é quem autoriza, igual ao resto do painel. Nada de
 *     service role em ação disparada por formulário.
 */

const MOEDAS_INTL = MOEDAS_SUPORTADAS.filter((m) => m !== "BRL");

const precoSchema = z.object({
  variantId: z.string().uuid(),
  precos: z.record(
    z.enum(MOEDAS_INTL as unknown as [string, ...string[]]),
    // Valor em CENTAVOS (unidade mínima), já convertido pela tela; null
    // desativa o preço daquele mercado.
    z.number().int().positive().nullable()
  ),
});

export type SalvarPrecoIntlInput = z.infer<typeof precoSchema>;
export type ResultadoAdminIntl = { error: string } | { ok: true };

export async function salvarPrecosInternacionaisAction(
  input: SalvarPrecoIntlInput
): Promise<ResultadoAdminIntl> {
  const parsed = precoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { variantId, precos } = parsed.data;
  const supabase = await createClient();

  for (const moeda of MOEDAS_INTL) {
    const valor = precos[moeda];
    if (valor == null) {
      // Sem preço = mercado fechado para a variante: desativa a linha se
      // existir. Não apaga — o histórico de "já teve preço" é informação.
      const { error } = await supabase
        .from("variant_prices")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("variant_id", variantId)
        .eq("currency", moeda);
      if (error) return { error: `Falha ao desativar ${moeda}: ${error.message}` };
    } else {
      const { error } = await supabase.from("variant_prices").upsert(
        {
          variant_id: variantId,
          currency: moeda,
          price_cents: valor,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "variant_id,currency" }
      );
      if (error) return { error: `Falha ao salvar ${moeda}: ${error.message}` };
    }
  }

  await registrarAuditoria(supabase, {
    action: "internacional.salvar_precos",
    entityType: "variant_prices",
    entityId: variantId,
    diff: { precos },
  });

  revalidatePath("/admin/internacional");
  return { ok: true };
}

const cotacaoSchema = z.object({
  country: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v !== "BR" && ehPaisSuportado(v), "País inválido para cotação internacional."),
  carrier: z.string().trim().min(1).default("DHL"),
  serviceName: z.string().trim().min(1, "Informe o serviço (ex.: DHL Express Worldwide)."),
  currency: z.enum(MOEDAS_INTL as unknown as [string, ...string[]]),
  priceCents: z.number().int().positive("O frete precisa ser maior que zero."),
  maxWeightG: z.number().int().positive().nullable(),
  etaDiasMin: z.number().int().positive().nullable(),
  etaDiasMax: z.number().int().positive().nullable(),
  quotedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da cotação inválida."),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Validade inválida."),
  notes: z.string().trim().max(500).nullable(),
});

export type CriarCotacaoIntlInput = z.infer<typeof cotacaoSchema>;

export async function criarCotacaoInternacionalAction(
  input: CriarCotacaoIntlInput
): Promise<ResultadoAdminIntl> {
  const parsed = cotacaoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const c = parsed.data;
  if (c.validUntil < c.quotedAt) {
    return { error: "A validade não pode ser anterior à data da cotação." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intl_shipping_quotes")
    .insert({
      country: c.country,
      carrier: c.carrier,
      service_name: c.serviceName,
      currency: c.currency,
      price_cents: c.priceCents,
      max_weight_g: c.maxWeightG,
      eta_days_min: c.etaDiasMin,
      eta_days_max: c.etaDiasMax,
      quoted_at: c.quotedAt,
      valid_until: c.validUntil,
      notes: c.notes,
    })
    .select("id")
    .single();

  if (error) return { error: `Falha ao salvar a cotação: ${error.message}` };

  await registrarAuditoria(supabase, {
    action: "internacional.criar_cotacao_frete",
    entityType: "intl_shipping_quotes",
    entityId: data.id as string,
    diff: { country: c.country, currency: c.currency, priceCents: c.priceCents, validUntil: c.validUntil },
  });

  revalidatePath("/admin/internacional");
  return { ok: true };
}

export async function desativarCotacaoInternacionalAction(
  id: string
): Promise<ResultadoAdminIntl> {
  if (!z.string().uuid().safeParse(id).success) return { error: "Cotação inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("intl_shipping_quotes")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: `Falha ao desativar: ${error.message}` };

  await registrarAuditoria(supabase, {
    action: "internacional.desativar_cotacao_frete",
    entityType: "intl_shipping_quotes",
    entityId: id,
    diff: {},
  });

  revalidatePath("/admin/internacional");
  return { ok: true };
}
