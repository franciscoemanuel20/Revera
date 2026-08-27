"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { regraDescontoSchema, sincronizarRegrasDesconto } from "@/lib/admin/discount-rules";

// Server Actions do CRUD de produto (produto + variantes + regras de
// desconto, todos numa única gravação — ver ProductForm.tsx). Usam
// createClient() (client de SESSÃO, sob RLS), nunca createAdminClient():
// quem decide se a gravação é permitida é a policy "admin manage *" de
// supabase/migrations/00000000000002_admin_write_policies.sql, não esta
// função. Se essa migration não estiver aplicada no projeto real, toda
// escrita aqui falha com erro de RLS — esperado até o Francisco colar a
// migration no SQL Editor.

const idVazio = "00000000-0000-0000-0000-000000000000";

const uuidOuNulo = z
  .string()
  .uuid()
  .nullable()
  .or(z.literal("").transform(() => null));

const varianteSchema = z.object({
  id: z.string().uuid().optional(),
  sizeId: uuidOuNulo,
  colorId: uuidOuNulo,
  grayLevelId: uuidOuNulo,
  lengthCm: z.number().nonnegative().nullable(),
  sku: z.string().trim().min(1, "SKU é obrigatório"),
  stockQty: z.number().int().nonnegative("Estoque não pode ser negativo"),
  priceCents: z.number().int().nonnegative("Preço não pode ser negativo"),
  compareAtPriceCents: z.number().int().nonnegative().nullable(),
  isActive: z.boolean(),
});

// regraDescontoSchema agora vem de src/lib/admin/discount-rules.ts — extraído
// de lá para o módulo /admin/precos poder reusar a MESMA validação (ver
// comentário naquele arquivo). Mesmo schema de sempre, só mudou de casa.

const produtoSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome é obrigatório"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug é obrigatório")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug só pode ter letras minúsculas, números e hífen"),
  description: z.string().trim().nullable(),

  /**
   * DADOS DE EXPORTAÇÃO (27/08/2026)
   *
   * Todos opcionais, e vazio é o estado CORRETO hoje: NCM, HS Code e país de
   * origem dependem do contador e do fornecedor. Preencher por analogia com
   * outro produto é declarar mercadoria errada na alfândega.
   *
   * A validação abaixo confere FORMATO, nunca conteúdo — o sistema sabe que
   * NCM tem oito dígitos, e não sabe (nem deve opinar sobre) qual é o certo.
   */
  descriptionEn: z.string().trim().nullable(),
  countryOfOrigin: z
    .string()
    .trim()
    .nullable()
    .refine((v) => v === null || /^[A-Za-z]{2}$/.test(v), "Use o código de 2 letras do país (ex.: CN, BR).")
    .transform((v) => (v ? v.toUpperCase() : null)),
  ncm: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || v.length === 8, "NCM tem 8 dígitos."),
  hsCode: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine(
      (v) => v === null || (v.length >= 6 && v.length <= 10),
      "HS Code tem de 6 a 10 dígitos."
    ),
  netWeightG: z.number().int().positive().nullable(),
  grossWeightG: z.number().int().positive().nullable(),
  lengthMm: z.number().int().positive().nullable(),
  widthMm: z.number().int().positive().nullable(),
  heightMm: z.number().int().positive().nullable(),
  baseType: z.string().trim().nullable(),
  baseThicknessMm: z.number().nonnegative().nullable(),
  isFeatured: z.boolean(),
  status: z.enum(["draft", "active", "archived"]),
  seoTitle: z.string().trim().nullable(),
  seoDescription: z.string().trim().nullable(),
  variants: z.array(varianteSchema),
  discountRules: z.array(regraDescontoSchema),
});

export type SalvarProdutoInput = z.infer<typeof produtoSchema>;
export type SalvarProdutoResultado = { error: string } | { error?: undefined };

export async function salvarProdutoAction(input: SalvarProdutoInput): Promise<SalvarProdutoResultado> {
  const parsed = produtoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido no formulário." };
  }
  const dados = parsed.data;
  const supabase = await createClient();

  const { data: slugExistente, error: erroSlug } = await supabase
    .from("products")
    .select("id")
    .eq("slug", dados.slug)
    .neq("id", dados.id ?? idVazio)
    .maybeSingle();
  if (erroSlug) {
    return { error: "Não foi possível validar o slug. Tente de novo." };
  }
  if (slugExistente) {
    return { error: "Já existe outro produto com esse slug." };
  }

  const produtoPayload = {
    name: dados.name,
    slug: dados.slug,
    description: dados.description,
    base_type: dados.baseType,
    base_thickness_mm: dados.baseThicknessMm,
    is_featured: dados.isFeatured,
    status: dados.status,
    seo_title: dados.seoTitle,
    seo_description: dados.seoDescription,
    description_en: dados.descriptionEn,
    country_of_origin: dados.countryOfOrigin,
    ncm: dados.ncm,
    hs_code: dados.hsCode,
    net_weight_g: dados.netWeightG,
    gross_weight_g: dados.grossWeightG,
    length_mm: dados.lengthMm,
    width_mm: dados.widthMm,
    height_mm: dados.heightMm,
    updated_at: new Date().toISOString(),
  };

  let productId = dados.id;
  if (productId) {
    const { error } = await supabase.from("products").update(produtoPayload).eq("id", productId);
    if (error) {
      return { error: "Não foi possível salvar o produto. Confira se você tem permissão de admin." };
    }
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert(produtoPayload)
      .select("id")
      .single();
    if (error || !data) {
      return { error: "Não foi possível criar o produto. Confira se você tem permissão de admin." };
    }
    productId = data.id as string;
  }

  const erroVariantes = await sincronizarVariantes(supabase, productId, dados.variants);
  if (erroVariantes) return { error: erroVariantes };

  const erroRegras = await sincronizarRegrasDesconto(supabase, productId, dados.discountRules);
  if (erroRegras) return { error: erroRegras };

  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${productId}`);
  redirect("/admin/produtos");
}

// Awaited client de src/lib/supabase/server.ts — tipar explícito aqui só
// deixaria isto acoplado à versão exata do supabase-js; Awaited<ReturnType<>>
// já resolve sem duplicar o tipo.
type ClienteSupabase = Awaited<ReturnType<typeof createClient>>;

async function sincronizarVariantes(
  supabase: ClienteSupabase,
  productId: string,
  variantes: SalvarProdutoInput["variants"]
): Promise<string | null> {
  const { data: atuais, error: erroLeitura } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (erroLeitura) return "Não foi possível ler as variantes existentes.";

  const idsMantidos = new Set(variantes.filter((v) => v.id).map((v) => v.id as string));
  const idsParaRemover = (atuais ?? []).map((v) => v.id as string).filter((id) => !idsMantidos.has(id));
  if (idsParaRemover.length > 0) {
    const { error } = await supabase.from("product_variants").delete().in("id", idsParaRemover);
    if (error) return "Não foi possível remover uma variante retirada do formulário.";
  }

  for (const variante of variantes) {
    const payload = {
      product_id: productId,
      sku: variante.sku,
      size_id: variante.sizeId,
      color_id: variante.colorId,
      gray_level_id: variante.grayLevelId,
      length_cm: variante.lengthCm,
      stock_qty: variante.stockQty,
      price_cents: variante.priceCents,
      compare_at_price_cents: variante.compareAtPriceCents,
      is_active: variante.isActive,
      updated_at: new Date().toISOString(),
    };

    if (variante.id) {
      const { error } = await supabase.from("product_variants").update(payload).eq("id", variante.id);
      if (error) return `Não foi possível salvar a variante "${variante.sku}" — SKU repetido ou combinação já existe.`;
    } else {
      const { error } = await supabase.from("product_variants").insert(payload);
      if (error) return `Não foi possível criar a variante "${variante.sku}" — SKU repetido ou combinação já existe.`;
    }
  }

  return null;
}
