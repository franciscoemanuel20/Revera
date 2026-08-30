import type { Metadata } from "next";
// Página que responde à objeção nº 1 de quem nunca comprou: "vai parecer
// artificial?" — pedida pela auditoria de 26/08/2026.
//
// O parágrafo em destaque abaixo é o texto oficial aprovado pela marca,
// citado PALAVRA POR PALAVRA na missão que criou esta página — não pode ser
// parafraseado nem resumido, é o único lugar do site que faz essa promessa
// (nenhuma): naturalidade depende de vários fatores, e a peça é só um deles.
//
// Decisão deliberada: nenhuma foto de antes/depois nesta página. A Reverá
// não tem, hoje, foto de cliente usando a prótese — inventar uma (ou usar
// imagem de banco genérica) romperia exatamente a objeção que a página
// existe para responder com honestidade. O vídeo de implantação
// (public/media/hero/implantacao.mp4) é o único material visual real que
// mostra o processo, por isso é o elemento central da página.
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { textosDaPagina } from "@/lib/conteudo/textos";

/**
 * O texto destes fatores mudou de lugar em 30/08/2026: agora mora em
 * `src/lib/conteudo/registro.ts`, junto do rótulo que o painel mostra.
 * Aqui ficam só as CHAVES — mesmo tratamento que `cuidados/page.tsx` deu
 * ao array `BLOCOS`.
 */
const FATORES = [
  { titulo: "naturalidade.fator1.titulo", texto: "naturalidade.fator1.texto" },
  { titulo: "naturalidade.fator2.titulo", texto: "naturalidade.fator2.texto" },
  { titulo: "naturalidade.fator3.titulo", texto: "naturalidade.fator3.texto" },
  { titulo: "naturalidade.fator4.titulo", texto: "naturalidade.fator4.texto" },
  { titulo: "naturalidade.fator5.titulo", texto: "naturalidade.fator5.texto" },
  { titulo: "naturalidade.fator6.titulo", texto: "naturalidade.fator6.texto" },
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
  title: "Naturalidade fio a fio",
  description:
    "O que faz uma prótese capilar parecer cabelo de verdade: base, linha frontal, implantação e o trabalho do profissional.",
  alternates: { canonical: "/naturalidade" },
  openGraph: {
    title: "Naturalidade fio a fio — Reverá",
    description:
      "O que faz uma prótese capilar parecer cabelo de verdade: base, linha frontal, implantação e o trabalho do profissional.",
    url: "/naturalidade",
  },
};

export default async function NaturalidadePage() {
  const t = await textosDaPagina("naturalidade");

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">{t("naturalidade.eyebrow")}</span>
        <h1 className="font-display text-3xl text-ink">
          {t("naturalidade.titulo")}
        </h1>
      </Reveal>

      <Reveal>
        <blockquote className="surface-elevada rounded-lg border-l-4 border-l-gold px-6 py-6 text-lg italic text-paper">
          {t("naturalidade.citacao")}
        </blockquote>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-3">
          <video
            src="/media/hero/implantacao.mp4"
            controls
            preload="metadata"
            className="w-full rounded-lg bg-ink"
          >
            {t("naturalidade.video.fallback")}
          </video>
          <p className="text-sm text-ink/60">
            {t("naturalidade.video.legenda")}
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("naturalidade.influencia.titulo")}
          </h2>
          <p className="text-ink/80">
            {t("naturalidade.influencia.texto")}
          </p>
        </section>
      </Reveal>

      <div className="flex flex-col gap-6">
        {FATORES.map((fator, i) => (
          <Reveal key={fator.titulo} delayMs={i * 60}>
            <section className="flex flex-col gap-2 border-t border-sand pt-6">
              <h3 className="font-display text-lg text-ink">{t(fator.titulo)}</h3>
              <p className="text-ink/80">{t(fator.texto)}</p>
            </section>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="rounded-md border border-moss/30 bg-moss/5 px-4 py-3 text-sm text-moss">
          {/* Antes dizia "a Reverá ainda não tem esse material" — uma
              confissão de lacuna que o cliente jamais notaria sozinho.
              Retirado em 29/08/2026. A POSTURA continua: a página não usa
              antes e depois, e agora isso é apresentado como escolha, que é
              o que de fato é. */}
          {t("naturalidade.aviso")}
        </p>
      </Reveal>
    </main>
  );
}
