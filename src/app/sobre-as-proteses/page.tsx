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

export default function SobreAsProtesesPage() {
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">Para quem nunca usou</span>
        <h1 className="font-display text-3xl text-ink">
          O que é uma prótese capilar
        </h1>
        <p className="max-w-prose text-ink/70">
          Um guia simples, sem termo técnico sem explicação, para entender do
          que a peça é feita e o que muda de uma base para outra.
        </p>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">O que é</h2>
          <p className="text-ink/80">
            A prótese capilar é uma peça feita com fios aplicados a uma base
            que se fixa no couro cabeludo. A função da base é servir de
            suporte para os fios exatamente onde não há mais cabelo — por
            isso a aparência da base (mais discreta ou mais grossa, mais
            transparente ou mais opaca) importa tanto quanto os fios em si.
          </p>
        </section>
      </Reveal>

      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">O que é a base</h2>
          <p className="text-ink/80">
            A base é a membrana onde cada fio é fixado, um a um. É ela que
            fica em contato com o couro cabeludo e que dá o formato da peça.
            A espessura dessa membrana — medida em milímetros — é o principal
            número técnico que aparece quando se fala de prótese capilar.
          </p>
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
            Bases mais finas e bases mais grossas
          </h2>
          <p className="text-ink/80">
            De um jeito geral, quanto mais fina a base, mais discreta ela
            tende a ficar sobre a pele — é o que costuma se buscar na linha
            frontal, perto do rosto. Quanto mais grossa, mais resistente ao
            manuseio do dia a dia ela tende a ser. Essa troca (discrição de
            um lado, resistência do outro) é a lógica geral por trás da
            variedade de espessuras que existe no mercado de próteses
            capilares — não uma promessa sobre qualquer peça específica.
          </p>
        </section>
      </Reveal>

      <Reveal delayMs={60}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            O que significa 0,08mm
          </h2>
          <p className="text-ink/80">
            É a medida da espessura da base, em milímetros. Quanto menor o
            número, mais fina a membrana. A linha que a Reverá trabalha hoje é
            a Micropele 0,08mm — a base mais fina da linha, com acabamento
            natural na linha frontal.
          </p>
        </section>
      </Reveal>

      <Reveal delayMs={120}>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            Cabelos grisalhos
          </h2>
          <p className="text-ink/80">
            Próteses grisalhas de até 50% possuem fios sintéticos, para
            permitir o processo de tonalização sem alterar os fios brancos.
          </p>
        </section>
      </Reveal>

      <Reveal delayMs={0}>
        <section className="flex flex-col gap-3 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">Como escolher</h2>
          <p className="text-ink/80">
            Duas decisões pesam mais: a cor do fio e a orientação de um
            profissional que vai preparar, cortar e aplicar a peça. A Reverá
            ajuda na primeira — veja as{" "}
            <a href="/cores" className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep">
              cores disponíveis
            </a>{" "}
            e a ferramenta para descobrir a sua. A segunda depende do
            profissional escolhido — veja{" "}
            <a
              href="/naturalidade"
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
            >
              o que influencia o resultado
            </a>
            .
          </p>
        </section>
      </Reveal>
    </main>
  );
}
