import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

export const metadata: Metadata = {
  title: "Cores de prótese capilar",
  description:
    "Veja a cartela de cores da prótese capilar Reverá, incluindo tons naturais e grisalhos. Compare as fotos e escolha o tom mais próximo com segurança.",
  keywords: [
    "cores de prótese capilar",
    "cartela de cores prótese capilar",
    "prótese capilar grisalha",
    "cor de cabelo para prótese",
  ],
  alternates: { canonical: "/cores" },
  openGraph: {
    title: "Cores de prótese capilar — Reverá",
    description:
      "Veja a cartela de cores da prótese capilar Reverá, incluindo tons naturais e grisalhos. Compare as fotos e escolha o tom mais próximo com segurança.",
    url: "/cores",
  },
};

// Página pública de cores — as 8 fotos reais baixadas do Drive em
// 25/08/2026 (ver seeds/colors.json), servidas via colors.photo_url, que já
// aponta para public/media/cores/*.jpg. Nome de exibição é só o próprio
// código (1B, 2, 3...): a marca ainda não definiu rótulo comercial (ex.:
// "Castanho Escuro"), então não inventamos um aqui — mesma nota do seed.
export default async function CoresPage() {
  const supabase = await createClient();
  const { data: colors } = await supabase
    .from("colors")
    .select("id, code, name, photo_url")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-3 text-center">
        <span className="eyebrow-ink">Linha micropele</span>
        <h1 className="text-balance font-display text-3xl text-ink">Cores de prótese capilar Reverá</h1>
        <p className="max-w-2xl text-ink/70">
          Compare as fotos da cartela antes de escolher. A cor selecionada na
          página do produto define a peça que vai para o carrinho.
        </p>
      </Reveal>

      <section aria-label="Como escolher a cor" className="grid gap-3 sm:grid-cols-3">
        {[
          ["Luz natural", "Compare sua referência em luz clara, sem filtro e sem sombra forte."],
          ["Raiz e laterais", "Olhe o tom próximo da raiz e das laterais, não só a ponta do fio."],
          ["Conferência Reverá", "Escolha o tom mais próximo agora. A equipe confere o pedido antes do envio."],
        ].map(([titulo, texto]) => (
          <Reveal key={titulo} className="rounded-xl border border-sand bg-paper p-4">
            <h2 className="font-display text-lg text-ink">{titulo}</h2>
            <p className="mt-2 text-sm leading-5 text-ink/70">{texto}</p>
          </Reveal>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(colors ?? []).map((color, i) => (
          <Reveal key={color.id as string} delayMs={i * 60} className="flex flex-col gap-2">
            <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-sand">
              {color.photo_url ? (
                <Image
                  src={color.photo_url as string}
                  alt={`Cor ${color.name as string}`}
                  fill
                  sizes="(min-width: 640px) 25vw, 50vw"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              ) : (
                /**
                 * COR SEM FOTO NÃO É UM BURACO (03/09/2026).
                 *
                 * Até aqui a cor sem `photo_url` rendia um retângulo cor de
                 * areia e nada mais — e um quadrado vazio numa cartela de
                 * cores não se lê como "foto pendente", se lê como site
                 * quebrado. O caso deixou de ser hipotético quando o
                 * Francisco ativou a 3.20, a 3.30 e a 3.40, que existem no
                 * catálogo, têm preço e estoque, e ainda não foram
                 * fotografadas.
                 *
                 * A frase é o mínimo honesto: diz que a foto vem, sem
                 * inventar uma cor que ninguém conferiu. Some sozinha no dia
                 * em que a foto for cadastrada.
                 *
                 * `text-ink/70`, e não mais claro: sobre `bg-sand` o /45 dava
                 * 3,0:1 de contraste, abaixo dos 4,5:1 que a WCAG AA pede
                 * para texto deste tamanho (achado do Codex). O /70 dá 6,7:1.
                 */
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-sm text-ink/70">
                  Foto em breve
                </span>
              )}
            </div>
            <span className="text-center font-display text-ink">
              {color.name as string}
            </span>
          </Reveal>
        ))}
      </div>

      <section id="ajuda" className="flex scroll-mt-28 flex-col gap-2 rounded-2xl border border-sand bg-sand/25 p-6 text-center">
        <span className="eyebrow-ink mx-auto">Guia rápido de cor</span>
        <h2 className="font-display text-2xl text-ink">
          Escolha a cor mais próxima e siga para a compra
        </h2>
        <p className="mx-auto max-w-prose text-ink/80">
          Compare a cartela com seu cabelo em luz natural, escolha o tom mais
          parecido na página do produto e finalize o pedido. A equipe Reverá
          confere se a peça separada bate com a cor escolhida antes do envio.
        </p>
        <div className="mx-auto mt-4 grid max-w-3xl gap-3 text-left text-sm text-ink/75 sm:grid-cols-3">
          <div className="rounded-xl border border-sand bg-paper p-4">
            <h3 className="font-semibold text-ink">1. Compare sem filtro</h3>
            <p className="mt-1 leading-6">Use uma foto em luz natural e observe a raiz e as laterais.</p>
          </div>
          <div className="rounded-xl border border-sand bg-paper p-4">
            <h3 className="font-semibold text-ink">2. Escolha no produto</h3>
            <p className="mt-1 leading-6">Volte ao modelo desejado, marque a cor mais próxima e adicione à sacola.</p>
          </div>
          <div className="rounded-xl border border-sand bg-paper p-4">
            <h3 className="font-semibold text-ink">3. Conferimos antes</h3>
            <p className="mt-1 leading-6">Seu pedido passa por conferência da peça e da cor antes de ser despachado.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
