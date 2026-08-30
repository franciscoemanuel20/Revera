import type { Metadata } from "next";
// Página educativa "o que é uma prótese capilar" — pedida pela auditoria de
// 26/08/2026 (páginas públicas que faltavam). Segue o mesmo molde de
// src/app/cuidados/page.tsx: blocos curtos com subtítulo, não parágrafo
// corrido, porque é assim que este site já ensina coisa técnica para leigo.
//
// Regra que vale para todo o texto abaixo: só entram dois tipos de frase —
// (1) explicação genérica sobre a categoria "prótese capilar" (como o
// mercado em geral descreve base, espessura, fio), sem citar concorrente
// nem prometer resultado; (2) fato específico da Reverá já confirmado em
// outra página ou no seed (ver seeds/faq.json e seeds/products.json). A
// linha "0,08mm — a base mais fina da linha, com acabamento natural na
// linha frontal" é copiada literalmente da FAQ (pergunta "Qual é a
// espessura da Micropele?", is_visible=true) — não é texto novo.
//
// As duas fotos de "produto-close" (public/media/hero/produto-close-1.jpeg
// e -2.jpeg) foram propositalmente deixadas de fora: são a base por baixo,
// com resíduo de cola, reprovadas para vitrine na própria missão que criou
// esta página. As fotos usadas aqui vêm de public/media/cores/ (fio, não
// base), as mesmas que a página /cores já expõe.
import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { textosDaPagina } from "@/lib/conteudo/textos";

/**
 * A página continua sendo gerada estaticamente — ler o banco a cada visita
 * seria pagar uma consulta por visitante para um texto que muda uma vez por
 * mês. O painel chama `revalidatePath` ao salvar, então a edição aparece na
 * hora; este número é só a rede de segurança para o caso de a revalidação
 * não acontecer.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Sobre as próteses",
  description:
    "Tipos de base, espessuras, para quem serve cada uma e como escolher a que combina com a sua rotina.",
  alternates: { canonical: "/sobre-as-proteses" },
  openGraph: {
    title: "Sobre as próteses — Reverá",
    description:
      "Tipos de base, espessuras, para quem serve cada uma e como escolher a que combina com a sua rotina.",
    url: "/sobre-as-proteses",
  },
};

export default async function SobreAsProtesesPage() {
  const t = await textosDaPagina("sobre");

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">{t("sobre.eyebrow")}</span>
        <h1 className="font-display text-3xl text-ink">
          {t("sobre.titulo")}
        </h1>
        <p className="max-w-prose text-ink/70">{t("sobre.intro")}</p>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">{t("sobre.oQueE.titulo")}</h2>
          <p className="text-ink/80">{t("sobre.oQueE.texto")}</p>
        </section>
      </Reveal>

      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">{t("sobre.oQueEABase.titulo")}</h2>
          <p className="text-ink/80">{t("sobre.oQueEABase.texto")}</p>
        </section>
      </Reveal>

      <Reveal delayMs={120} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { file: "3.jpg", cor: "3" },
          { file: "5.jpg", cor: "5" },
          { file: "7.jpg", cor: "7" },
        ].map((item) => (
          <div
            key={item.file}
            className="relative aspect-square overflow-hidden rounded-lg bg-sand"
          >
            <Image
              src={`/media/cores/${item.file}`}
              alt={`Textura de fio — cor ${item.cor}`}
              fill
              sizes="(min-width: 640px) 33vw, 50vw"
              className="object-cover"
            />
          </div>
        ))}
      </Reveal>

      <Reveal delayMs={0}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("sobre.basesFinas.titulo")}
          </h2>
          <p className="text-ink/80">{t("sobre.basesFinas.texto")}</p>
        </section>
      </Reveal>

      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("sobre.medida008.titulo")}
          </h2>
          <p className="text-ink/80">{t("sobre.medida008.texto")}</p>
        </section>
      </Reveal>

      <Reveal delayMs={120}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("sobre.grisalhos.titulo")}
          </h2>
          <p className="text-ink/80">{t("sobre.grisalhos.texto")}</p>
        </section>
      </Reveal>

      <Reveal delayMs={0}>
        <section className="flex flex-col gap-3 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">{t("sobre.comoEscolher.titulo")}</h2>
          <p className="text-ink/80">
            {t("sobre.comoEscolher.texto1")}{" "}
            <a href="/cores" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep">
              {t("sobre.comoEscolher.link1")}
            </a>{" "}
            {t("sobre.comoEscolher.texto2")}{" "}
            <a
              href="/naturalidade"
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              {t("sobre.comoEscolher.link2")}
            </a>
            .
          </p>
        </section>
      </Reveal>
    </main>
  );
}
