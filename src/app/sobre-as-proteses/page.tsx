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
// outra página ou no seed (ver seeds/faq.json e seeds/products.json).
//
// ESPESSURA — corrigido em 02/09/2026. Esta página dizia, copiando a FAQ
// palavra por palavra, que a 0,08mm era "a base mais fina da linha". Era
// verdade quando a FAQ foi escrita e deixou de ser quando a 0,06mm entrou
// no catálogo. A frase certa agora vive em registro/sobre.ts
// ("sobre.medida008.texto"); a FAQ e a home foram corrigidas junto.
//
// FOTOS — trocadas em 02/09/2026 (pedido do Francisco).
//
// Até aqui o grid mostrava três fotos de public/media/cores/: textura de
// FIO, nas cores 3, 5 e 7. Elas ilustravam, logo abaixo do texto "O que é a
// base", um assunto que não era o delas. Agora são três fotos da BASE
// (public/media/base/), enviadas por ele: a peça inteira, o close da
// membrana e a ilustração do nó duplo.
//
// E não são mais fixas no código: os caminhos abaixo são só o PADRÃO. As
// três entraram no registro de conteúdo (registro/sobre.ts), então a
// administradora troca qualquer uma pelo painel, sem deploy. O caminho de
// public/ é o que aparece se nunca ninguém trocar — e o que volta se
// alguém clicar em "voltar à foto original".
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

      {/* object-CONTAIN, e não object-cover como no grid antigo.
          As fotos de fio eram textura: cortar as bordas não tirava nada
          delas. Estas três não são. A terceira é uma ilustração com o
          texto "Nó duplo" escrito no canto — um corte quadrado comeria a
          palavra, e o defeito apareceria só depois de publicado. Como as
          três têm fundo claro, "contain" sobre o fundo da página não
          mostra tarja nenhuma: a foto simplesmente cabe inteira.

          Uma coluna no celular (não duas): a ilustração tem texto, e texto
          dentro de um quadro de ~150px não se lê. */}
      <Reveal delayMs={120} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {([
          { foto: "sobre.fotosBase.foto1", alt: "sobre.fotosBase.alt1" },
          { foto: "sobre.fotosBase.foto2", alt: "sobre.fotosBase.alt2" },
          { foto: "sobre.fotosBase.foto3", alt: "sobre.fotosBase.alt3" },
          // `as const` não é enfeite: sem ele o TypeScript infere `string`
          // para as chaves, e `t()` só aceita ChaveDeTexto — que é
          // exatamente a trava que impede um erro de digitação virar um
          // espaço em branco na página (ver o cabeçalho de registro.ts).
        ] as const).map((item) => (
          <div
            key={item.foto}
            className="relative aspect-[4/3] overflow-hidden rounded-lg border border-sand bg-paper p-2"
          >
            <Image
              src={t(item.foto)}
              alt={t(item.alt)}
              fill
              sizes="(min-width: 640px) 33vw, 100vw"
              className="object-contain"
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

    </main>
  );
}
