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
import {
  escolherProdutoVitrine,
  linkDoProdutoVitrine,
} from "@/lib/catalog/vitrine";

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

  const produtoVitrine = escolherProdutoVitrine(
    (produtos ?? []).map((p) => ({
      slug: p.slug as string,
      name: p.name as string,
      isFeatured: Boolean(p.is_featured),
      sortOrder: (p.sort_order as number | null) ?? 0,
      variants: (p.product_variants ?? []).map((v) => ({
        isActive: Boolean(v.is_active),
        priceCents: (v.price_cents as number | null) ?? 0,
        stockQty: (v.stock_qty as number | null) ?? 0,
      })),
    }))
  );
  const linkProduto = linkDoProdutoVitrine(produtoVitrine);
  const temProduto = produtoVitrine !== null;

  return (
    <main className="flex flex-col">
      {/* Hero escuro. A arte oficial (logo-revera-original.jpeg, 2048px)
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
        className="relative isolate w-full overflow-hidden bg-ink px-6 pb-16 sm:pb-20"
        style={{ paddingTop: HEADER_HEIGHT_PX + 24 }}
      >
        {/* Profundidade discreta no hero: a marca continua sendo a heroína,
            mas deixa de repousar sobre um preto completamente plano. São
            gradientes CSS, não uma imagem nova nem uma promessa visual que
            concorra com a peça real mostrada logo abaixo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_55%_at_84%_14%,rgba(201,180,95,.18),transparent_60%),radial-gradient(ellipse_50%_45%_at_12%_88%,rgba(255,255,255,.055),transparent_68%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-[linear-gradient(90deg,transparent,rgba(201,180,95,.72),transparent)]"
        />
        <Reveal className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-6 text-center">
          <Image
            src="/media/marca/logo-revera.png"
            alt="Reverá — Prótese Capilar"
            width={1500}
            height={920}
            priority
            className="h-auto w-[250px] sm:w-[330px]"
          />

          <span className="eyebrow">{t("home.hero.eyebrow")}</span>
          <h1 className="max-w-2xl text-balance font-display text-4xl leading-[1.05] text-paper sm:text-[clamp(2.75rem,5vw,4rem)]">
            {t("home.hero.titulo")}
          </h1>
          <p className="max-w-xl text-balance text-paper/70">{t("home.hero.subtitulo")}</p>

          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {/* "Comprar agora" só aparece quando existe algo comprável. Um
                botão de compra que leva a 404 custa mais caro que a ausência
                dele: a pessoa clica com intenção de compra e recebe um erro.
                Ver src/lib/catalog/vitrine.ts (P0-1). */}
            {temProduto ? (
              <Link href={linkProduto} className="w-full sm:w-auto">
                <Button size="lg" className="w-full">
                  {t("home.hero.botaoComprar")}
                </Button>
              </Link>
            ) : null}
            <Link href={linkProduto} className="w-full sm:w-auto">
              {/* secondary do Button é pensado para fundo claro (borda e
                  texto em --ink); sobre o preto do hero ficaria invisível,
                  então este usa borda/texto em --paper via className. */}
              <Button
                variant={temProduto ? "secondary" : "primary"}
                size="lg"
                className={
                  temProduto
                    ? "w-full border-paper/40 text-paper hover:bg-paper/10"
                    : "w-full"
                }
              >
                {t("home.hero.botaoConhecer")}
              </Button>
            </Link>
          </div>
        </Reveal>
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
          <div className="surface-elevada w-full overflow-hidden rounded-lg p-1.5 sm:p-2">
            <video
              controls
              preload="metadata"
              poster={t("home.naturalidade.videoCapa")}
              className="w-full rounded-md bg-ink"
            >
              <source src={t("home.naturalidade.videoArquivo")} type="video/mp4" />
            </video>
          </div>
          <p className="max-w-2xl text-balance text-paper/75">
            {t("home.naturalidade.texto")}
          </p>
        </Reveal>
      </section>

      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16 sm:flex-row sm:items-center">
        <Reveal className="group relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-sand sm:w-1/2">
          <Image
            src={t("home.micropele.foto")}
            alt={t("home.micropele.fotoAlt")}
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        </Reveal>
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
          hero, antes do rodapé. Mesma lógica temProduto/linkProduto que a
          seção Micropele já usa: nunca aponta para 404. */}
      <section className="w-full bg-ink px-6 py-16 text-center sm:py-20">
        <Reveal className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5">
          <h2 className="text-balance font-display text-2xl text-paper sm:text-3xl">
            {t("home.ctaFinal.titulo")}
          </h2>
          <p className="text-paper/70">{t("home.ctaFinal.texto")}</p>
          <Link href={linkProduto}>
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
