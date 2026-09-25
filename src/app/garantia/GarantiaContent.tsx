import type { Metadata } from "next";
/**
 * Página pública de garantia.
 *
 * ===========================================================================
 * O QUE ENTROU EM 29/08/2026, E O QUE FOI DEIXADO DE FORA DE PROPÓSITO
 * ===========================================================================
 * O Francisco pediu para acrescentar: (a) o teste dos fios que o cliente deve
 * fazer ao receber a peça, (b) que depois de cortar e moldar não há mais
 * troca, (c) o enquadramento legal, dizendo que a prótese é "bem não
 * durável".
 *
 * (a) e (b) entraram. O (c) NÃO, e depois o próprio Francisco decidiu que a
 * página não citaria lei nenhuma ("então não escreva a lei, é melhor"). A
 * razão de (c) fica registrada para ninguém reescrever de boa-fé mais tarde:
 *
 *   O art. 26 do CDC dá 30 dias para reclamar de vício aparente em produto
 *   NÃO durável e 90 dias em produto DURÁVEL. Não durável é o que se esgota
 *   com o uso em pouco tempo — comida, remédio, higiene. Prótese capilar dura
 *   de 4 a 18 meses conforme o material e o cuidado; pela definição do
 *   próprio artigo ela é DURÁVEL.
 *
 *   Escrever "bem não durável" na página não encurtaria o direito de ninguém:
 *   só colocaria no ar uma cláusula que o Procon derruba, e cláusula derrubada
 *   enfraquece o resto da política — inclusive a parte da troca, que é a que
 *   de fato protege a operação.
 *
 * POR QUE NÃO HÁ ARTIGO CITADO AQUI: decisão do Francisco em 29/08/2026.
 * Citar artigo transforma a página em contrato e cria a chance de citar
 * errado. A frase dos 7 dias para desistir CONTINUA na página, em português
 * comum e sem número de artigo — o direito existe citado ou não, e escondê-lo
 * seria o único jeito de essa página virar problema.
 *
 * O AVISO "política revisada juridicamente antes da publicação final" saiu em
 * 29/08/2026, a pedido do Francisco. Ele dizia ao cliente que a política não
 * estava pronta — ou seja, convidava a testá-la. A necessidade de revisão de
 * advogado continua real; ela é assunto interno, e este comentário é o lugar
 * dela. Não acrescente cláusula nesta página sem confirmar o fato.
 */
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { textosDaPagina } from "@/lib/conteudo/textos";
import { localizePath, type SiteLocale } from "@/lib/i18n/site";

/**
 * Mesma razão de /cuidados: a página segue estática, e o painel revalida na
 * hora ao salvar. Este número é só a rede de segurança.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Garantia da prótese capilar",
  description:
    "Entenda a garantia da prótese capilar Reverá: teste dos fios ao receber, prazos, cuidados e quando a troca ainda é possível.",
  keywords: [
    "garantia prótese capilar",
    "troca de prótese capilar",
    "cuidados com prótese capilar",
    "Reverá garantia",
  ],
  alternates: { canonical: "/garantia" },
  openGraph: {
    title: "Garantia da prótese capilar — Reverá",
    description:
      "Entenda a garantia da prótese capilar Reverá: teste dos fios ao receber, prazos, cuidados e quando a troca ainda é possível.",
    url: "/garantia",
  },
};

const RESUMO_GARANTIA: Record<SiteLocale, Array<[string, string]>> = {
  pt: [
    ["Recebeu", "Faça o teste dos fios com a peça intacta."],
    ["Percebeu defeito", "Pare o uso e fale com a Reverá antes de alterar a peça."],
    ["Vai aplicar", "Depois de cortar, moldar ou colar, a peça não volta ao estado original."],
  ],
  en: [
    ["Received it", "Do the strand test while the piece is still intact."],
    ["Found a defect", "Stop using it and contact Revera before changing the piece."],
    ["Ready to apply", "After cutting, shaping or gluing, the piece cannot return to its original condition."],
  ],
  es: [
    ["Recibiste", "Haz la prueba de los cabellos con la pieza intacta."],
    ["Viste un defecto", "Deten el uso y habla con Revera antes de alterar la pieza."],
    ["Vas a aplicarla", "Despues de cortar, moldear o pegar, la pieza no vuelve al estado original."],
  ],
};

const INTRO_GARANTIA: Record<SiteLocale, string> = {
  pt: "A regra principal é simples: confira a peça antes de cortar, moldar ou aplicar cola. Esse cuidado preserva a possibilidade de troca.",
  en: "The main rule is simple: check the piece before cutting, shaping or applying glue. This care preserves the possibility of exchange.",
  es: "La regla principal es simple: revisa la pieza antes de cortar, moldear o aplicar pegamento. Ese cuidado preserva la posibilidad de cambio.",
};

export async function GarantiaContent({ locale = "pt" }: { locale?: SiteLocale } = {}) {
  const t = await textosDaPagina("garantia", locale);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-3 text-center">
        <span className="eyebrow-ink">{t("garantia.eyebrow")}</span>
        <h1 className="text-balance font-display text-3xl text-ink">{t("garantia.titulo")}</h1>
        <p className="max-w-2xl text-ink/70">{INTRO_GARANTIA[locale]}</p>
      </Reveal>

      <Reveal className="grid gap-3 sm:grid-cols-3">
        {RESUMO_GARANTIA[locale].map(([titulo, texto]) => (
          <div key={titulo} className="rounded-xl border border-sand bg-paper p-4">
            <h2 className="font-display text-lg text-ink">{titulo}</h2>
            <p className="mt-2 text-sm leading-5 text-ink/70">{texto}</p>
          </div>
        ))}
      </Reveal>

      <Reveal className="flex flex-col gap-6 text-ink/80">
        <p>{t("garantia.intro")}</p>
      </Reveal>

      {/* O TESTE — é a parte prática da página e a que evita a maioria dos
          problemas. Passo a passo, e não parágrafo corrido, porque a pessoa
          vai ler isso com a peça na mão. */}
      <Reveal className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink">{t("garantia.teste.titulo")}</h2>
        <ol className="flex flex-col gap-4 text-ink/80">
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">1</span>
            <span>{t("garantia.passo1")}</span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">2</span>
            <span>{t("garantia.passo2")}</span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">3</span>
            <span>{t("garantia.passo3")}</span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">4</span>
            <span>{t("garantia.passo4")}</span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">5</span>
            <span>
              {t("garantia.passo5.antes")}{" "}
              <strong className="text-ink">{t("garantia.passo5.destaque")}</strong>
              {t("garantia.passo5.depois")}
            </span>
          </li>
        </ol>
      </Reveal>

      {/* A JANELA DA TROCA — dita como consequência de fato, não como perda de
          direito: peça cortada e colada não volta ao estado em que chegou, e é
          isso que fecha a porta da troca. */}
      <Reveal className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink">{t("garantia.troca.titulo")}</h2>
        <p className="text-ink/80">{t("garantia.troca.p1")}</p>
        <p className="text-ink/80">{t("garantia.troca.p2")}</p>
        <p className="rounded-md border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-ink/80">
          {t("garantia.troca.aviso")}
        </p>
      </Reveal>

      <Reveal className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink">{t("garantia.prazos.titulo")}</h2>
        <p className="text-ink/80">
          {t("garantia.prazos.defeito.antes")}{" "}
          <strong className="text-ink">{t("garantia.prazos.defeito.prazo")}</strong>{" "}
          {t("garantia.prazos.defeito.depois")}
        </p>
        <p className="text-ink/80">
          {t("garantia.prazos.desistir.antes")}{" "}
          <strong className="text-ink">{t("garantia.prazos.desistir.prazo")}</strong>{" "}
          {t("garantia.prazos.desistir.depois")}
        </p>
        <p className="text-ink/80">
          {t("garantia.prazos.cuidados.antes")}{" "}
          <a
            href={localizePath("/cuidados", locale)}
            className="text-ink underline decoration-gold decoration-2 underline-offset-4"
          >
            {t("garantia.prazos.cuidados.link")}
          </a>
          .
        </p>
      </Reveal>

    </main>
  );
}

export default async function GarantiaPage() {
  return <GarantiaContent />;
}
