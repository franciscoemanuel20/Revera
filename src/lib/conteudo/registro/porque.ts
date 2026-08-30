import type { TextoRegistrado } from "../registro";

/**
 * /por-que-revera — cinco blocos, cada um com uma fonte já citada no
 * comentário da própria página (FAQ, /garantia, /cores, cadastro de
 * colors). Os links de dentro dos parágrafos (para /cores, /garantia)
 * ficam de fora do registro: o destino (`href`) é navegação, não texto de
 * marketing, e trocá-lo por engano quebraria a página de destino sem
 * nenhum aviso. O texto visível do link entra como chave própria, porque
 * esse sim é copy.
 */
export const PORQUE = {
  "porque.eyebrow": {
    pagina: "porque",
    rotulo: "Etiqueta acima do título",
    tipo: "texto",
    padrao: "Confiança",
  },
  "porque.titulo": {
    pagina: "porque",
    rotulo: "Título da página",
    tipo: "texto",
    padrao: "Por que a Reverá",
  },

  "porque.bloco1.titulo": {
    pagina: "porque",
    rotulo: "Bloco 1 — título",
    tipo: "texto",
    padrao: "Teste de qualidade antes do envio",
  },
  "porque.bloco1.texto": {
    pagina: "porque",
    rotulo: "Bloco 1 — texto",
    tipo: "paragrafo",
    padrao:
      "Antes do envio, todas as próteses passam por um rigoroso teste de qualidade para garantir que o produto seja entregue em perfeitas condições.",
  },

  "porque.bloco2.titulo": {
    pagina: "porque",
    rotulo: "Bloco 2 — título",
    tipo: "texto",
    padrao: "Variedade de cores",
  },
  "porque.bloco2.texto": {
    pagina: "porque",
    rotulo: "Bloco 2 — texto (antes do link)",
    tipo: "paragrafo",
    padrao:
      "A linha Micropele está disponível em 15 cores, incluindo a escala de grisalho. Veja todas em",
  },
  "porque.bloco2.link": {
    pagina: "porque",
    rotulo: "Bloco 2 — texto do link para /cores",
    tipo: "texto",
    padrao: "/cores",
  },

  "porque.bloco3.titulo": {
    pagina: "porque",
    rotulo: "Bloco 3 — título",
    tipo: "texto",
    padrao: "Suporte na escolha da cor",
  },
  "porque.bloco3.texto": {
    pagina: "porque",
    rotulo: "Bloco 3 — texto (antes do link)",
    tipo: "paragrafo",
    padrao:
      "Envie uma foto do seu cabelo natural e nossa equipe indica a cor mais parecida entre as opções disponíveis — a ferramenta está na própria página de",
  },
  "porque.bloco3.link": {
    pagina: "porque",
    rotulo: "Bloco 3 — texto do link para /cores#ajuda",
    tipo: "texto",
    padrao: "cores",
  },

  "porque.bloco4.titulo": {
    pagina: "porque",
    rotulo: "Bloco 4 — título",
    tipo: "texto",
    padrao: "Envio para todo o Brasil",
  },
  "porque.bloco4.texto": {
    pagina: "porque",
    rotulo: "Bloco 4 — texto",
    tipo: "paragrafo",
    padrao:
      "O frete é calculado pelo CEP no fechamento do pedido, para qualquer lugar do país.",
  },

  "porque.bloco5.titulo": {
    pagina: "porque",
    rotulo: "Bloco 5 — título",
    tipo: "texto",
    padrao: "Garantia",
  },
  "porque.bloco5.texto": {
    pagina: "porque",
    rotulo: "Bloco 5 — texto (antes do link)",
    tipo: "paragrafo",
    padrao:
      "Após o recebimento da prótese, o cliente tem o prazo de até 7 dias úteis para comunicar qualquer possível defeito de fabricação. Veja os detalhes em",
  },
  "porque.bloco5.link": {
    pagina: "porque",
    rotulo: "Bloco 5 — texto do link para /garantia",
    tipo: "texto",
    padrao: "/garantia",
  },
} as const satisfies Record<string, TextoRegistrado>;
