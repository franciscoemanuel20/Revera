import type { Metadata } from "next";
// Página de confiança — pedida pela auditoria de 26/08/2026. Cada item
// abaixo tem uma fonte: ver o comentário ao lado da seção correspondente.
// Nada de "atendimento 24h", contagem de clientes ou selo — não existe
// fato confirmado para nenhum desses, e a instrução da missão foi
// explícita: só os itens abaixo, nada além.
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

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

export default function PorQueReveraPage() {
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">Confiança</span>
        <h1 className="font-display text-3xl text-ink">Por que a Reverá</h1>
      </Reveal>

      {/* Teste de qualidade — texto igual ao de /garantia, mesma fonte
          (seeds/faq.json, pergunta "Como funciona a garantia?"). */}
      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            Teste de qualidade antes do envio
          </h2>
          <p className="text-ink/80">
            Antes do envio, todas as próteses passam por um rigoroso teste de
            qualidade para garantir que o produto seja entregue em perfeitas
            condições.
          </p>
        </section>
      </Reveal>

      {/* Variedade de cores — 8 cores reais, ver seeds/colors.json e a
          página /cores, que já lê a mesma tabela colors. */}
      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">Variedade de cores</h2>
          <p className="text-ink/80">
            A linha Micropele está disponível em 8 cores. Veja todas em{" "}
            <a
              href="/cores"
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              /cores
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
            Suporte na escolha da cor
          </h2>
          <p className="text-ink/80">
            Envie uma foto do seu cabelo natural e nossa equipe indica a cor
            mais parecida entre as opções disponíveis — a ferramenta está na
            própria página de{" "}
            <a
              href="/cores#ajuda"
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              cores
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
            Envio para todo o Brasil
          </h2>
          <p className="text-ink/80">
            O frete é calculado pelo CEP no fechamento do pedido, para
            qualquer lugar do país.
          </p>
        </section>
      </Reveal>

      {/* Garantia — texto igual ao de /garantia (mesma fonte). */}
      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">Garantia</h2>
          <p className="text-ink/80">
            Após o recebimento da prótese, o cliente tem o prazo de até 7
            dias úteis para comunicar qualquer possível defeito de
            fabricação. Veja os detalhes em{" "}
            <a
              href="/garantia"
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              /garantia
            </a>
            .
          </p>
        </section>
      </Reveal>
    </main>
  );
}
