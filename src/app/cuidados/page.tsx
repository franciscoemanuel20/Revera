// Página pública de cuidados — os quatro fatos reais confirmados no
// material da marca (mesmos textos usados na FAQ, ver seeds/faq.json,
// perguntas "Posso lavar normalmente?", "Posso usar secador?", "Posso usar
// chapinha?" e "Como faço a manutenção?"). Nada aqui foi inferido: são os
// blocos curtos, não um parágrafo corrido, porque é assim que a marca
// passou o conteúdo — misturar tudo em um texto só inventaria transição
// que ninguém escreveu.
const BLOCOS = [
  {
    titulo: "Lavagem",
    texto:
      "Lave os fios de 1 a 2 vezes por semana, com condicionador sem sal. Nos outros dias, use touca de banho na prótese; a lateral do seu cabelo pode ser lavada normalmente.",
  },
  {
    titulo: "Calor",
    texto:
      "Chapinha é proibida. O secador deve ser usado apenas no modo frio ou morno.",
  },
  {
    titulo: "Próteses grisalhas",
    texto:
      "Próteses grisalhas de até 50% possuem fios sintéticos, para permitir o processo de tonalização sem alterar os fios brancos.",
  },
];

export default function CuidadosPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-3xl text-ink">Cuidados com a prótese</h1>
        <p className="text-ink/70">
          Cuidados diários garantem mais durabilidade e beleza.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {BLOCOS.map((bloco) => (
          <section key={bloco.titulo} className="flex flex-col gap-2 border-t border-sand pt-6">
            <h2 className="font-display text-xl text-ink">{bloco.titulo}</h2>
            <p className="text-ink/80">{bloco.texto}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
