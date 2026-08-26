import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrecosForm } from "./PrecosForm";

export default async function PrecosProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: produto }, { data: variantes }, { data: regras }] = await Promise.all([
    supabase.from("products").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("product_variants").select("price_cents").eq("product_id", id).eq("is_active", true),
    supabase.from("quantity_discount_rules").select("*").eq("product_id", id).order("min_qty"),
  ]);

  if (!produto) {
    notFound();
  }

  // Preço-base para a prévia do "efeito do desconto": o menor preço entre
  // as variantes ativas, mesma ideia de src/app/admin/(protected)/produtos/page.tsx
  // para a coluna de faixa de preço da lista de produtos.
  const precos = (variantes ?? []).map((v) => v.price_cents as number).filter((p) => p != null);
  const basePriceCents = precos.length > 0 ? Math.min(...precos) : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">Preços — {produto.name}</h1>
      {basePriceCents === 0 ? (
        <p className="rounded-md border border-sand bg-paper px-4 py-3 text-sm text-ink/70">
          Este produto ainda não tem variante ativa com preço — a prévia do efeito do desconto só
          aparece quando existir um preço-base para calcular em cima.
        </p>
      ) : null}
      <PrecosForm
        productId={produto.id}
        basePriceCents={basePriceCents}
        initialRules={(regras ?? []).map((r) => ({
          key: r.id,
          id: r.id,
          minQty: String(r.min_qty),
          mode: r.unit_price_cents != null ? "preco" : "percentual",
          unitPriceReais: r.unit_price_cents != null ? (r.unit_price_cents / 100).toFixed(2) : "",
          discountPercent: r.discount_percent != null ? String(r.discount_percent) : "",
          label: r.label ?? "",
          startsAt: r.starts_at ? String(r.starts_at).slice(0, 10) : "",
          endsAt: r.ends_at ? String(r.ends_at).slice(0, 10) : "",
          sortOrder: String(r.sort_order ?? 0),
          isActive: r.is_active,
        }))}
      />
    </div>
  );
}
