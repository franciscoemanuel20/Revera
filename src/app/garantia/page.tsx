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

/**
 * Mesma razão de /cuidados: a página segue estática, e o painel revalida na
 * hora ao salvar. Este número é só a rede de segurança.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Garantia",
  description:
    "O teste que você faz ao receber, o que a garantia Reverá cobre e até quando dá para trocar. Sem letra miúda.",
  alternates: { canonical: "/garantia" },
  openGraph: {
    title: "Garantia — Reverá",
    description:
      "O teste que você faz ao receber, o que a garantia Reverá cobre e até quando dá para trocar. Sem letra miúda.",
    url: "/garantia",
  },
};

export default async function GarantiaPage() {
  const t = await textosDaPagina("garantia");

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">{t("garantia.eyebrow")}</span>
        <h1 className="font-display text-3xl text-ink">{t("garantia.titulo")}</h1>
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
            href="/cuidados"
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
