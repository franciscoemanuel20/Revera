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
 * (a) e (b) entraram. O (c) NÃO — e a razão está aqui para ninguém reescrever
 * de boa-fé mais tarde:
 *
 *   O art. 26 do CDC dá 30 dias para reclamar de vício aparente em produto
 *   NÃO durável e 90 dias em produto DURÁVEL. Não durável é o que se esgota
 *   com o uso em pouco tempo — comida, remédio, higiene. Prótese capilar dura
 *   de 4 a 18 meses conforme o material e o cuidado; pela definição do
 *   próprio artigo ela é DURÁVEL.
 *
 *   Escrever "bem não durável" na página não encurta o direito de ninguém: só
 *   coloca no ar uma cláusula que o Procon derruba e que, derrubada, enfraquece
 *   o resto da política. O texto abaixo afirma o prazo comercial da Reverá (7
 *   dias úteis) sem declarar prazo legal nenhum — que é o que se pode dizer
 *   com segurança sem parecer jurídico.
 *
 * Mesma regra de antes: não acrescente cláusula aqui sem confirmar o fato.
 * Esta página precisa de revisão de advogado antes de virar política
 * definitiva.
 */
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

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

export default function GarantiaPage() {
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">Pós-venda</span>
        <h1 className="font-display text-3xl text-ink">Garantia</h1>
      </Reveal>

      <Reveal className="flex flex-col gap-6 text-ink/80">
        <p>
          Antes do envio, toda prótese passa por um teste de qualidade. Ainda
          assim, o teste que decide é o seu, e ele é feito no minuto em que a
          peça chega — antes de cortar, antes de moldar, antes de colar.
        </p>
      </Reveal>

      {/* O TESTE — é a parte prática da página e a que evita a maioria dos
          problemas. Passo a passo, e não parágrafo corrido, porque a pessoa
          vai ler isso com a peça na mão. */}
      <Reveal className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink">O teste dos fios</h2>
        <ol className="flex flex-col gap-4 text-ink/80">
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">1</span>
            <span>
              Coloque um pano claro embaixo da peça, para enxergar qualquer fio
              que soltar.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">2</span>
            <span>
              Passe a mão sobre os fios, com suavidade. Sem puxar, sem apertar.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">3</span>
            <span>
              É normal soltar alguns fios logo no começo — são fios que ficaram
              soltos da confecção e não estavam presos na base.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">4</span>
            <span>
              Continue por cerca de um minuto. Depois disso, passe a mão de
              novo e olhe o pano: a queda deve ter parado.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-display text-lg text-gold">5</span>
            <span>
              Se ainda estiver caindo fio depois desse minuto,{" "}
              <strong className="text-ink">pare por aí</strong>. Não corte, não
              modele, não cole. Fale com a gente com a peça do jeito que
              chegou.
            </span>
          </li>
        </ol>
      </Reveal>

      {/* A JANELA DA TROCA — dita como consequência de fato, não como perda de
          direito: peça cortada e colada não volta ao estado em que chegou, e é
          isso que fecha a porta da troca. */}
      <Reveal className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink">Até quando dá para trocar</h2>
        <p className="text-ink/80">
          Enquanto a peça está como chegou — sem corte, sem modelagem e sem
          cola —, ela pode ser devolvida e trocada por outra.
        </p>
        <p className="text-ink/80">
          Depois de cortada, moldada e colada na cabeça, a prótese não volta ao
          estado em que foi enviada: ela foi ajustada para uma pessoa só. A
          partir daí não há mais devolução nem troca por queda de fio, e é por
          isso que o teste acima é responsabilidade sua e vem antes de qualquer
          outra coisa.
        </p>
        <p className="rounded-md border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-ink/80">
          Um minuto passando a mão nos fios, antes da tesoura, é o que separa
          uma troca simples de uma peça que não tem mais como voltar.
        </p>
      </Reveal>

      <Reveal className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink">Prazos</h2>
        <p className="text-ink/80">
          Você tem <strong className="text-ink">7 dias úteis</strong> a partir do
          recebimento para comunicar defeito de fabricação — e é justamente o
          teste dos fios que revela isso logo no primeiro dia.
        </p>
        <p className="text-ink/80">
          Comprou pelo site e mudou de ideia? O Código de Defesa do Consumidor
          garante <strong className="text-ink">7 dias corridos</strong> para
          desistir da compra, contados do recebimento, com a peça sem uso e sem
          alteração (art. 49). Nada nesta página reduz esse direito nem os
          demais prazos legais.
        </p>
        <p className="text-ink/80">
          A durabilidade depois disso depende dos cuidados do dia a dia — o que
          usar, como lavar e o que evitar está em{" "}
          <a
            href="/cuidados"
            className="text-ink underline decoration-gold decoration-2 underline-offset-4"
          >
            Cuidados
          </a>
          .
        </p>
      </Reveal>

      <p className="rounded-md border border-moss/30 bg-moss/5 px-4 py-3 text-sm text-moss">
        Política revisada juridicamente antes da publicação final.
      </p>
    </main>
  );
}
