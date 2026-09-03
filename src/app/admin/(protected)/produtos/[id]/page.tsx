import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_MIDIA } from "@/lib/conteudo/midia";
import { listarFotosDoRepositorio } from "@/lib/conteudo/fotos-do-repositorio";
import { ProductForm } from "../ProductForm";
import { FotosDoProduto, type FotoDisponivel } from "../FotosDoProduto";

// cents -> string de reais com 2 casas fixas, para não jogar float bruto
// (ex.: "123.45000000000001") no valor de um <input type="number">.
function centavosParaTexto(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: produto }, { data: variantes }, { data: regras }, { data: sizes }, { data: colors }, { data: grayLevels }, { data: fotos }] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", id).maybeSingle(),
      supabase.from("product_variants").select("*").eq("product_id", id).order("created_at"),
      supabase.from("quantity_discount_rules").select("*").eq("product_id", id).order("min_qty"),
      supabase.from("sizes").select("id, label").order("sort_order"),
      // `is_active` entra na leitura porque a tela de fotos avisa quando a cor
      // está desativada: a foto até grava, mas o cliente nunca chega nela.
      supabase.from("colors").select("id, code, name, is_active").order("sort_order"),
      supabase.from("gray_levels").select("id, percent, label").order("sort_order"),
      supabase
        .from("product_media")
        .select("id, url, alt_text, type, variant_id, sort_order, is_primary")
        .eq("product_id", id)
        .order("sort_order"),
    ]);

  if (!produto) {
    // Sem RLS de admin aplicada ainda, isto também acontece para produto
    // que existe mas está fora da policy pública (status != 'active') —
    // ver comentário em src/app/admin/produtos/page.tsx.
    notFound();
  }

  /**
   * As variantes viram opções de COR na tela de fotos — "variante" é jargão,
   * e neste catálogo variante é (produto × cor). Variante sem cor fica de fora
   * da lista: escolher "sem cor" ali seria o mesmo que deixar a foto geral, e
   * duas opções para a mesma coisa só confundem.
   */
  const corPorId = new Map(
    (colors ?? []).map((c) => [
      c.id as string,
      { rotulo: c.name as string, ativa: c.is_active !== false },
    ])
  );

  const variantesParaFoto = (variantes ?? [])
    .filter((v) => v.color_id)
    .map((v) => {
      const cor = corPorId.get(v.color_id as string);
      return {
        id: v.id as string,
        rotulo: cor ? `Cor ${cor.rotulo}` : `Variante ${v.sku as string}`,
        corAtiva: cor?.ativa ?? true,
      };
    });

  /**
   * O que pode ser escolhido como foto: o que foi enviado pelo painel (bucket
   * "site-media") e o que veio junto com o código (public/media). São as duas
   * origens que a Biblioteca de fotos já mostra — aqui elas viram opções de um
   * campo, para ninguém precisar copiar e colar URL entre duas abas.
   *
   * Nenhuma das duas leituras derruba a página: bucket ausente (migration 12
   * não aplicada) e pasta ausente viram lista vazia, e o campo continua
   * utilizável com o que sobrou.
   */
  const { data: objetos } = await supabase.storage
    .from(BUCKET_MIDIA)
    .list("", { sortBy: { column: "created_at", order: "desc" } });

  const enviadas: FotoDisponivel[] = (objetos ?? [])
    .filter((item) => item.metadata != null)
    .map((item) => ({
      url: supabase.storage.from(BUCKET_MIDIA).getPublicUrl(item.name).data.publicUrl,
      rotulo: item.name,
      grupo: "Enviadas pelo painel",
    }));

  const doRepositorio: FotoDisponivel[] = (await listarFotosDoRepositorio()).map((f) => ({
    url: f.caminho,
    rotulo: f.caminho,
    grupo: "Vieram com o site",
  }));

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
          // Sem isto, salvar um produto pelo formulário apagaria os dados
          // fiscais já preenchidos: o payload manda o estado do formulário
          // inteiro, e um campo que nasce vazio grava vazio.
          exportacao: {
            descriptionEn: produto.description_en ?? "",
            countryOfOrigin: produto.country_of_origin ?? "",
            ncm: produto.ncm ?? "",
            hsCode: produto.hs_code ?? "",
            netWeightG: produto.net_weight_g != null ? String(produto.net_weight_g) : "",
            grossWeightG: produto.gross_weight_g != null ? String(produto.gross_weight_g) : "",
            lengthMm: produto.length_mm != null ? String(produto.length_mm) : "",
            widthMm: produto.width_mm != null ? String(produto.width_mm) : "",
            heightMm: produto.height_mm != null ? String(produto.height_mm) : "",
          },
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

      <FotosDoProduto
        productId={produto.id as string}
        variantes={variantesParaFoto}
        disponiveis={[...enviadas, ...doRepositorio]}
        fotosIniciais={(fotos ?? []).map((m) => ({
          id: m.id as string,
          url: m.url as string,
          altText: (m.alt_text as string | null) ?? "",
          variantId: (m.variant_id as string | null) ?? null,
          sortOrder: (m.sort_order as number | null) ?? 0,
          isPrimary: Boolean(m.is_primary),
          tipo: (m.type as string) === "video" ? "video" : "image",
        }))}
      />
    </div>
  );
}
