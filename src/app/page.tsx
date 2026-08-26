import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TrustBar } from "@/components/ui/TrustBar";

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
export default function HomePage() {
  return (
    <main className="flex flex-col">
      {/* Hero escuro. A logo oficial chegou como JPEG (dourado sobre preto,
          sem canal alfa), o que deixava um retângulo preto visível colado
          na seção. logo-revera.png é derivado dela: recortado na marca e
          com alfa reconstruído a partir da luminância (o preto do fundo
          vira transparente, o dourado é despremultiplicado para recompor a
          cor certa quando sobreposto). Sobre fundo escuro o resultado bate
          com o original; NÃO usar sobre fundo claro — ver o comentário no
          login do admin. Substituível por um SVG oficial sem mexer no resto. */}
      <section className="w-full bg-ink px-6 pb-14 pt-12 sm:pt-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 text-center">
          <Image
            src="/media/marca/logo-revera.png"
            alt="Reverá — Prótese Capilar"
            width={490}
            height={320}
            priority
            className="h-auto w-[230px] sm:w-[300px]"
          />

          <h1 className="max-w-2xl text-balance font-display text-3xl text-paper sm:text-5xl">
            Prótese capilar Micropele 0,08mm, com acabamento natural
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
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-14">
        <video
          controls
          preload="metadata"
          poster="/media/hero/produto-close-1.jpeg"
          className="w-full rounded-lg bg-ink"
        >
          <source src="/media/hero/implantacao.mp4" type="video/mp4" />
        </video>
        <p className="mt-2 text-center text-sm text-ink/60">
          Implantação real, fio a fio.
        </p>
      </section>

      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-16 sm:flex-row sm:items-center">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-sand sm:w-1/2">
          <Image
            src="/media/hero/produto-close-2.jpeg"
            alt="Close da base Micropele 0,08mm"
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col gap-3 sm:w-1/2">
          <h2 className="font-display text-2xl text-ink">A mais fina da linha</h2>
          <p className="text-ink/80">
            Base ultrafina de 0,08mm, com acabamento natural na linha frontal —
            o carro-chefe da Reverá.
          </p>
          <Link href="/produtos/micropele-008" className="self-start text-ink underline decoration-gold decoration-2 underline-offset-4">
            Ver detalhes e cores disponíveis
          </Link>
        </div>
      </section>

      <section className="w-full border-t border-sand bg-paper px-6 py-10">
        <TrustBar />
      </section>
    </main>
  );
}
