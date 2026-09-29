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
    titulo: "Escolha guiada",
    texto: "Cartela de cores e orientação dentro do site, sem sair do fluxo de compra.",
  },
  {
    titulo: "Conferência",
    texto: "Pedido conferido antes do envio: peça, quantidade e cor selecionada.",
  },
];

const ETAPAS_COMPRA = [
  "Escolha a peça",
  "Compare a cor",
  "Revise no carrinho",
  "Conferimos antes do envio",
];

const PROVAS_COMPRA = [
  "Compra segura",
  "Frete por CEP",
  "Envio para todo o Brasil",
  "Conferência de cor antes do envio",
];

export const CATALOGO_COPY: Record<SiteLocale, {
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
  heroCta: string;
  heroCtaSecundario: string;
  precoInicial: string;
  provaTitulo: string;
  provaTexto: string;
  guiaTitulo: string;
  guiaTexto: string;
  guiaBotao: string;
  provas: string[];
}> = {
  pt: {
    eyebrow: "Prótese capilar natural",
    titulo: "Escolha sua prótese capilar e finalize com segurança",
    intro:
      "Peças Reverá com acabamento natural, conferência antes do envio e compra online com frete calculado por CEP. Você compara a cartela, escolhe a cor mais próxima e segue para o checkout.",
    tags: ["Micropele", "Full lace", "Cacheadas", "Afro"],
    vazio: "Nenhuma peça disponível para compra neste momento.",
    manutencaoEyebrow: "Depois da prótese",
    manutencaoTitulo: "Produtos",
    manutencaoTexto: "Itens de manutenção e cuidado para preservar a peça no uso diário.",
    diferenciaisAria: "Diferenciais Reverá",
    diferenciais: COMPARATIVO_PROTESES,
    orientacoesAria: "Orientações de compra",
    orientacao1: "Compra segura, envio para todo o Brasil.",
    orientacao2: "Escolha a cor no site; a equipe confere antes de despachar.",
    etapasAria: "Etapas da compra",
    etapas: ETAPAS_COMPRA,
    badges: ROTULOS_VALOR,
    heroCta: "Escolher minha prótese",
    heroCtaSecundario: "Ver guia de cores",
    precoInicial: "Modelos a partir de R$ 650",
    provaTitulo: "Compra guiada, sem sair do site",
    provaTexto: "A cor é escolhida na página do modelo. Compare a cartela, escolha o tom mais próximo e finalize; a equipe confere antes do envio.",
    guiaTitulo: "Dúvida na cor? Compare a cartela e continue a compra.",
    guiaTexto: "Escolha a cor mais próxima agora. Antes de despachar, a equipe Reverá confere se a peça separada bate com a cor escolhida.",
    guiaBotao: "Ver cartela de cores",
    provas: PROVAS_COMPRA,
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
      { titulo: "Guided choice", texto: "Color chart and guidance inside the site, without leaving the purchase flow." },
      { titulo: "Check", texto: "Order checked before shipping: piece, quantity and selected color." },
    ],
    orientacoesAria: "Purchase guidance",
    orientacao1: "Secure purchase, shipping across Brazil.",
    orientacao2: "Choose the color on the site; the team checks before shipping.",
    etapasAria: "Purchase steps",
    etapas: ["Choose the piece", "Compare the color", "Review the cart", "Checked before shipping"],
    badges: {
      "micropele-008": "Best seller",
      "micropele-006": "Most discreet",
      "cacho-aberto": "Natural movement",
      "cacho-fechado": "Defined curls",
      afro: "Volume and identity",
      "full-lace": "Total lightness",
      australia: "Secure hold",
    },
    heroCta: "Choose my hair system",
    heroCtaSecundario: "I need color help",
    precoInicial: "Models from R$650",
    provaTitulo: "Guided purchase",
    provaTexto: "Color is selected on the model page. Compare the chart, choose the closest shade and continue; the team checks before shipping.",
    guiaTitulo: "Not sure which hair system fits?",
    guiaTexto: "Compare texture, base and use case before choosing.",
    guiaBotao: "See color chart",
    provas: ["Secure purchase", "Shipping by postal code", "Shipping across Brazil", "Color checked before shipping"],
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
      { titulo: "Eleccion guiada", texto: "Carta de colores y orientacion dentro del sitio, sin salir del flujo de compra." },
      { titulo: "Revision", texto: "Pedido revisado antes del envio: pieza, cantidad y color seleccionado." },
    ],
    orientacoesAria: "Orientaciones de compra",
    orientacao1: "Compra segura, envio a todo Brasil.",
    orientacao2: "Elige el color en el sitio; el equipo revisa antes de despachar.",
    etapasAria: "Etapas de la compra",
    etapas: ["Elige la pieza", "Compara el color", "Revisa el carrito", "Revision antes del envio"],
    badges: {
      "micropele-008": "Mas vendida",
      "micropele-006": "Mas discreta",
      "cacho-aberto": "Movimiento natural",
      "cacho-fechado": "Rizos definidos",
      afro: "Volumen e identidad",
      "full-lace": "Ligereza total",
      australia: "Fijacion segura",
    },
    heroCta: "Elegir mi protesis",
    heroCtaSecundario: "Necesito ayuda con el color",
    precoInicial: "Modelos desde R$650",
    provaTitulo: "Compra guiada",
    provaTexto: "El color se elige en la pagina del modelo. Compara la carta, elige el tono mas cercano y sigue; el equipo revisa antes del envio.",
    guiaTitulo: "No sabes cual protesis elegir?",
    guiaTexto: "Compara textura, base e indicacion de uso antes de elegir.",
    guiaBotao: "Ver carta de colores",
    provas: ["Compra segura", "Envio por codigo postal", "Envio a todo Brasil", "Color revisado antes del envio"],
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
      { titulo: "Choix guide", texto: "Nuancier et conseils dans le site, sans quitter le parcours d'achat." },
      { titulo: "Verification", texto: "Commande verifiee avant expedition: piece, quantite et couleur choisie." },
    ],
    orientacoesAria: "Conseils d'achat",
    orientacao1: "Achat securise, livraison dans tout le Bresil.",
    orientacao2: "Choisissez la couleur sur le site; l'equipe verifie avant expedition.",
    etapasAria: "Etapes de l'achat",
    etapas: ["Choisir la piece", "Comparer la couleur", "Verifier le panier", "Verifie avant expedition"],
    badges: {
      "micropele-008": "Meilleure vente",
      "micropele-006": "La plus discrete",
      "cacho-aberto": "Mouvement naturel",
      "cacho-fechado": "Boucles definies",
      afro: "Volume et identite",
      "full-lace": "Legerete totale",
      australia: "Fixation sure",
    },
    heroCta: "Choisir ma prothese",
    heroCtaSecundario: "Besoin d'aide couleur",
    precoInicial: "Modeles des R$650",
    provaTitulo: "Achat guide",
    provaTexto: "La couleur est choisie sur la page du modele. Comparez le nuancier, choisissez la teinte la plus proche et continuez; l'equipe verifie avant expedition.",
    guiaTitulo: "Vous ne savez pas quelle prothese choisir?",
    guiaTexto: "Comparez texture, base et usage avant de choisir.",
    guiaBotao: "Voir les couleurs",
    provas: ["Achat securise", "Livraison par code postal", "Livraison dans tout le Bresil", "Couleur verifiee avant expedition"],
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
      { titulo: "Gefuhrte Auswahl", texto: "Farbkarte und Hinweise innerhalb der Website, ohne den Kaufprozess zu verlassen." },
      { titulo: "Prufung", texto: "Bestellung vor dem Versand gepruft: System, Menge und gewahlte Farbe." },
    ],
    orientacoesAria: "Kaufhinweise",
    orientacao1: "Sicherer Kauf, Versand in ganz Brasilien.",
    orientacao2: "Farbe auf der Website wahlen; das Team pruft vor dem Versand.",
    etapasAria: "Kaufschritte",
    etapas: ["System wahlen", "Farbe vergleichen", "Warenkorb prufen", "Vor Versand gepruft"],
    badges: {
      "micropele-008": "Bestseller",
      "micropele-006": "Am diskretesten",
      "cacho-aberto": "Naturliche Bewegung",
      "cacho-fechado": "Definierte Locken",
      afro: "Volumen und Identitat",
      "full-lace": "Volle Leichtigkeit",
      australia: "Sicherer Halt",
    },
    heroCta: "Haarsystem wahlen",
    heroCtaSecundario: "Hilfe bei der Farbe",
    precoInicial: "Modelle ab R$650",
    provaTitulo: "Gefuhrter Kauf",
    provaTexto: "Die Farbe wird auf der Modellseite gewahlt. Farbkarte vergleichen, nachsten Ton wahlen und fortfahren; das Team pruft vor dem Versand.",
    guiaTitulo: "Nicht sicher, welches System passt?",
    guiaTexto: "Vergleichen Sie Textur, Basis und Anwendung vor der Auswahl.",
    guiaBotao: "Farben ansehen",
    provas: ["Sicherer Kauf", "Versand nach Postleitzahl", "Versand in ganz Brasilien", "Farbe vor Versand gepruft"],
  },
};

export function hrefAjudaCorCatalogo(locale: SiteLocale): string | null {
  return locale === "pt" ? "/cores#ajuda" : null;
}

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
      <header className="overflow-hidden rounded-2xl border border-sand bg-paper shadow-[0_1px_0_rgb(255_255_255_/_0.8)]">
        <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] md:items-center">
          <div className="flex flex-col gap-4">
            <span className="eyebrow-ink">{copy.eyebrow}</span>
            <h1 className="text-balance font-display text-4xl leading-tight text-ink sm:text-5xl">
              {copy.titulo}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-ink/75">{copy.intro}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="#catalogo-titulo"
                className="min-h-toque rounded-xl bg-gold-metal px-5 py-3 text-center text-sm font-semibold text-ink shadow-[0_8px_20px_-10px_rgb(var(--gold-rgb)_/_0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-glow-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {copy.heroCta}
              </a>
              {hrefAjudaCorCatalogo(locale) ? (
                <a
                  href={hrefAjudaCorCatalogo(locale)!}
                  className="min-h-toque rounded-xl border border-ink/20 bg-paper px-5 py-3 text-center text-sm font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-deep hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  {copy.heroCtaSecundario}
                </a>
              ) : null}
            </div>
            <div className="grid gap-2 text-sm text-ink/70 sm:grid-cols-2">
              {copy.provas.map((item) => (
                <span key={item} className="rounded-lg bg-sand/60 px-3 py-2">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-sand bg-sand/45 p-4">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sand">
              <img
                src={fallbackProduto}
                alt="Prótese capilar Reverá com acabamento natural"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">{copy.precoInicial}</p>
              <p className="text-sm leading-6 text-ink/70">{copy.provaTexto}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-sand bg-sand/45 px-6 py-4 sm:px-8">
          <div className="flex flex-wrap gap-2">
            {copy.tags.map((item) => (
              <span key={item} className="rounded-full border border-sand bg-paper/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
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

      {hrefAjudaCorCatalogo(locale) ? (
      <section aria-labelledby="guia-compra-titulo" className="rounded-2xl border border-gold/45 bg-gold/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <span className="eyebrow-ink">{copy.provaTitulo}</span>
            <h2 id="guia-compra-titulo" className="mt-1 font-display text-2xl text-ink">
              {copy.guiaTitulo}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">{copy.guiaTexto}</p>
          </div>
          <a
            href={hrefAjudaCorCatalogo(locale)!}
            className="min-h-toque shrink-0 rounded-xl border border-ink/25 bg-paper px-5 py-3 text-center text-sm font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-deep hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            {copy.guiaBotao}
          </a>
        </div>
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
