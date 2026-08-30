import type { Metadata } from "next";
// Página pública de cuidados — os quatro fatos reais confirmados no
// material da marca (mesmos textos usados na FAQ, ver seeds/faq.json,
// perguntas "Posso lavar normalmente?", "Posso usar secador?", "Posso usar
// chapinha?" e "Como faço a manutenção?"). Nada aqui foi inferido: são os
// blocos curtos, não um parágrafo corrido, porque é assim que a marca
// passou o conteúdo — misturar tudo em um texto só inventaria transição
// que ninguém escreveu.
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { textosDaPagina } from "@/lib/conteudo/textos";

/**
 * O texto destes blocos mudou de lugar em 30/08/2026: agora mora em
 * `src/lib/conteudo/registro.ts`, junto do rótulo que o painel mostra.
 * Aqui ficam só as CHAVES — a ordem da página e a ordem do painel passam a
 * ser a mesma coisa, e não duas listas para alguém manter sincronizadas.
 */
const BLOCOS = [
  { titulo: "cuidados.bloco1.titulo", texto: "cuidados.bloco1.texto" },
  { titulo: "cuidados.bloco2.titulo", texto: "cuidados.bloco2.texto" },
  { titulo: "cuidados.bloco3.titulo", texto: "cuidados.bloco3.texto" },
] as const;

/**
 * A página continua sendo gerada estaticamente — ler o banco a cada visita
 * seria pagar uma consulta por visitante para um texto que muda uma vez por
 * mês. O painel chama `revalidatePath` ao salvar, então a edição aparece na
 * hora; este número é só a rede de segurança para o caso de a revalidação
 * não acontecer.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Como cuidar da sua prótese",
  description:
    "Lavagem, secagem, o que evitar e a rotina de manutenção que faz a peça durar. Escrito para quem usa, não para técnico.",
  alternates: { canonical: "/cuidados" },
  openGraph: {
    title: "Como cuidar da sua prótese — Reverá",
    description:
      "Lavagem, secagem, o que evitar e a rotina de manutenção que faz a peça durar. Escrito para quem usa, não para técnico.",
    url: "/cuidados",
  },
};

export default async function CuidadosPage() {
  const t = await textosDaPagina("cuidados");

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-12"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">{t("cuidados.eyebrow")}</span>
        <h1 className="font-display text-3xl text-ink">{t("cuidados.titulo")}</h1>
        <p className="text-ink/70">{t("cuidados.intro")}</p>
      </Reveal>

      <div className="flex flex-col gap-8">
        {BLOCOS.map((bloco, i) => (
          <Reveal key={bloco.titulo} delayMs={i * 80}>
            <section className="flex flex-col gap-2 border-t border-sand pt-6">
              <h2 className="font-display text-xl text-ink">{t(bloco.titulo)}</h2>
              <p className="text-ink/80">{t(bloco.texto)}</p>
            </section>
          </Reveal>
        ))}
      </div>
    </main>
  );
}
