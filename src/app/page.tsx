import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { BeneficioCard } from "@/components/ui/BeneficioCard";
import { FAQ } from "@/components/ui/FAQ";
import { PassosNumerados } from "@/components/ui/PassosNumerados";
import { Reveal } from "@/components/ui/Reveal";
import { SocialProof } from "@/components/ui/SocialProof";
import { TrustBar } from "@/components/ui/TrustBar";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createClient } from "@/lib/supabase/server";
import { textosDaPagina } from "@/lib/conteudo/textos";
import { urlDaFotoDoSite } from "@/lib/conteudo/fotos-do-site";
import {
  escolherProdutoVitrine,
  linkDoProdutoVitrine,
  produtoEstaVendavel,
} from "@/lib/catalog/vitrine";
import { prioridadeCatalogoProduto } from "@/lib/catalog/apresentacao";

// Home de vitrine — substitui o placeholder da fase 1 (ver git log). Sem
// grid de catálogo geral de propósito: só existe um produto publicável até
// agora (Micropele 0,08mm, ver seeds/products.json), então "conheça nossas
// próteses" também aponta para ele — criar uma página de listagem para um
// produto só seria enfeite, não catálogo (e está fora do escopo desta
// entrega, ver docs/fundacao-25-08-2026.md).
//
// Mídia: vídeo e fotos são os arquivos reais baixados do Drive em 25/08/2026
// (public/media/hero) — nada aqui foi gerado. Vídeo sem autoplay (silencioso
// ou não): a marca não pediu autoplay, e vídeo que começa sozinho é o tipo
// de coisa que a Apple Store rejeita em iOS por consumir dado sem aviso.
// `preload="metadata"` só baixa o suficiente para mostrar o pôster e a
// duração, não o arquivo inteiro — o resto baixa quando a pessoa aperta play.
//
// ATUALIZADO 25/08/2026 (camada visual e de conversão): virou async porque
// passou a buscar `reviews` para a seção de prova social (ver SocialProof.tsx
// — só renderiza se existir avaliação publicada de verdade; hoje não existe
// nenhuma, então a seção fica invisível até o Francisco publicar a primeira
// pelo /admin). Mesma policy pública ("public read reviews") que
// cores/page.tsx e faq/page.tsx já usam para as tabelas delas — sem filtro
// redundante aqui, a RLS já resolve quem pode ver o quê.
export default async function HomePage() {
  const t = await textosDaPagina("home");
  const logo = await urlDaFotoDoSite("/media/marca/logo-revera.png");
  // Grupo compartilhado com a página de produto (06/09/2026) — ver o
  // comentário em src/lib/conteudo/registro/trustbar.ts. Consulta própria,
  // pequena e com policy pública, porque a TrustBar não é conteúdo da home.
  const tTrust = await textosDaPagina("trustbar");
  const supabase = await createClient();

  // P0-1 (27/08/2026): o destino dos CTAs sai do BANCO, não de um slug fixo.
  // A policy "public read active products" já filtra status='active', então
  // um produto em draft simplesmente não volta desta consulta — e a home
  // deixa de oferecer um botão que leva a 404. Ver src/lib/catalog/vitrine.ts.
  const [{ data: avaliacoes }, { data: produtos }, { data: perguntas }] = await Promise.all([
    supabase
      .from("reviews")
      .select("customer_name, city, professional_name, rating, comment, photo_url, video_url")
      .order("sort_order")
      .limit(6),
    supabase
      .from("products")
      .select(
        "slug, name, is_featured, sort_order, product_variants(is_active, price_cents, stock_qty)"
      ),
    // Excerto da FAQ (08/09/2026) — mesma policy pública "public read faq"
    // que /faq já usa (is_visible=true via RLS, sem filtro redundante
    // aqui). Só os 5 primeiros: a home é vitrine, não a página de dúvidas
    // inteira — "Ver todas as perguntas" leva para /faq.
    supabase.from("faq_items").select("id, question, answer").order("sort_order").limit(5),
  ]);

  const produtosParaVitrine = (produtos ?? []).map((p) => ({
    slug: p.slug as string,
    name: p.name as string,
    isFeatured: Boolean(p.is_featured),
    sortOrder: (p.sort_order as number | null) ?? 0,
    variants: (p.product_variants ?? []).map((v) => ({
      isActive: Boolean(v.is_active),
      priceCents: (v.price_cents as number | null) ?? 0,
      stockQty: (v.stock_qty as number | null) ?? 0,
    })),
  }));
  const produtoVitrine = escolherProdutoVitrine(
    produtosParaVitrine.filter((p) => prioridadeCatalogoProduto(p.slug, p.name) === 0)
  );
  const linkProduto = linkDoProdutoVitrine(produtoVitrine);
  const temProduto = produtoVitrine !== null;
  const temItemCompravel = produtosParaVitrine.some(produtoEstaVendavel);
  // "Comprar agora" leva ao catálogo (todas as próteses primeiro, depois os
  // produtos de manutenção — ver src/app/produtos/page.tsx), não a um único
  // produto: pedido do Francisco em 21/09/2026. "Conhecer" só pode eleger
  // uma prótese, para cola/fita/removedor não virarem o destaque da home.
  const linkComprarAgora = "/produtos";
  const heroFoto = "/media/hero/revera-hero-profissional.png";
  const heroFotoAlt = "Prótese capilar Reverá em micropele em fotografia de produto premium";

  return (
    <main className="flex flex-col">
      {/* Hero com produto real na primeira dobra.

          A auditoria de conversão de 12/09/2026 pegou um problema de
          percepção: no mobile a home abria praticamente só com marca e texto,
          e no desktop a peça aparecia como card lateral. Para uma compra cara
          e sensível, isso não passa confiança suficiente. A imagem agora é
          full-bleed, profissionalizada por composição/overlay, e continua
          usando foto real da peça — não ilustração nem textura genérica.

          A arte oficial (logo-revera-original.jpeg, 2048px)
          traz as duas versões da marca — dourado sobre preto e sobre
          branco — mas ambas em JPEG, sem canal alfa. logo-revera.png é
          derivado da versão escura: recortado na marca e com alfa
          reconstruído a partir da luminância, para o retângulo preto não
          ficar colado na seção. USAR SÓ SOBRE FUNDO ESCURO — o dourado é
          despremultiplicado para compor sobre preto; em fundo claro existe
          a variante logo-revera-claro.png. Ambos são raster derivado de
          JPEG: um SVG oficial ainda é o ideal para tamanho grande.

          pt-* compensa o Header fixo (HEADER_HEIGHT_PX): o header começa
          transparente sobre este hero (ver Header.tsx), então aqui o
          padding é o que garante que logo/headline não nasçam escondidos
          atrás dele. */}
      <section
        className="relative isolate flex min-h-[calc(100svh-24px)] w-full overflow-hidden bg-ink px-6 pb-16 sm:min-h-[760px] sm:pb-20 lg:min-h-[820px]"
        style={{ paddingTop: HEADER_HEIGHT_PX + 24 }}
      >
        <Image
          src={heroFoto}
          alt={heroFotoAlt}
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-30 object-cover object-[62%_46%] sm:object-[64%_44%] lg:object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(10,10,10,.88)_0%,rgba(10,10,10,.76)_34%,rgba(10,10,10,.42)_64%,rgba(10,10,10,.18)_100%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,rgba(10,10,10,.68)_0%,rgba(10,10,10,.12)_38%,rgba(10,10,10,.72)_100%)]"
        />
        {/* Profundidade discreta para dar acabamento editorial sem esconder a
            textura da peça real. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_42%_at_18%_34%,rgba(201,180,95,.22),transparent_66%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-[linear-gradient(90deg,transparent,rgba(201,180,95,.72),transparent)]"
        />
        <div className="relative mx-auto flex w-full max-w-6xl items-center justify-center lg:justify-start">
          <div className="flex w-full max-w-[680px] flex-col items-center gap-7 text-center">
            {logo ? <Image
              src={logo}
              alt="Reverá — Prótese Capilar"
              width={1500}
              height={920}
              priority
              className="h-auto w-[250px] sm:w-[330px]"
            /> : null}

            <span className="eyebrow">{t("home.hero.eyebrow")}</span>
            <h1 className="max-w-3xl text-balance font-display text-[3rem] font-extrabold leading-[0.98] text-paper sm:text-[clamp(4rem,7vw,6.25rem)]">
              {t("home.hero.titulo")}
            </h1>
            <p className="max-w-xl text-balance text-lg font-medium text-paper/80 sm:text-xl">{t("home.hero.subtitulo")}</p>

            <div className="flex w-full max-w-[560px] flex-col items-center justify-center gap-3 sm:flex-row">
            {/* "Comprar agora" só aparece quando existe algo comprável. Um
                botão de compra que leva a 404 custa mais caro que a ausência
                dele: a pessoa clica com intenção de compra e recebe um erro.
                Ver src/lib/catalog/vitrine.ts (P0-1). */}
            {temItemCompravel ? (
              <Link href={linkComprarAgora} className="w-full sm:w-1/2">
                <Button size="lg" className="w-full justify-center">
                  {t("home.hero.botaoComprar")}
                </Button>
              </Link>
            ) : null}
            <Link href={linkProduto} className="w-full sm:w-1/2">
              {/* secondary do Button é pensado para fundo claro (borda e
                  texto em --ink); sobre o preto do hero ficaria invisível,
                  então este usa borda/texto em --paper via className. */}
              <Button
                variant={temProduto ? "secondary" : "primary"}
                size="lg"
                className={
                  temProduto
                    ? "w-full justify-center border-paper/40 text-paper hover:bg-paper/10"
                    : "w-full"
                }
              >
                {t("home.hero.botaoConhecer")}
              </Button>
            </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="divider-gold w-full bg-ink" />

      {/* Prova de naturalidade — a objeção nº 1 de quem nunca usou prótese.
          Continua no tema escuro do hero (separada só pelo filete acima),
          de propósito: é a seção que mais precisa de peso visual na home.
          O texto abaixo do vídeo é o princípio oficial da marca, palavra
          por palavra — não é copy nova, não invente variação dele. */}
      <section className="w-full bg-ink px-6 py-16 sm:py-20">
        <Reveal className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 text-center">
          <span className="eyebrow">{t("home.naturalidade.eyebrow")}</span>
          <h2 className="text-balance font-display text-2xl text-paper sm:text-3xl">
            {t("home.naturalidade.titulo")}
          </h2>
          {t("home.naturalidade.videoArquivo") ? <div className="surface-elevada w-full overflow-hidden rounded-lg p-1.5 sm:p-2">
            <video
              controls
              preload="metadata"
              poster={t("home.naturalidade.videoCapa")}
              className="w-full rounded-md bg-ink"
            >
              <source src={t("home.naturalidade.videoArquivo")} type="video/mp4" />
            </video>
          </div> : null}
          <p className="max-w-2xl text-balance text-paper/75">
            {t("home.naturalidade.texto")}
          </p>
        </Reveal>
      </section>

      <section className="w-full bg-paper px-6 py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal className="flex flex-col gap-3">
            <span className="eyebrow-ink">Padrão Reverá</span>
            <h2 className="text-balance font-display text-3xl text-ink">
              Uma peça discreta começa antes da aplicação.
            </h2>
            <p className="text-ink/75">
              A escolha da base, da cor e da textura define a naturalidade do
              resultado. Por isso a Reverá apresenta cada modelo com clareza e
              confere a peça antes do envio.
            </p>
          </Reveal>
          <Reveal delayMs={120} className="grid gap-3 sm:grid-cols-3">
            {[
              ["Base", "Espessuras e construções para diferentes níveis de discrição."],
              ["Cor", "Cartela visual para comparar antes de finalizar a compra."],
              ["Envio", "Pedido revisado e enviado com orientação clara de garantia."],
            ].map(([titulo, texto]) => (
              <div key={titulo} className="rounded-xl border border-sand bg-paper p-4 shadow-[0_1px_0_rgb(255_255_255_/_0.8)]">
                <h3 className="font-display text-lg text-ink">{titulo}</h3>
                <p className="mt-2 text-sm leading-5 text-ink/65">{texto}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16 sm:flex-row sm:items-center">
        {t("home.micropele.foto") ? <Reveal className="group relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-sand sm:w-1/2">
          <Image
            src={t("home.micropele.foto")}
            alt={t("home.micropele.fotoAlt")}
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        </Reveal> : null}
        <Reveal delayMs={120} className="flex flex-col gap-3 sm:w-1/2">
          <span className="eyebrow-ink">{t("home.micropele.eyebrow")}</span>
          <h2 className="font-display text-2xl text-ink">{t("home.micropele.titulo")}</h2>
          <p className="text-ink/80">{t("home.micropele.texto")}</p>
          {/* Sem produto publicado, este link vai para /cores — que existe e
              mostra as cores reais — em vez de para a página do produto que
              ainda não está no ar (P0-1). */}
          <Link
            href={temProduto ? linkProduto : "/cores"}
            className="self-start text-ink underline decoration-gold decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            {temProduto
              ? t("home.micropele.linkComProduto")
              : t("home.micropele.linkSemProduto")}
          </Link>
        </Reveal>
      </section>

      {/* Grade "Por que a Reverá" (08/09/2026) — fecha o buraco estrutural
          que a home tinha depois do bloco Micropele: nenhuma seção listava
          os benefícios em conjunto, só espalhados (selo aqui, frase ali).
          Ícones em SVG inline, sem lib nova. */}
      <section className="w-full bg-paper px-6 py-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <Reveal className="flex flex-col items-center gap-2 text-center">
            <span className="eyebrow-ink">{t("home.beneficios.eyebrow")}</span>
            <h2 className="font-display text-2xl text-ink sm:text-3xl">
              {t("home.beneficios.titulo")}
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Reveal>
              <BeneficioCard
                icone={<IconeAcabamento />}
                titulo={t("home.beneficios.item1.titulo")}
                texto={t("home.beneficios.item1.texto")}
              />
            </Reveal>
            <Reveal delayMs={120}>
              <BeneficioCard
                icone={<IconeEspessura />}
                titulo={t("home.beneficios.item2.titulo")}
                texto={t("home.beneficios.item2.texto")}
              />
            </Reveal>
            <Reveal delayMs={240}>
              <BeneficioCard
                icone={<IconeEnvio />}
                titulo={t("home.beneficios.item3.titulo")}
                texto={t("home.beneficios.item3.texto")}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Jornada numerada (08/09/2026) — narra passos que o site já executa
          de verdade (cor/espessura em /cores, frete no checkout, garantia
          de 7 dias); não inventa processo novo. */}
      <section className="w-full bg-ink px-6 py-16 sm:py-20">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
          <Reveal className="flex flex-col items-center gap-2 text-center">
            <span className="eyebrow">{t("home.jornada.eyebrow")}</span>
            <h2 className="font-display text-2xl text-paper sm:text-3xl">
              {t("home.jornada.titulo")}
            </h2>
          </Reveal>
          <Reveal delayMs={120}>
            <PassosNumerados
              passos={[
                {
                  numero: "1",
                  titulo: t("home.jornada.passo1.titulo"),
                  texto: t("home.jornada.passo1.texto"),
                },
                {
                  numero: "2",
                  titulo: t("home.jornada.passo2.titulo"),
                  texto: t("home.jornada.passo2.texto"),
                },
                {
                  numero: "3",
                  titulo: t("home.jornada.passo3.titulo"),
                  texto: t("home.jornada.passo3.texto"),
                },
              ]}
            />
          </Reveal>
        </div>
      </section>

      <section className="w-full border-t border-sand bg-paper px-6 py-10">
        <Reveal>
          <TrustBar
            items={[
              { label: tTrust("trustbar.item1") },
              { label: tTrust("trustbar.item2") },
            ]}
          />
        </Reveal>
      </section>

      {(avaliacoes ?? []).length > 0 ? (
        <section className="w-full bg-paper px-6 py-16">
          <div className="mx-auto w-full max-w-5xl">
            <SocialProof
              eyebrow={t("home.depoimentos.eyebrow")}
              titulo={t("home.depoimentos.titulo")}
              reviews={(avaliacoes ?? []).map((r) => ({
                customerName: r.customer_name as string,
                city: r.city as string | null,
                professionalName: r.professional_name as string | null,
                rating: r.rating as number | null,
                comment: r.comment as string | null,
                photoUrl: r.photo_url as string | null,
                videoUrl: r.video_url as string | null,
              }))}
            />
          </div>
        </section>
      ) : null}

      {/* FAQ da home (08/09/2026) — excerto, reaproveitando o mesmo
          componente e a mesma tabela de /faq (sem duplicar dado nem
          lógica). Só aparece se houver pergunta visível cadastrada — mesmo
          padrão defensivo do SocialProof acima. */}
      {(perguntas ?? []).length > 0 ? (
        <section className="w-full bg-paper px-6 py-16">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
            <Reveal className="flex flex-col items-center gap-2 text-center">
              <span className="eyebrow-ink">{t("home.faq.eyebrow")}</span>
              <h2 className="font-display text-2xl text-ink sm:text-3xl">
                {t("home.faq.titulo")}
              </h2>
            </Reveal>
            <Reveal delayMs={120}>
              <FAQ
                items={(perguntas ?? []).map((p) => ({
                  id: p.id as string,
                  question: p.question as string,
                  answer: p.answer as string,
                }))}
              />
            </Reveal>
            <Link
              href="/faq"
              className="self-center text-ink underline decoration-gold decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Ver todas as perguntas
            </Link>
          </div>
        </section>
      ) : null}

      {/* CTA final (08/09/2026) — fecha a home no escuro, mesmo tom do
          hero, antes do rodapé. Com item comprável, compra vai para o
          catálogo; sem item comprável, usa o fallback institucional seguro. */}
      <section className="w-full bg-ink px-6 py-16 text-center sm:py-20">
        <Reveal className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5">
          <h2 className="text-balance font-display text-2xl text-paper sm:text-3xl">
            {t("home.ctaFinal.titulo")}
          </h2>
          <p className="text-paper/70">{t("home.ctaFinal.texto")}</p>
          <Link href={temItemCompravel ? linkComprarAgora : linkProduto}>
            <Button size="lg">{t("home.ctaFinal.botao")}</Button>
          </Link>
        </Reveal>
      </section>
    </main>
  );
}

// Ícones de traço simples para a grade "Por que a Reverá" — sem lib nova
// (ver o comentário na seção acima). stroke="currentColor" herda a cor do
// wrapper (text-gold-deep, em BeneficioCard.tsx).

function IconeAcabamento() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 16c2-6 6-10 8-10s2 6 0 10-6 4-8 0Zm4-2c3 1 6-1 8-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconeEspessura() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h16M4 8v3M8 8v2M12 8v3M16 8v2M20 8v3M4 16h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconeEnvio() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
