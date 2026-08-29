import type { Metadata } from "next";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { ProductCard } from "@/components/ui/ProductCard";
import { createClient } from "@/lib/supabase/server";
import { produtoEstaVendavel, type ProdutoVitrine } from "@/lib/catalog/vitrine";

export const metadata: Metadata = {
  title: "Próteses",
  description:
    "Todas as próteses capilares da Reverá: Micropele 0,08mm e 0,06mm, Cacho Aberto, Cacho Fechado e Afro.",
};

/**
 * O CATÁLOGO — a página que faltava (29/08/2026).
 *
 * ===========================================================================
 * POR QUE ELA EXISTE
 * ===========================================================================
 * A auditoria de compra de 29/08/2026 encontrou cinco produtos ativos,
 * publicados, com preço, cor e botão de comprar — e só UM alcançável. A home
 * levava à Micropele 0,08mm; Micropele 0,06mm, Cacho Aberto, Cacho Fechado e
 * Afro (R$ 750 cada) não eram linkados de nenhuma das nove páginas do site, e
 * `/produtos` respondia 404. Quem quisesse um Cacho Fechado teria que
 * adivinhar a URL.
 *
 * Não foi decisão de esconder: os quatro estão `status = 'active'` no banco,
 * aparecem no sitemap.xml e têm página própria funcionando. Eram órfãos por
 * falta de uma tela de listagem, não por intenção.
 *
 * Regra de exibição: `produtoEstaVendavel` — o mesmo juiz que a home usa para
 * escolher o produto do botão principal. Produto sem variante ativa, sem
 * preço ou sem estoque NÃO aparece aqui, porque um card que leva a uma página
 * onde não dá para comprar é pior que card nenhum.
 */
export default async function ProdutosPage() {
  const supabase = await createClient();

  const { data: produtos } = await supabase
    .from("products")
    .select(
      "slug, name, description, is_featured, sort_order, product_variants(is_active, price_cents, compare_at_price_cents, stock_qty), product_media(url, alt_text, type, is_primary, sort_order)"
    )
    .order("sort_order");

  const vendaveis = (produtos ?? [])
    .map((p) => {
      const variantes = (p.product_variants ?? []).map((v) => ({
        isActive: Boolean(v.is_active),
        // price_cents é not null no schema; o ?? 0 existe só para o tipo —
        // e um 0 aqui reprova em produtoEstaVendavel, que é o desfecho certo.
        priceCents: (v.price_cents as number | null) ?? 0,
        stockQty: (v.stock_qty as number | null) ?? 0,
      }));

      const paraVitrine: ProdutoVitrine = {
        slug: p.slug as string,
        name: p.name as string,
        isFeatured: Boolean(p.is_featured),
        sortOrder: (p.sort_order as number | null) ?? 0,
        variants: variantes,
      };

      // O menor preço entre as variantes vendáveis — com cor virando
      // variante (scripts/criar-variantes-por-cor.mjs) são 8 por produto,
      // todas do mesmo preço hoje; pegar o menor mantém o card honesto se
      // algum dia uma cor custar diferente.
      const precos = variantes
        .filter((v) => v.isActive && v.priceCents > 0)
        .map((v) => v.priceCents);

      const foto = (p.product_media ?? [])
        .filter((m) => (m.type ?? "image") === "image")
        .sort((a, b) => {
          if (Boolean(b.is_primary) !== Boolean(a.is_primary)) {
            return Boolean(b.is_primary) ? 1 : -1;
          }
          return ((a.sort_order as number | null) ?? 0) - ((b.sort_order as number | null) ?? 0);
        })[0];

      return {
        paraVitrine,
        slug: p.slug as string,
        name: p.name as string,
        description: (p.description as string | null) ?? null,
        isFeatured: Boolean(p.is_featured),
        priceCents: precos.length > 0 ? Math.min(...precos) : null,
        /**
         * Mesmo fallback da página do produto (ProdutoInterativo.tsx, linha
         * do `/media/hero`): a Micropele 0,08 e a 0,06 ainda não têm linha em
         * `product_media`, e sem isto os dois cards do catálogo saíam como
         * retângulo cinza — no celular, metade da tela vazia logo na entrada.
         */
        imageUrl: (foto?.url as string | undefined) ?? "/media/hero/produto-close-1.jpeg",
        imageAlt: (foto?.alt_text as string | undefined) ?? null,
      };
    })
    .filter((p) => produtoEstaVendavel(p.paraVitrine));

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-20"
      style={{ paddingTop: HEADER_HEIGHT_PX + 48 }}
    >
      <header className="flex flex-col gap-3">
        <span className="eyebrow-ink">Nossas peças</span>
        <h1 className="font-display text-4xl text-ink">Próteses Reverá</h1>
        <p className="max-w-2xl text-ink/70">
          Todas feitas sob encomenda, testadas antes do envio e com sete dias
          úteis de garantia. A cor é escolhida na página de cada peça.
        </p>
      </header>

      {vendaveis.length > 0 ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vendaveis.map((produto) => (
            <li key={produto.slug}>
              <ProductCard
                slug={produto.slug}
                name={produto.name}
                imageUrl={produto.imageUrl}
                priceCents={produto.priceCents}
                isFeatured={produto.isFeatured}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink/70">
          Nenhuma peça disponível para compra neste momento.
        </p>
      )}
    </main>
  );
}
