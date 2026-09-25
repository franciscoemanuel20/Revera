import type { Metadata } from "next";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createClient } from "@/lib/supabase/server";
import { produtoEstaVendavel, type ProdutoVitrine } from "@/lib/catalog/vitrine";
import { urlDaFotoDoSite } from "@/lib/conteudo/fotos-do-site";
import { apresentacaoDoProduto, prioridadeCatalogoProduto } from "@/lib/catalog/apresentacao";
import { ProductCard } from "@/components/ui/ProductCard";
import { CatalogoGuiado } from "./CatalogoGuiado";
import { type SiteLocale } from "@/lib/i18n/site";

export const metadata: Metadata = {
  title: "Próteses",
  description:
    "Todas as próteses capilares da Reverá: Micropele 0,08mm e 0,06mm, Cacho Aberto, Cacho Fechado e Afro.",
};

const ROTULOS_VALOR: Record<string, string> = {
  "micropele-008": "Mais vendida",
  "micropele-006": "Mais discreta",
  "cacho-aberto": "Movimento natural",
  "cacho-fechado": "Cachos definidos",
  afro: "Volume e identidade",
  "full-lace": "Leveza total",
  australia: "Fixação segura",
};

const COMPARATIVO_PROTESES = [
  {
    titulo: "Naturalidade",
    texto: "Bases, fios e texturas apresentados com clareza para uma escolha mais segura.",
  },
  {
    titulo: "Escolha assistida",
    texto: "Cartela de cores e atendimento para reduzir dúvida antes da compra.",
  },
  {
    titulo: "Conferência",
    texto: "Peça revisada antes do envio e garantia explicada sem letra miúda.",
  },
];

const ETAPAS_COMPRA = [
  "Escolha a peça",
  "Compare a cor",
  "Revise no carrinho",
  "Receba com orientação",
];

const CATALOGO_COPY: Record<SiteLocale, {
  eyebrow: string;
  titulo: string;
  intro: string;
  tags: string[];
  vazio: string;
  manutencaoEyebrow: string;
  manutencaoTitulo: string;
  manutencaoTexto: string;
  diferenciaisAria: string;
  diferenciais: typeof COMPARATIVO_PROTESES;
  orientacoesAria: string;
  orientacao1: string;
  orientacao2: string;
  etapasAria: string;
  etapas: string[];
  badges: Record<string, string>;
}> = {
  pt: {
    eyebrow: "Nossas peças",
    titulo: "Próteses Reverá",
    intro:
      "Escolha por naturalidade, textura e base. Todas as peças passam por conferência antes do envio; a cor é definida na página de cada modelo.",
    tags: ["Micropele", "Full lace", "Cacheadas", "Afro"],
    vazio: "Nenhuma peça disponível para compra neste momento.",
    manutencaoEyebrow: "Depois da prótese",
    manutencaoTitulo: "Produtos",
    manutencaoTexto: "Itens de manutenção e cuidado para preservar a peça no uso diário.",
    diferenciaisAria: "Diferenciais Reverá",
    diferenciais: COMPARATIVO_PROTESES,
    orientacoesAria: "Orientações de compra",
    orientacao1: "Compra segura, envio para todo o Brasil.",
    orientacao2: "Atendimento para ajudar na escolha da cor.",
    etapasAria: "Etapas da compra",
    etapas: ETAPAS_COMPRA,
    badges: ROTULOS_VALOR,
  },
  en: {
    eyebrow: "Our pieces",
    titulo: "Revera hair systems",
    intro:
      "Choose by natural look, texture and base. Every piece is checked before shipping; color is selected on each model page.",
    tags: ["Micropele", "Full lace", "Curly", "Afro"],
    vazio: "No piece is available for purchase at this moment.",
    manutencaoEyebrow: "After the hair system",
    manutencaoTitulo: "Products",
    manutencaoTexto: "Maintenance and care items to preserve the piece in daily use.",
    diferenciaisAria: "Revera advantages",
    diferenciais: [
      { titulo: "Natural look", texto: "Bases, strands and textures presented clearly for a safer choice." },
      { titulo: "Guided choice", texto: "Color chart and support to reduce uncertainty before purchase." },
      { titulo: "Check", texto: "Piece reviewed before shipping and warranty explained clearly." },
    ],
    orientacoesAria: "Purchase guidance",
    orientacao1: "Secure purchase, shipping across Brazil.",
    orientacao2: "Support to help choose the color.",
    etapasAria: "Purchase steps",
    etapas: ["Choose the piece", "Compare the color", "Review the cart", "Receive with guidance"],
    badges: {
      "micropele-008": "Best seller",
      "micropele-006": "Most discreet",
      "cacho-aberto": "Natural movement",
      "cacho-fechado": "Defined curls",
      afro: "Volume and identity",
      "full-lace": "Total lightness",
      australia: "Secure hold",
    },
  },
  es: {
    eyebrow: "Nuestras piezas",
    titulo: "Protesis Revera",
    intro:
      "Elige por naturalidad, textura y base. Todas las piezas pasan por revision antes del envio; el color se define en la pagina de cada modelo.",
    tags: ["Micropele", "Full lace", "Rizadas", "Afro"],
    vazio: "No hay piezas disponibles para compra en este momento.",
    manutencaoEyebrow: "Despues de la protesis",
    manutencaoTitulo: "Productos",
    manutencaoTexto: "Itens de mantenimiento y cuidado para preservar la pieza en el uso diario.",
    diferenciaisAria: "Diferenciales Revera",
    diferenciais: [
      { titulo: "Naturalidad", texto: "Bases, cabellos y texturas presentados con claridad para una eleccion mas segura." },
      { titulo: "Eleccion guiada", texto: "Carta de colores y atencion para reducir dudas antes de comprar." },
      { titulo: "Revision", texto: "Pieza revisada antes del envio y garantia explicada sin letra chica." },
    ],
    orientacoesAria: "Orientaciones de compra",
    orientacao1: "Compra segura, envio a todo Brasil.",
    orientacao2: "Atencion para ayudar a elegir el color.",
    etapasAria: "Etapas de la compra",
    etapas: ["Elige la pieza", "Compara el color", "Revisa el carrito", "Recibe con orientacion"],
    badges: {
      "micropele-008": "Mas vendida",
      "micropele-006": "Mas discreta",
      "cacho-aberto": "Movimiento natural",
      "cacho-fechado": "Rizos definidos",
      afro: "Volumen e identidad",
      "full-lace": "Ligereza total",
      australia: "Fijacion segura",
    },
  },
  fr: {
    eyebrow: "Nos pieces",
    titulo: "Protheses Revera",
    intro:
      "Choisissez selon l'aspect naturel, la texture et la base. Chaque piece est verifiee avant expedition; la couleur est choisie sur la page de chaque modele.",
    tags: ["Micropele", "Full lace", "Bouclees", "Afro"],
    vazio: "Aucune piece n'est disponible a l'achat pour le moment.",
    manutencaoEyebrow: "Apres la prothese",
    manutencaoTitulo: "Produits",
    manutencaoTexto: "Articles d'entretien et de soin pour preserver la piece au quotidien.",
    diferenciaisAria: "Avantages Revera",
    diferenciais: [
      { titulo: "Aspect naturel", texto: "Bases, cheveux et textures presentes clairement pour un choix plus sur." },
      { titulo: "Choix guide", texto: "Nuancier et accompagnement pour reduire les doutes avant l'achat." },
      { titulo: "Verification", texto: "Piece controlee avant expedition et garantie expliquee clairement." },
    ],
    orientacoesAria: "Conseils d'achat",
    orientacao1: "Achat securise, livraison dans tout le Bresil.",
    orientacao2: "Accompagnement pour aider au choix de la couleur.",
    etapasAria: "Etapes de l'achat",
    etapas: ["Choisir la piece", "Comparer la couleur", "Verifier le panier", "Recevoir avec conseils"],
    badges: {
      "micropele-008": "Meilleure vente",
      "micropele-006": "La plus discrete",
      "cacho-aberto": "Mouvement naturel",
      "cacho-fechado": "Boucles definies",
      afro: "Volume et identite",
      "full-lace": "Legerete totale",
      australia: "Fixation sure",
    },
  },
  de: {
    eyebrow: "Unsere Systeme",
    titulo: "Revera Haarsysteme",
    intro:
      "Wahlen Sie nach naturlicher Optik, Textur und Basis. Jedes System wird vor dem Versand gepruft; die Farbe wird auf der jeweiligen Modellseite gewahlt.",
    tags: ["Micropele", "Full lace", "Lockig", "Afro"],
    vazio: "Zurzeit ist kein System zum Kauf verfugbar.",
    manutencaoEyebrow: "Nach dem Haarsystem",
    manutencaoTitulo: "Produkte",
    manutencaoTexto: "Pflege- und Wartungsartikel, um das System im Alltag zu erhalten.",
    diferenciaisAria: "Revera Vorteile",
    diferenciais: [
      { titulo: "Naturlicher Look", texto: "Basen, Haare und Texturen klar dargestellt fur eine sichere Wahl." },
      { titulo: "Gefuhrte Auswahl", texto: "Farbkarte und Betreuung, um Unsicherheit vor dem Kauf zu reduzieren." },
      { titulo: "Prufung", texto: "System vor dem Versand kontrolliert und Garantie klar erklart." },
    ],
    orientacoesAria: "Kaufhinweise",
    orientacao1: "Sicherer Kauf, Versand in ganz Brasilien.",
    orientacao2: "Betreuung bei der Farbauswahl.",
    etapasAria: "Kaufschritte",
    etapas: ["System wahlen", "Farbe vergleichen", "Warenkorb prufen", "Mit Anleitung erhalten"],
    badges: {
      "micropele-008": "Bestseller",
      "micropele-006": "Am diskretesten",
      "cacho-aberto": "Naturliche Bewegung",
      "cacho-fechado": "Definierte Locken",
      afro: "Volumen und Identitat",
      "full-lace": "Volle Leichtigkeit",
      australia: "Sicherer Halt",
    },
  },
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
export async function ProdutosContent({ locale = "pt" }: { locale?: SiteLocale } = {}) {
  const copy = CATALOGO_COPY[locale];
  const supabase = await createClient();
  const fallbackProduto = await urlDaFotoDoSite("/media/hero/produto-close-1.jpeg");

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

      const apresentacao = apresentacaoDoProduto(p.slug as string, p.name as string);

      return {
        paraVitrine,
        slug: p.slug as string,
        name: p.name as string,
        titulo: apresentacao.titulo,
        resumo: apresentacao.resumo,
        textura: apresentacao.textura,
        prioridade: apresentacao.prioridade,
        description: (p.description as string | null) ?? null,
        isFeatured: Boolean(p.is_featured),
        priceCents: precos.length > 0 ? Math.min(...precos) : null,
        /**
         * Mesmo fallback da página do produto (ProdutoInterativo.tsx, linha
         * do `/media/hero`): a Micropele 0,08 e a 0,06 ainda não têm linha em
         * `product_media`, e sem isto os dois cards do catálogo saíam como
         * retângulo cinza — no celular, metade da tela vazia logo na entrada.
         */
        imageUrl: (foto?.url as string | undefined) ?? fallbackProduto,
        imageAlt: (foto?.alt_text as string | undefined) ?? null,
      };
    })
    .filter((p) => produtoEstaVendavel(p.paraVitrine));

  // Ordem pedida pelo Francisco em 21/09/2026: todas as próteses primeiro,
  // produtos (manutenção etc.) só depois — nunca misturados na mesma lista.
  // A regra não pode depender só dos slugs antigos de APRESENTACOES: produto
  // novo de prótese precisa continuar no topo, enquanto cola/fita/removedor
  // devem cair na seção "Produtos".
  const proteses = vendaveis
    .filter((p) => prioridadeCatalogoProduto(p.slug, p.name) === 0)
    .sort((a, b) => a.paraVitrine.sortOrder - b.paraVitrine.sortOrder);
  const produtosManutencao = vendaveis
    .filter((p) => prioridadeCatalogoProduto(p.slug, p.name) === 1)
    .sort((a, b) => a.paraVitrine.sortOrder - b.paraVitrine.sortOrder);

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-20"
      style={{ paddingTop: HEADER_HEIGHT_PX + 48 }}
    >
      <header className="rounded-2xl border border-sand bg-paper p-6 shadow-[0_1px_0_rgb(255_255_255_/_0.8)] sm:p-8">
        <div className="flex flex-col gap-3">
          <span className="eyebrow-ink">{copy.eyebrow}</span>
          <h1 className="text-balance font-display text-4xl text-ink">{copy.titulo}</h1>
          <p className="max-w-2xl text-ink/70">{copy.intro}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {copy.tags.map((item) => (
              <span key={item} className="rounded-full border border-sand bg-sand/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                {item}
              </span>
            ))}
          </div>
        </div>
      </header>

      {proteses.length > 0 ? <CatalogoGuiado locale={locale} produtos={proteses} /> : (
        <p className="text-ink/70">
          {copy.vazio}
        </p>
      )}

      {produtosManutencao.length > 0 ? (
        <section aria-labelledby="produtos-titulo" className="flex flex-col gap-4 border-t border-sand pt-8">
          <div>
            <span className="eyebrow-ink">{copy.manutencaoEyebrow}</span>
            <h2 id="produtos-titulo" className="font-display text-2xl text-ink">{copy.manutencaoTitulo}</h2>
            <p className="text-sm text-ink/70">{copy.manutencaoTexto}</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {produtosManutencao.map((produto) => (
              <li key={produto.slug}>
                <ProductCard
                  slug={produto.slug}
                  name={produto.name}
                  imageUrl={produto.imageUrl}
                  imageAlt={produto.imageAlt}
                  priceCents={produto.priceCents}
                  isFeatured={produto.isFeatured}
                  badge={copy.badges[produto.slug] ?? null}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label={copy.diferenciaisAria} className="grid gap-3 border-t border-sand pt-8 sm:grid-cols-3">
        {copy.diferenciais.map((item) => (
          <div key={item.titulo} className="rounded-xl border border-sand bg-paper/70 p-4">
            <h2 className="font-display text-base text-ink">{item.titulo}</h2>
            <p className="mt-1 text-sm leading-5 text-ink/65">{item.texto}</p>
          </div>
        ))}
      </section>

      <section aria-label={copy.orientacoesAria} className="grid gap-3 text-sm text-ink/70 sm:grid-cols-2">
        <div className="rounded-lg bg-sand/70 px-4 py-3">
          {copy.orientacao1}
        </div>
        <div className="rounded-lg bg-sand/70 px-4 py-3">
          {copy.orientacao2}
        </div>
      </section>

      <section aria-label={copy.etapasAria} className="rounded-2xl border border-sand bg-ink px-5 py-4 text-paper shadow-soft">
        <ol className="grid gap-3 text-sm sm:grid-cols-4">
          {copy.etapas.map((etapa, index) => (
            <li key={etapa} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-metal text-xs font-semibold text-ink">
                {index + 1}
              </span>
              <span className="text-paper/85">{etapa}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

export default async function ProdutosPage() {
  return <ProdutosContent />;
}
