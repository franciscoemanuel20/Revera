import type { TextoRegistrado } from "../registro";

/**
 * /naturalidade — a citação em destaque é o texto oficial da marca, citado
 * palavra por palavra na missão que criou a página (ver comentário em
 * naturalidade/page.tsx). Fica editável como qualquer outro texto porque a
 * regra deste registro é "o que está na página hoje", não "o que pode ser
 * editado" — mas o Francisco decide se mexe nela sabendo que é a única
 * promessa de naturalidade que o site faz.
 *
 * Os seis fatores eram um array de objetos com texto embutido
 * (`FATORES` em page.tsx); aqui o array passa a guardar só as CHAVES,
 * mesmo tratamento que `cuidados.tsx` deu ao array `BLOCOS`.
 */
export const NATURALIDADE = {
  "naturalidade.eyebrow": {
    pagina: "naturalidade",
    rotulo: "Etiqueta acima do título",
    tipo: "texto",
    padrao: "A pergunta mais comum",
  },
  "naturalidade.titulo": {
    pagina: "naturalidade",
    rotulo: "Título da página",
    tipo: "texto",
    padrao: "Vai parecer artificial?",
  },
  "naturalidade.citacao": {
    pagina: "naturalidade",
    rotulo: "Citação em destaque",
    tipo: "paragrafo",
    padrao:
      "“A naturalidade do resultado depende não apenas da qualidade da prótese, mas também da escolha da peça, preparação, corte, coloração e técnicas utilizadas pelo profissional.”",
  },

  "naturalidade.video.legenda": {
    pagina: "naturalidade",
    rotulo: "Legenda abaixo do vídeo",
    tipo: "texto",
    padrao: "Vídeo real do processo de implantação da prótese.",
  },
  "naturalidade.video.fallback": {
    pagina: "naturalidade",
    rotulo: "Aviso para quem não consegue ver o vídeo",
    tipo: "texto",
    padrao: "Seu navegador não reproduz este vídeo.",
  },

  "naturalidade.influencia.titulo": {
    pagina: "naturalidade",
    rotulo: "Seção \"o que influencia\" — título",
    tipo: "texto",
    padrao: "O que realmente influencia o resultado",
  },
  "naturalidade.influencia.texto": {
    pagina: "naturalidade",
    rotulo: "Seção \"o que influencia\" — texto",
    tipo: "paragrafo",
    padrao:
      "Naturalidade não é uma característica única do produto — é a soma de seis coisas. Uma peça de qualidade não compensa sozinha um corte malfeito, e um bom corte não compensa uma peça errada para o caso.",
  },

  "naturalidade.fator1.titulo": {
    pagina: "naturalidade",
    rotulo: "Fator 1 — título",
    tipo: "texto",
    padrao: "A peça",
  },
  "naturalidade.fator1.texto": {
    pagina: "naturalidade",
    rotulo: "Fator 1 — texto",
    tipo: "paragrafo",
    padrao:
      "A qualidade da base e do fio é o ponto de partida — mas só o ponto de partida. Uma peça bem-feita ainda depende de tudo abaixo para o resultado final.",
  },

  "naturalidade.fator2.titulo": {
    pagina: "naturalidade",
    rotulo: "Fator 2 — título",
    tipo: "texto",
    padrao: "A escolha da peça certa",
  },
  "naturalidade.fator2.texto": {
    pagina: "naturalidade",
    rotulo: "Fator 2 — texto",
    tipo: "paragrafo",
    padrao:
      "Espessura de base e cor do fio precisam combinar com o caso de quem vai usar. A mesma peça pode ler de formas diferentes em situações diferentes.",
  },

  "naturalidade.fator3.titulo": {
    pagina: "naturalidade",
    rotulo: "Fator 3 — título",
    tipo: "texto",
    padrao: "Preparação",
  },
  "naturalidade.fator3.texto": {
    pagina: "naturalidade",
    rotulo: "Fator 3 — texto",
    tipo: "paragrafo",
    padrao:
      "Como a base é preparada antes da aplicação — moldagem, ajuste ao formato da cabeça — influencia diretamente no caimento da peça.",
  },

  "naturalidade.fator4.titulo": {
    pagina: "naturalidade",
    rotulo: "Fator 4 — título",
    tipo: "texto",
    padrao: "Corte",
  },
  "naturalidade.fator4.texto": {
    pagina: "naturalidade",
    rotulo: "Fator 4 — texto",
    tipo: "paragrafo",
    padrao:
      "Um corte malfeito chama atenção mesmo numa base excelente. É trabalho manual do profissional, feito peça por peça.",
  },

  "naturalidade.fator5.titulo": {
    pagina: "naturalidade",
    rotulo: "Fator 5 — título",
    tipo: "texto",
    padrao: "Coloração",
  },
  "naturalidade.fator5.texto": {
    pagina: "naturalidade",
    rotulo: "Fator 5 — texto",
    tipo: "paragrafo",
    padrao:
      "Ajustar o tom do fio à raiz e ao restante do cabelo (quando há) é o que evita um contraste perceptível na linha de transição.",
  },

  "naturalidade.fator6.titulo": {
    pagina: "naturalidade",
    rotulo: "Fator 6 — título",
    tipo: "texto",
    padrao: "Técnica de aplicação",
  },
  "naturalidade.fator6.texto": {
    pagina: "naturalidade",
    rotulo: "Fator 6 — texto",
    tipo: "paragrafo",
    padrao:
      "O mesmo material aplicado por técnicas diferentes produz resultados diferentes. É a parte que depende inteiramente do profissional, não do produto.",
  },

  "naturalidade.aviso": {
    pagina: "naturalidade",
    rotulo: "Aviso sobre não usar foto de antes e depois",
    tipo: "paragrafo",
    padrao:
      "Não usamos foto de antes e depois. O resultado depende da escolha da peça, da implantação e do corte — a foto de outra pessoa prometeria um efeito que não está sob nosso controle. Preferimos mostrar o processo real e explicar o que pesa de verdade.",
  },
} as const satisfies Record<string, TextoRegistrado>;
