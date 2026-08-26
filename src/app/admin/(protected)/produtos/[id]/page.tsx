import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../ProductForm";

// cents -> string de reais com 2 casas fixas, para não jogar float bruto
// (ex.: "123.45000000000001") no valor de um <input type="number">.
function centavosParaTexto(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: produto }, { data: variantes }, { data: regras }, { data: sizes }, { data: colors }, { data: grayLevels }] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", id).maybeSingle(),
      supabase.from("product_variants").select("*").eq("product_id", id).order("created_at"),
      supabase.from("quantity_discount_rules").select("*").eq("product_id", id).order("min_qty"),
      supabase.from("sizes").select("id, label").order("sort_order"),
      supabase.from("colors").select("id, code, name").order("sort_order"),
      supabase.from("gray_levels").select("id, percent, label").order("sort_order"),
    ]);

  if (!produto) {
    // Sem RLS de admin aplicada ainda, isto também acontece para produto
    // que existe mas está fora da policy pública (status != 'active') —
    // ver comentário em src/app/admin/produtos/page.tsx.
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">Editar produto</h1>
      <ProductForm
        sizes={(sizes ?? []).map((s) => ({ id: s.id, label: s.label }))}
        colors={(colors ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        grayLevels={(grayLevels ?? []).map((g) => ({ id: g.id, label: `${g.percent}% — ${g.label}` }))}
        initialData={{
          id: produto.id,
          name: produto.name,
          slug: produto.slug,
          description: produto.description ?? "",
          baseType: produto.base_type ?? "",
          baseThicknessMm: produto.base_thickness_mm != null ? String(produto.base_thickness_mm) : "",
          isFeatured: produto.is_featured,
          status: produto.status,
          seoTitle: produto.seo_title ?? "",
          seoDescription: produto.seo_description ?? "",
          variants: (variantes ?? []).map((v) => ({
            key: v.id,
            id: v.id,
            sizeId: v.size_id ?? "",
            colorId: v.color_id ?? "",
            grayLevelId: v.gray_level_id ?? "",
            lengthCm: v.length_cm != null ? String(v.length_cm) : "",
            sku: v.sku,
            stockQty: String(v.stock_qty),
            priceReais: centavosParaTexto(v.price_cents),
            compareAtPriceReais: centavosParaTexto(v.compare_at_price_cents),
            isActive: v.is_active,
          })),
          discountRules: (regras ?? []).map((r) => ({
            key: r.id,
            id: r.id,
            minQty: String(r.min_qty),
            mode: r.unit_price_cents != null ? "preco" : "percentual",
            unitPriceReais: centavosParaTexto(r.unit_price_cents),
            discountPercent: r.discount_percent != null ? String(r.discount_percent) : "",
            label: r.label ?? "",
            // timestamptz -> "yyyy-mm-dd" para caber num <input type="date">.
            startsAt: r.starts_at ? String(r.starts_at).slice(0, 10) : "",
            endsAt: r.ends_at ? String(r.ends_at).slice(0, 10) : "",
            sortOrder: String(r.sort_order ?? 0),
            isActive: r.is_active,
          })),
        }}
      />
    </div>
  );
}
