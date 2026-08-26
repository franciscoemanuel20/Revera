import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProdutoInterativo } from "./ProdutoInterativo";

// Página pública de produto — client de servidor com a chave anon
// (createClient, não createAdminClient): a policy "public read active
// products" (supabase/migrations/00000000000001_init.sql) já resolve quem
// pode ver o quê, sem precisar de sessão. Se o produto não existir OU
// estiver fora dessa policy (status != 'active'), a query simplesmente não
// devolve linha — os dois casos viram notFound(), porque para quem visita
// o site são indistinguíveis (não vamos vazar "existe mas está oculto").
//
// Hoje (25/08/2026) a Micropele nasce com status='draft' e a variante
// única com is_active=false, porque não existe preço definido ainda (ver
// seeds/products.json e docs/fundacao-25-08-2026.md) — então visitar esta
// rota mostra 404 até o Francisco definir o preço e ativar o produto pelo
// painel admin (/admin/produtos), que já faz isso. Não é bug desta página.
export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: produto } = await supabase
    .from("products")
    .select(
      "id, slug, name, description, base_thickness_mm, is_featured, product_variants(id, color_id, price_cents, compare_at_price_cents, sku, stock_qty)"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!produto) {
    notFound();
  }

  const [{ data: colors }, { data: regras }] = await Promise.all([
    supabase
      .from("colors")
      .select("id, code, name, hex_preview, photo_url")
      .order("sort_order"),
    supabase
      .from("quantity_discount_rules")
      .select("min_qty, unit_price_cents, discount_percent, label, starts_at, ends_at")
      .eq("product_id", produto.id)
      .order("min_qty"),
  ]);

  const variantes = (produto.product_variants ?? []).map((v) => ({
    id: v.id as string,
    colorId: (v.color_id as string | null) ?? null,
    priceCents: v.price_cents as number,
    compareAtPriceCents: (v.compare_at_price_cents as number | null) ?? null,
    sku: v.sku as string,
    stockQty: v.stock_qty as number,
  }));

  const agora = new Date();
  const regrasVigentes = (regras ?? [])
    .filter((r) => {
      if (r.starts_at && new Date(r.starts_at as string) > agora) return false;
      if (r.ends_at && new Date(r.ends_at as string) < agora) return false;
      return true;
    })
    .map((r) => ({
      minQty: r.min_qty as number,
      unitPriceCents: (r.unit_price_cents as number | null) ?? null,
      discountPercent: (r.discount_percent as number | null) ?? null,
      label: (r.label as string | null) ?? null,
      // RLS ("public read discount rules") já filtra is_active=true — a
      // linha só chega aqui se estiver ativa, então o campo nasce true.
      isActive: true,
    }));

  return (
    <ProdutoInterativo
      name={produto.name}
      description={produto.description}
      baseThicknessMm={produto.base_thickness_mm}
      variants={variantes}
      colors={(colors ?? []).map((c) => ({
        id: c.id as string,
        code: c.code as string,
        name: c.name as string,
        hexPreview: (c.hex_preview as string | null) ?? null,
        photoUrl: (c.photo_url as string | null) ?? null,
      }))}
      discountRules={regrasVigentes}
    />
  );
}
