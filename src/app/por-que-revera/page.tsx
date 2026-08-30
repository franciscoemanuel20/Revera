import type { Metadata } from "next";
// Página de confiança — pedida pela auditoria de 26/08/2026. Cada item
// abaixo tem uma fonte: ver o comentário ao lado da seção correspondente.
// Nada de "atendimento 24h", contagem de clientes ou selo — não existe
// fato confirmado para nenhum desses, e a instrução da missão foi
// explícita: só os itens abaixo, nada além.
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
  title: "Por que Reverá",
  description:
    "Teste de qualidade antes do envio, garantia de 7 dias úteis e acabamento na linha frontal. O que nos separa do genérico.",
  alternates: { canonical: "/por-que-revera" },
  openGraph: {
    title: "Por que Reverá — Reverá",
    description:
      "Teste de qualidade antes do envio, garantia de 7 dias úteis e acabamento na linha frontal. O que nos separa do genérico.",
    url: "/por-que-revera",
  },
};

export default async function PorQueReveraPage() {
  const t = await textosDaPagina("porque");

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">{t("porque.eyebrow")}</span>
        <h1 className="font-display text-3xl text-ink">{t("porque.titulo")}</h1>
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
              href="/cores"
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
              href="/cores#ajuda"
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
              href="/garantia"
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
