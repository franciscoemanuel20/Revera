import type { Metadata } from "next";
// Página de confiança — pedida pela auditoria de 26/08/2026. Cada item
// abaixo tem uma fonte: ver o comentário ao lado da seção correspondente.
// Nada de "atendimento 24h", contagem de clientes ou selo — não existe
// fato confirmado para nenhum desses, e a instrução da missão foi
// explícita: só os itens abaixo, nada além.
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { textosDaPagina } from "@/lib/conteudo/textos";
import { localizePath, type SiteLocale } from "@/lib/i18n/site";

/**
 * A página continua sendo gerada estaticamente — ler o banco a cada visita
 * seria pagar uma consulta por visitante para um texto que muda uma vez por
 * mês. O painel chama `revalidatePath` ao salvar, então a edição aparece na
 * hora; este número é só a rede de segurança para o caso de a revalidação
 * não acontecer.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Por que comprar na Reverá",
  description:
    "Entenda por que comprar prótese capilar na Reverá: acabamento natural, escolha de cor, teste de qualidade, envio para todo o Brasil e garantia.",
  keywords: [
    "comprar prótese capilar",
    "prótese capilar Reverá",
    "prótese capilar acabamento natural",
    "prótese capilar online",
  ],
  alternates: { canonical: "/por-que-revera" },
  openGraph: {
    title: "Por que comprar na Reverá — Reverá",
    description:
      "Entenda por que comprar prótese capilar na Reverá: acabamento natural, escolha de cor, teste de qualidade, envio para todo o Brasil e garantia.",
    url: "/por-que-revera",
  },
};

const INTRO_PORQUE: Record<SiteLocale, string> = {
  pt: "A Reverá organiza a compra para reduzir dúvida: peça clara, cor comparável, teste antes do envio e política de garantia explicada.",
  en: "Revera organizes the purchase to reduce uncertainty: clear product information, comparable color, pre-shipping check and an explained warranty policy.",
  es: "Revera organiza la compra para reducir dudas: pieza clara, color comparable, prueba antes del envio y politica de garantia explicada.",
};

const RESUMO_PORQUE: Record<SiteLocale, Array<[string, string]>> = {
  pt: [
    ["Escolha", "Modelos separados por base, textura e indicação de uso."],
    ["Confiança", "Garantia e teste dos fios explicados antes da compra."],
    ["Pós-compra", "Orientação para cor, cuidados e conservação da peça."],
  ],
  en: [
    ["Choice", "Models separated by base, texture and recommended use."],
    ["Trust", "Warranty and strand test explained before purchase."],
    ["After purchase", "Guidance for color, care and preserving the piece."],
  ],
  es: [
    ["Eleccion", "Modelos separados por base, textura e indicacion de uso."],
    ["Confianza", "Garantia y prueba de los cabellos explicadas antes de la compra."],
    ["Postcompra", "Orientacion sobre color, cuidados y conservacion de la pieza."],
  ],
};

export async function PorQueReveraContent({ locale = "pt" }: { locale?: SiteLocale } = {}) {
  const t = await textosDaPagina("porque", locale);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-3 text-center">
        <span className="eyebrow-ink">{t("porque.eyebrow")}</span>
        <h1 className="text-balance font-display text-3xl text-ink">{t("porque.titulo")}</h1>
        <p className="max-w-2xl text-ink/70">{INTRO_PORQUE[locale]}</p>
      </Reveal>

      <Reveal className="grid gap-3 sm:grid-cols-3">
        {RESUMO_PORQUE[locale].map(([titulo, texto]) => (
          <div key={titulo} className="rounded-xl border border-sand bg-paper p-4">
            <h2 className="font-display text-base text-ink">{titulo}</h2>
            <p className="mt-2 text-sm leading-5 text-ink/70">{texto}</p>
          </div>
        ))}
      </Reveal>

      {/* Teste de qualidade — texto igual ao de /garantia, mesma fonte
          (seeds/faq.json, pergunta "Como funciona a garantia?"). */}
      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("porque.bloco1.titulo")}
          </h2>
          <p className="text-ink/80">{t("porque.bloco1.texto")}</p>
        </section>
      </Reveal>

      {/* Variedade de cores — o número sai do cadastro real (colors), e
          página /cores, que já lê a mesma tabela colors. */}
      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">{t("porque.bloco2.titulo")}</h2>
          <p className="text-ink/80">
            {t("porque.bloco2.texto")}{" "}
            <a
              href={localizePath("/cores", locale)}
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              {t("porque.bloco2.link")}
            </a>
            .
          </p>
        </section>
      </Reveal>

      {/* Suporte na escolha da cor — texto igual ao da FAQ, pergunta "Vocês
          ajudam a escolher a cor?" (is_visible=true). */}
      <Reveal delayMs={120}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("porque.bloco3.titulo")}
          </h2>
          <p className="text-ink/80">
            {t("porque.bloco3.texto")}{" "}
            <a
              href={localizePath("/cores#ajuda", locale)}
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              {t("porque.bloco3.link")}
            </a>
            .
          </p>
        </section>
      </Reveal>

      {/* Envio para todo o Brasil — a calculadora de frete (Ship
          ShippingCalculator.tsx) já foi desenhada para qualquer CEP do
          país, via provedor de frete configurável (src/lib/shipping). Não
          citamos prazo nem valor aqui: esses dois ainda estão marcados
          como TODO em seeds/faq.json ("Qual o prazo de envio?"), e não são
          o mesmo fato que "para onde a Reverá envia". */}
      <Reveal delayMs={0}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("porque.bloco4.titulo")}
          </h2>
          <p className="text-ink/80">{t("porque.bloco4.texto")}</p>
        </section>
      </Reveal>

      {/* Garantia — texto igual ao de /garantia (mesma fonte). */}
      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">{t("porque.bloco5.titulo")}</h2>
          <p className="text-ink/80">
            {t("porque.bloco5.texto")}{" "}
            <a
              href={localizePath("/garantia", locale)}
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              {t("porque.bloco5.link")}
            </a>
            .
          </p>
        </section>
      </Reveal>
    </main>
  );
}

export default async function PorQueReveraPage() {
  return <PorQueReveraContent />;
}
