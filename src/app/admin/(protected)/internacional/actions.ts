"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { MOEDAS_SUPORTADAS } from "@/lib/internacional/moeda";
import { ehPaisSuportado } from "@/lib/internacional/paises";
import { cotarDhlOperacional } from "@/lib/shipping/dhl/admin-quote";
import { modoDhl } from "@/lib/shipping/dhl/mydhl-provider";

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

async function exigirAdminInternacional(): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão de admin expirada." };

  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !admin) return { error: "Acesso administrativo necessário." };
  return null;
}

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

const cotarDhlSchema = z.object({
  country: z.string().trim().transform((v) => v.toUpperCase()).refine((v) => v !== "BR" && ehPaisSuportado(v), "País inválido."),
  postalCode: z.string().trim().max(30).nullable(),
  cityName: z.string().trim().min(1, "Informe a cidade.").max(80),
  provinceCode: z.string().trim().max(40).nullable(),
  addressLine1: z.string().trim().max(120).nullable(),
  currency: z.enum(MOEDAS_INTL as unknown as [string, ...string[]]),
  declaredValueCents: z.number().int().positive(),
  weightGrams: z.number().int().positive(),
  lengthCm: z.number().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
});

export type CotarDhlOperacionalInput = z.infer<typeof cotarDhlSchema>;

export type ResultadoCotacaoDhlOperacional =
  | {
      ok: true;
      ambiente: "sandbox" | "producao";
      quotes: Array<{
        productCode: string;
        productName: string;
        currency: string;
        priceCents: number;
        etaDays: number | null;
        deliveryDate: string | null;
      }>;
    }
  | { error: string };

export async function cotarDhlOperacionalAction(
  input: CotarDhlOperacionalInput
): Promise<ResultadoCotacaoDhlOperacional> {
  const bloqueio = await exigirAdminInternacional();
  if (bloqueio) return bloqueio;

  const parsed = cotarDhlSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido para cotar DHL." };
  }

  try {
    const resultado = await cotarDhlOperacional(parsed.data);
    return {
      ok: true,
      ambiente: modoDhl(),
      quotes: resultado.quotes.map((q) => ({
        productCode: q.productCode,
        productName: q.productName,
        currency: q.currency,
        priceCents: q.priceCents,
        etaDays: q.etaDays,
        deliveryDate: q.deliveryDate,
      })),
    };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Não foi possível consultar a DHL agora.",
    };
  }
}

const expedicaoSchema = z.object({
  legalName: z.string().trim().min(2),
  taxId: z.string().trim().min(5),
  country: z.string().trim().length(2).transform((v) => v.toUpperCase()),
  postalCode: z.string().trim().min(2),
  city: z.string().trim().min(2),
  region: z.string().trim().nullable(),
  addressLine1: z.string().trim().min(3),
  contactName: z.string().trim().min(2),
  phone: z.string().trim().min(6),
  email: z.string().trim().email(),
  invoiceMode: z.enum(["external", "api"]),
  dhlAccountConfirmed: z.boolean(),
});

export async function salvarExportadorInternacionalAction(input: unknown): Promise<ResultadoAdminIntl> {
  const bloqueio = await exigirAdminInternacional();
  if (bloqueio) return bloqueio;
  const parsed = expedicaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados do exportador incompletos." };
  const s = await createClient();
  const d = parsed.data;
  const { error } = await s.from("international_export_settings").upsert({
    singleton: true, legal_name: d.legalName, tax_id: d.taxId, country: d.country,
    postal_code: d.postalCode, city: d.city, region: d.region, address_line1: d.addressLine1,
    contact_name: d.contactName, phone: d.phone, email: d.email, invoice_mode: d.invoiceMode,
    dhl_account_confirmed: d.dhlAccountConfirmed, updated_at: new Date().toISOString(),
  });
  if (error) return { error: `Falha ao salvar exportador: ${error.message}` };
  revalidatePath("/admin/internacional");
  return { ok: true };
}

const produtoExpedicaoSchema = z.object({
  variantId: z.string().uuid(),
  weightG: z.number().int().positive(),
  lengthCm: z.number().positive(), widthCm: z.number().positive(), heightCm: z.number().positive(),
  hsCode: z.string().trim().min(4).max(20),
  originCountry: z.string().trim().length(2).transform((v) => v.toUpperCase()),
});

export async function salvarDadosExpedicaoProdutoAction(input: unknown): Promise<ResultadoAdminIntl> {
  const bloqueio = await exigirAdminInternacional();
  if (bloqueio) return bloqueio;
  const parsed = produtoExpedicaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados físicos/fiscais incompletos." };
  const d = parsed.data;
  const s = await createClient();
  const { error } = await s.from("product_variants").update({
    shipping_weight_g: d.weightG, shipping_length_cm: d.lengthCm, shipping_width_cm: d.widthCm,
    shipping_height_cm: d.heightCm, customs_hs_code: d.hsCode, origin_country: d.originCountry,
    updated_at: new Date().toISOString(),
  }).eq("id", d.variantId);
  if (error) return { error: `Falha ao salvar produto: ${error.message}` };
  revalidatePath("/admin/internacional");
  return { ok: true };
}
