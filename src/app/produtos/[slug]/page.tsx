import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baseUrl } from "@/lib/config/urls";
import { textosDaPagina } from "@/lib/conteudo/textos";
import { itensDaTrustBar } from "@/lib/conteudo/registro/trustbar";
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
      "id, slug, name, description, base_thickness_mm, is_featured, product_variants(id, color_id, price_cents, compare_at_price_cents, sku, stock_qty, is_active), product_media(url, alt_text, type, is_primary, sort_order, variant_id)"
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
      /**
       * A foto pertence a uma VARIANTE específica? (29/08/2026)
       *
       * `product_media.variant_id` já existia no schema e nunca era lido.
       * Quando preenchido, a foto deixa de ser genérica e passa a ser "a
       * peça naquela cor" — clicar nela escolhe a cor, e escolher a cor traz
       * a foto dela para a galeria. Hoje nenhuma linha tem variant_id, então
       * nada muda na tela; o dia em que alguém fotografar a peça por cor,
       * funciona sem tocar em código.
       */
      variantId: (m.variant_id as string | null) ?? null,
    }));

  /**
   * AS OUTRAS TEXTURAS (29/08/2026).
   *
   * Cacheado, crespo e afro não são variantes da Micropele — são PRODUTOS
   * próprios, com preço próprio (R$ 750 contra R$ 650). Quem chega na
   * Micropele procurando cacheado não tinha como saber que os outros
   * existem: até hoje nenhuma página linkava para eles.
   *
   * Então em vez de inventar uma dimensão nova de variante, esta tira mostra
   * os outros produtos ativos e leva até eles. Sai do banco, não de uma lista
   * escrita à mão — produto que for despublicado some daqui sozinho.
   */
  const { data: outros } = await supabase
    .from("products")
    .select("slug, name, sort_order, product_variants(is_active, price_cents, stock_qty), product_media(url, type, is_primary, sort_order)")
    .eq("status", "active")
    .neq("slug", produto.slug as string)
    .order("sort_order");

  const outrasTexturas = (outros ?? [])
    .map((p) => {
      const vendaveis = (p.product_variants ?? []).filter(
        (v) => v.is_active && (v.price_cents as number) > 0 && (v.stock_qty as number) > 0
      );
      const foto = (p.product_media ?? [])
        .filter((m) => (m.type ?? "image") === "image")
        .sort((a, b) => {
          if (Boolean(b.is_primary) !== Boolean(a.is_primary)) return Boolean(b.is_primary) ? 1 : -1;
          return ((a.sort_order as number | null) ?? 0) - ((b.sort_order as number | null) ?? 0);
        })[0];
      return {
        slug: p.slug as string,
        name: p.name as string,
        priceCents: vendaveis.length > 0 ? Math.min(...vendaveis.map((v) => v.price_cents as number)) : null,
        imageUrl: (foto?.url as string | undefined) ?? null,
        vendavel: vendaveis.length > 0,
      };
    })
    .filter((p) => p.vendavel);

  /**
   * A CARTELA SÓ MOSTRA O QUE ESTE PRODUTO TEM (29/08/2026).
   *
   * `colors` é uma tabela global; as variantes é que dizem quais cores cada
   * peça realmente existe. Enquanto todo produto tinha as oito cores isso
   * não aparecia — mas o Francisco definiu que grisalho é só na Micropele
   * 0,08 e que as outras quatro saem só na 1B (castanho escuro).
   *
   * Sem este filtro a página da Afro mostraria oito bolinhas, o cliente
   * clicaria na 5, e o botão ficaria cinza sem explicar por quê: existe cor
   * selecionada, mas não existe variante para ela. Beco sem saída.
   */
  const coresComVariante = new Set(
    variantes.map((v) => v.colorId).filter((id): id is string => Boolean(id))
  );
  const coresDesteProduto = (colors ?? []).filter((c) =>
    coresComVariante.has(c.id as string)
  );

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

  // Os selos da TrustBar (grupo "trustbar") aparecem aqui E na home, então a
  // edição do painel precisa valer nos dois. Lê-se com o leitor sem cookie de
  // textos.ts — o MESMO que a home usa — de propósito: ele traz a edição por
  // cima do padrão do código e não puxa a sessão do visitante. Esta página já
  // é dinâmica (createClient acima lê cookie), então isto não muda seu regime;
  // e se o banco não responder, itensDaTrustBar cai no `padrao` do registro,
  // que é o texto de código — nunca uma barra vazia. Ver registro/trustbar.ts.
  const tSelos = await textosDaPagina("trustbar");

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
      colors={coresDesteProduto.map((c) => ({
        id: c.id as string,
        code: c.code as string,
        name: c.name as string,
        hexPreview: (c.hex_preview as string | null) ?? null,
        photoUrl: (c.photo_url as string | null) ?? null,
      }))}
      discountRules={regrasVigentes}
      outrasTexturas={outrasTexturas}
      itensTrustBar={itensDaTrustBar(tSelos)}
    />
    </>
  );
}
