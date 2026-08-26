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

const FATORES = [
  {
    titulo: "A peça",
    texto:
      "A qualidade da base e do fio é o ponto de partida — mas só o ponto de partida. Uma peça bem-feita ainda depende de tudo abaixo para o resultado final.",
  },
  {
    titulo: "A escolha da peça certa",
    texto:
      "Espessura de base e cor do fio precisam combinar com o caso de quem vai usar. A mesma peça pode ler de formas diferentes em situações diferentes.",
  },
  {
    titulo: "Preparação",
    texto:
      "Como a base é preparada antes da aplicação — moldagem, ajuste ao formato da cabeça — influencia diretamente no caimento da peça.",
  },
  {
    titulo: "Corte",
    texto:
      "Um corte malfeito chama atenção mesmo numa base excelente. É trabalho manual do profissional, feito peça por peça.",
  },
  {
    titulo: "Coloração",
    texto:
      "Ajustar o tom do fio à raiz e ao restante do cabelo (quando há) é o que evita um contraste perceptível na linha de transição.",
  },
  {
    titulo: "Técnica de aplicação",
    texto:
      "O mesmo material aplicado por técnicas diferentes produz resultados diferentes. É a parte que depende inteiramente do profissional, não do produto.",
  },
];

export default function NaturalidadePage() {
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">A pergunta mais comum</span>
        <h1 className="font-display text-3xl text-ink">
          Vai parecer artificial?
        </h1>
      </Reveal>

      <Reveal>
        <blockquote className="surface-elevada rounded-lg border-l-4 border-l-gold px-6 py-6 text-lg italic text-paper">
          “A naturalidade do resultado depende não apenas da qualidade da
          prótese, mas também da escolha da peça, preparação, corte,
          coloração e técnicas utilizadas pelo profissional.”
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
            Seu navegador não reproduz este vídeo.
          </video>
          <p className="text-sm text-ink/60">
            Vídeo real do processo de implantação da prótese.
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            O que realmente influencia o resultado
          </h2>
          <p className="text-ink/80">
            Naturalidade não é uma característica única do produto — é a soma
            de seis coisas. Uma peça de qualidade não compensa sozinha um
            corte malfeito, e um bom corte não compensa uma peça errada para
            o caso.
          </p>
        </section>
      </Reveal>

      <div className="flex flex-col gap-6">
        {FATORES.map((fator, i) => (
          <Reveal key={fator.titulo} delayMs={i * 60}>
            <section className="flex flex-col gap-2 border-t border-sand pt-6">
              <h3 className="font-display text-lg text-ink">{fator.titulo}</h3>
              <p className="text-ink/80">{fator.texto}</p>
            </section>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="rounded-md border border-moss/30 bg-moss/5 px-4 py-3 text-sm text-moss">
          Esta página não usa foto de antes e depois: a Reverá ainda não tem
          esse material. Preferimos mostrar o processo real e explicar com
          honestidade o que pesa no resultado, em vez de prometer um efeito
          que depende de fatores fora do nosso controle.
        </p>
      </Reveal>
    </main>
  );
}
