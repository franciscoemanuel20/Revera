import type { TextoRegistrado } from "../registro";

/**
 * /cuidados — os três blocos são os fatos confirmados no material da marca
 * (mesmos textos da FAQ). Ficam editáveis um a um, e não como um parágrafo
 * só, porque é assim que a página os desenha: juntar tudo num campo faria o
 * Francisco ter que reproduzir a formatação na mão.
 */
export const CUIDADOS = {
  "cuidados.eyebrow": {
    pagina: "cuidados",
    rotulo: "Etiqueta acima do título",
    tipo: "texto",
    padrao: "Cuidados diários",
  },
  "cuidados.titulo": {
    pagina: "cuidados",
    rotulo: "Título da página",
    tipo: "texto",
    padrao: "Cuidados com a prótese",
  },
  "cuidados.intro": {
    pagina: "cuidados",
    rotulo: "Frase de introdução",
    tipo: "paragrafo",
    padrao: "Cuidados diários garantem mais durabilidade e beleza.",
  },

  "cuidados.bloco1.titulo": {
    pagina: "cuidados",
    rotulo: "Bloco 1 — título",
    tipo: "texto",
    padrao: "Lavagem",
  },
  "cuidados.bloco1.texto": {
    pagina: "cuidados",
    rotulo: "Bloco 1 — texto",
    tipo: "paragrafo",
    padrao:
      "Lave os fios de 1 a 2 vezes por semana, com condicionador sem sal. Nos outros dias, use touca de banho na prótese; a lateral do seu cabelo pode ser lavada normalmente.",
  },

  "cuidados.bloco2.titulo": {
    pagina: "cuidados",
    rotulo: "Bloco 2 — título",
    tipo: "texto",
    padrao: "Calor",
  },
  "cuidados.bloco2.texto": {
    pagina: "cuidados",
    rotulo: "Bloco 2 — texto",
    tipo: "paragrafo",
    padrao:
      "Chapinha é proibida. O secador deve ser usado apenas no modo frio ou morno.",
  },

  "cuidados.bloco3.titulo": {
    pagina: "cuidados",
    rotulo: "Bloco 3 — título",
    tipo: "texto",
    padrao: "Próteses grisalhas",
  },
  "cuidados.bloco3.texto": {
    pagina: "cuidados",
    rotulo: "Bloco 3 — texto",
    tipo: "paragrafo",
    padrao:
      "Próteses grisalhas de até 50% possuem fios sintéticos, para permitir o processo de tonalização sem alterar os fios brancos.",
  },
} as const satisfies Record<string, TextoRegistrado>;
