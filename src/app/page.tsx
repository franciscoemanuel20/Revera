import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SocialProof } from "@/components/ui/SocialProof";
import { TrustBar } from "@/components/ui/TrustBar";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data: avaliacoes } = await supabase
    .from("reviews")
    .select("customer_name, city, professional_name, rating, comment, photo_url, video_url")
    .order("sort_order")
    .limit(6);

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
        className="w-full bg-ink px-6 pb-16 sm:pb-20"
        style={{ paddingTop: HEADER_HEIGHT_PX + 24 }}
      >
        <Reveal className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 text-center">
          <Image
            src="/media/marca/logo-revera.png"
            alt="Reverá — Prótese Capilar"
            width={1500}
            height={920}
            priority
            className="h-auto w-[250px] sm:w-[330px]"
          />

          <span className="eyebrow">Base micropele 0,08mm</span>
          <h1 className="max-w-2xl text-balance font-display text-4xl leading-[1.05] text-paper sm:text-[clamp(2.75rem,5vw,4rem)]">
            Prótese capilar com acabamento natural
          </h1>
          <p className="max-w-xl text-balance text-paper/70">
            Envio para todo o Brasil.
          </p>

          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/produtos/micropele-008" className="w-full sm:w-auto">
              <Button size="lg" className="w-full">
                Comprar agora
              </Button>
            </Link>
            <Link href="/produtos/micropele-008" className="w-full sm:w-auto">
              {/* secondary do Button é pensado para fundo claro (borda e
                  texto em --ink); sobre o preto do hero ficaria invisível,
                  então este usa borda/texto em --paper via className. */}
              <Button
                variant="secondary"
                size="lg"
                className="w-full border-paper/40 text-paper hover:bg-paper/10"
              >
                Conheça nossas próteses
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
          <span className="eyebrow">Naturalidade</span>
          <h2 className="text-balance font-display text-2xl text-paper sm:text-3xl">
            Implantação real, fio a fio
          </h2>
          <div className="surface-elevada w-full overflow-hidden rounded-lg p-1.5 sm:p-2">
            <video
              controls
              preload="metadata"
              poster="/media/hero/produto-close-1.jpeg"
              className="w-full rounded-md bg-ink"
            >
              <source src="/media/hero/implantacao.mp4" type="video/mp4" />
            </video>
          </div>
          <p className="max-w-2xl text-balance text-paper/75">
            A naturalidade do resultado depende não apenas da qualidade da
            prótese, mas também da escolha da peça, preparação, corte,
            coloração e técnicas utilizadas pelo profissional.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16 sm:flex-row sm:items-center">
        <Reveal className="group relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-sand sm:w-1/2">
          <Image
            src="/media/hero/produto-close-2.jpeg"
            alt="Close da base Micropele 0,08mm"
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        </Reveal>
        <Reveal delayMs={120} className="flex flex-col gap-3 sm:w-1/2">
          <span className="eyebrow-ink">Linha micropele</span>
          <h2 className="font-display text-2xl text-ink">A mais fina da linha</h2>
          <p className="text-ink/80">
            Base ultrafina de 0,08mm, com acabamento natural na linha frontal —
            o carro-chefe da Reverá.
          </p>
          <Link
            href="/produtos/micropele-008"
            className="self-start text-ink underline decoration-gold decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            Ver detalhes e cores disponíveis
          </Link>
        </Reveal>
      </section>

      <section className="w-full border-t border-sand bg-paper px-6 py-10">
        <Reveal>
          <TrustBar />
        </Reveal>
      </section>

      {(avaliacoes ?? []).length > 0 ? (
        <section className="w-full bg-paper px-6 py-16">
          <div className="mx-auto w-full max-w-5xl">
            <SocialProof
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
    </main>
  );
}
