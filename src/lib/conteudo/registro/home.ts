import type { TextoRegistrado } from "../registro";

/**
 * A home.
 *
 * ===========================================================================
 * O PARÁGRAFO DA NATURALIDADE NÃO É COPY (30/08/2026)
 * ===========================================================================
 * "A naturalidade do resultado depende não apenas da qualidade da prótese..."
 * é o princípio oficial da marca, palavra por palavra, e o comentário que
 * já existia em `page.tsx` avisa: não invente variação dele.
 *
 * Ele fica editável, porque tirar do painel um texto que está na tela seria
 * esconder — mas o rótulo diz o que ele é. Quem abrir o painel e ler "TEXTO
 * OFICIAL DA MARCA" antes de reescrever pensa duas vezes; quem lê só
 * "parágrafo 3" não pensa nenhuma.
 *
 * ===========================================================================
 * O QUE FICOU DE FORA DESTA RODADA
 * ===========================================================================
 * A barra de selos (TrustBar: "Teste de qualidade antes do envio", "7 dias
 * úteis de garantia") NÃO entra aqui, e não é esquecimento: ela aparece na
 * home E na página do produto. Conteúdo que vive em dois lugares precisa de
 * um grupo próprio no painel — senão editar pela home mudaria um lugar só, e
 * o site passaria a dizer duas coisas diferentes sobre a mesma garantia.
 *
 * Fazer isso direito exige passar os textos por dentro da página do produto,
 * que é a página que vende. Fica para a rodada seguinte, com calma.
 */
export const HOME = {
  "home.hero.eyebrow": {
    pagina: "home",
    rotulo: "Etiqueta acima do título principal",
    tipo: "texto",
    padrao: "Base micropele 0,08mm",
  },
  "home.hero.titulo": {
    pagina: "home",
    rotulo: "Título principal do site",
    tipo: "texto",
    padrao: "Prótese capilar com acabamento natural",
  },
  "home.hero.subtitulo": {
    pagina: "home",
    rotulo: "Frase abaixo do título principal",
    tipo: "texto",
    padrao: "Envio para todo o Brasil.",
  },
  "home.hero.botaoComprar": {
    pagina: "home",
    rotulo: "Botão de compra (só aparece com produto publicado)",
    tipo: "texto",
    padrao: "Comprar agora",
  },
  "home.hero.botaoConhecer": {
    pagina: "home",
    rotulo: "Botão secundário do topo",
    tipo: "texto",
    padrao: "Conheça nossas próteses",
  },

  "home.naturalidade.eyebrow": {
    pagina: "home",
    rotulo: "Etiqueta da seção do vídeo",
    tipo: "texto",
    padrao: "Naturalidade",
  },
  "home.naturalidade.titulo": {
    pagina: "home",
    rotulo: "Título da seção do vídeo",
    tipo: "texto",
    padrao: "Implantação real, fio a fio",
  },
  "home.naturalidade.texto": {
    pagina: "home",
    rotulo: "TEXTO OFICIAL DA MARCA — parágrafo abaixo do vídeo",
    tipo: "paragrafo",
    padrao:
      "A naturalidade do resultado depende não apenas da qualidade da prótese, mas também da escolha da peça, preparação, corte, coloração e técnicas utilizadas pelo profissional.",
  },

  "home.naturalidade.videoCapa": {
    pagina: "home",
    rotulo: "Capa do vídeo (a imagem parada, antes de dar play)",
    tipo: "imagem",
    // O VÍDEO EM SI NÃO ENTROU NO REGISTRO, só a capa dele — e a diferença
    // não é preguiça. Uma capa trocada por engano é uma imagem estranha
    // por alguns segundos; um .mp4 trocado por engano é a peça central da
    // home no ar errada, num arquivo de dezenas de MB que nem passa pelo
    // limite de 6 MB das Server Actions (next.config.js). Trocar o vídeo
    // continua sendo deploy, de propósito.
    padrao: "/media/hero/produto-close-1.jpeg",
  },

  "home.micropele.eyebrow": {
    pagina: "home",
    rotulo: "Etiqueta da seção da linha Micropele",
    tipo: "texto",
    padrao: "Linha micropele",
  },
  // 02/09/2026 — a mesma correção de fato feita em registro/sobre.ts.
  //
  // O título era "A mais fina da linha" e o texto falava só de 0,08mm.
  // Isso descrevia a peça, e virou mentira quando a Micropele 0,06mm
  // entrou no catálogo (as duas estão `status: active` no banco, com
  // preço e variante — conferido em 02/09). O título agora fala da LINHA
  // Micropele contra as outras (Cacho Aberto, Cacho Fechado, Afro, Full
  // Lace, Austrália), o que continua verdadeiro, e o texto cita as duas
  // espessuras.
  "home.micropele.titulo": {
    pagina: "home",
    rotulo: "Título da seção da linha Micropele",
    tipo: "texto",
    padrao: "A linha mais fina da Reverá",
  },
  "home.micropele.texto": {
    pagina: "home",
    rotulo: "Texto da seção da linha Micropele",
    tipo: "paragrafo",
    padrao:
      "Base ultrafina em duas espessuras — 0,08mm e 0,06mm, a mais fina da linha —, com acabamento natural na linha frontal. É o carro-chefe da Reverá.",
  },
  "home.micropele.foto": {
    pagina: "home",
    rotulo: "Foto da seção da linha Micropele",
    tipo: "imagem",
    padrao: "/media/hero/produto-close-2.jpeg",
  },
  "home.micropele.fotoAlt": {
    pagina: "home",
    rotulo: "Foto da linha Micropele — descrição (leitor de tela e Google)",
    tipo: "texto",
    // Estava fixa no código como "Close da base Micropele 0,08mm". Virou
    // editável junto com a foto pelo mesmo motivo de registro/sobre.ts: se
    // a foto pode mudar sem deploy, a descrição precisa acompanhar, senão
    // ela passa a descrever uma foto que não está mais ali — e é o tipo de
    // erro que só quem usa leitor de tela percebe.
    padrao: "Close da base Micropele",
  },

  "home.micropele.linkComProduto": {
    pagina: "home",
    rotulo: "Link da seção Micropele — quando há produto publicado",
    tipo: "texto",
    padrao: "Ver detalhes e cores disponíveis",
  },
  "home.micropele.linkSemProduto": {
    pagina: "home",
    rotulo: "Link da seção Micropele — quando não há produto publicado",
    tipo: "texto",
    padrao: "Ver as cores disponíveis",
  },

  /* Só aparecem quando existe avaliação publicada. Hoje não existe nenhuma,
     então a seção inteira está invisível no site — o texto fica cadastrado
     aqui de qualquer jeito, para não ser esquecido no dia em que a primeira
     avaliação for publicada. */
  "home.depoimentos.eyebrow": {
    pagina: "home",
    rotulo: "Etiqueta da seção de depoimentos",
    tipo: "texto",
    padrao: "Quem já usa",
  },
  "home.depoimentos.titulo": {
    pagina: "home",
    rotulo: "Título da seção de depoimentos",
    tipo: "texto",
    padrao: "O que dizem sobre a Reverá",
  },
} as const satisfies Record<string, TextoRegistrado>;
