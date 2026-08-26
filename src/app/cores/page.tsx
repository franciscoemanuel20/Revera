import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { ColorHelpForm } from "./ColorHelpForm";

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
    .order("sort_order");

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">Linha micropele</span>
        <h1 className="font-display text-3xl text-ink">Cores disponíveis</h1>
        <p className="text-ink/70">
          As opções de cor da linha Micropele 0,08mm.
        </p>
      </Reveal>

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
              ) : null}
            </div>
            <span className="text-center font-display text-ink">
              {color.name as string}
            </span>
          </Reveal>
        ))}
      </div>

      <section id="ajuda" className="flex scroll-mt-8 flex-col gap-2 border-t border-sand pt-8 text-center">
        <span className="eyebrow-ink mx-auto">Precisa de ajuda?</span>
        <h2 className="font-display text-2xl text-ink">
          Não sabe qual cor escolher?
        </h2>
        <p className="mx-auto max-w-prose text-ink/80">
          Envie uma foto do seu cabelo natural e nossa equipe indica a cor
          mais parecida entre as opções disponíveis.
        </p>
        {/* Ferramenta adicionada em 26/08/2026 — o texto acima já existia
            (era só descrição, sem formulário de fato); ColorHelpForm.tsx
            grava em color_help_requests + bucket privado color-help (ver
            actions.ts e a migration 00000000000004, ainda não aplicada). */}
        <div className="pt-4">
          <ColorHelpForm />
        </div>
      </section>
    </main>
  );
}
