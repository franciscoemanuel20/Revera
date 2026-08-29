import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baseUrl } from "@/lib/config/urls";
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
/**
 * Título e descrição próprios do produto (P1, 27/08/2026).
 *
 * Antes desta entrega, esta página herdava o título genérico do layout — a
 * página que mais importa para busca ("micropele", "prótese capilar") era
 * indistinguível das outras nove no índice do Google.
 *
 * Consulta separada e enxuta de propósito: `generateMetadata` roda ANTES do
 * componente e não compartilha resultado com ele. Reusar a consulta grande
 * (com variantes, cores e regras de desconto) só para montar um título
 * dobraria o trabalho do banco em toda visita.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name, description, seo_title, seo_description")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return { title: "Produto não encontrado" };

  // seo_title/seo_description são editáveis pela dona no painel; o nome e a
  // descrição do produto são o padrão quando ela não preencheu.
  const titulo = (data.seo_title as string | null) || (data.name as string);
  const descricao =
    (data.seo_description as string | null) ||
    (data.description as string | null) ||
    "Prótese capilar Reverá — acabamento natural, envio para todo o Brasil.";

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/produtos/${slug}` },
    openGraph: {
      type: "website",
      title: `${titulo} — Reverá`,
      description: descricao,
      url: `/produtos/${slug}`,
    },
  };
}

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
      "id, slug, name, description, base_thickness_mm, is_featured, product_variants(id, color_id, price_cents, compare_at_price_cents, sku, stock_qty, is_active), product_media(url, alt_text, type, is_primary, sort_order)"
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

  /**
   * Variante inativa nunca chega à tela (29/08/2026).
   *
   * A consulta trazia TODAS as variantes do produto, inclusive as
   * desativadas. Depois que as variantes genéricas sem cor foram aposentadas
   * (scripts/criar-variantes-por-cor.mjs), deixá-las passar faria a página
   * cair de volta na variante sem cor — exatamente o defeito que estava
   * sendo corrigido. A policy pública já filtra `is_active`, mas esta página
   * lê com cliente admin, então o filtro precisa ser explícito aqui.
   */
  const variantes = (produto.product_variants ?? [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({
    id: v.id as string,
    colorId: (v.color_id as string | null) ?? null,
    priceCents: v.price_cents as number,
    compareAtPriceCents: (v.compare_at_price_cents as number | null) ?? null,
    sku: v.sku as string,
    stockQty: v.stock_qty as number,
    }));

  // Galeria do produto: a principal primeiro, depois a ordem cadastrada.
  // Só imagem — `product_media` também aceita 'video', que a galeria da
  // página ainda não sabe tocar (o <Image> do Next quebraria com um .mp4).
  const fotos = (produto.product_media ?? [])
    .filter((m) => m.type === "image")
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return (a.sort_order as number) - (b.sort_order as number);
    })
    .map((m) => ({
      src: m.url as string,
      alt: (m.alt_text as string | null) ?? produto.name,
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

  /**
   * Product structured data (schema.org), em JSON-LD.
   *
   * É o que permite ao Google entender que esta página é um PRODUTO com
   * preço e disponibilidade, e não um artigo — pré-requisito para aparecer
   * com preço no resultado de busca.
   *
   * O preço vem da variante ativa mais barata, lida do banco. NUNCA de
   * constante: um preço errado aqui é o Google anunciando um valor que a
   * loja não pratica, e a correção depois de indexado é lenta.
   *
   * Sem variante com preço válido, o bloco não é emitido — declarar
   * `price: 0` diria ao Google que a peça é grátis.
   */
  const varianteMaisBarata = variantes
    .filter((v) => v.priceCents > 0 && v.stockQty > 0)
    .sort((a, b) => a.priceCents - b.priceCents)[0];

  const jsonLd = varianteMaisBarata
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: produto.name,
        description: produto.description ?? undefined,
        sku: varianteMaisBarata.sku,
        brand: { "@type": "Brand", name: "Reverá" },
        offers: {
          "@type": "Offer",
          priceCurrency: "BRL",
          price: (varianteMaisBarata.priceCents / 100).toFixed(2),
          availability: "https://schema.org/InStock",
          url: `${baseUrl()}/produtos/${produto.slug}`,
        },
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // O conteúdo é montado aqui a partir de dados do banco, não de
          // entrada de usuário; ainda assim o JSON.stringify escapa o que
          // precisa ser escapado.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
    <ProdutoInterativo
      name={produto.name}
      description={produto.description}
      baseThicknessMm={produto.base_thickness_mm}
      fotos={fotos}
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
    </>
  );
}
