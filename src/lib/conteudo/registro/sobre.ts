import type { TextoRegistrado } from "../registro";

/**
 * /sobre-as-proteses — mesmo cuidado do comentário original da página:
 * texto genérico sobre a categoria, ou fato específico da Reverá já
 * confirmado em outro lugar. O parágrafo de "Cabelos grisalhos" é, letra
 * por letra, o mesmo texto de `cuidados.bloco3.texto` — mas ganha chave
 * própria aqui, porque cada chave é "um lugar na página" (ver o cabeçalho
 * de registro.ts); se as duas apontassem para a mesma chave, editar uma
 * mudaria a outra sem o Francisco esperar isso.
 *
 * O alt-text das três fotos de textura (grid "3.jpg"/"5.jpg"/"7.jpg") e os
 * `href` dos links internos ficam de fora do registro: não são copy de
 * marketing, são metadado de acessibilidade e destino de navegação — e
 * editar um `href` por engano quebraria o link sem nenhum aviso.
 */
export const SOBRE = {
  "sobre.eyebrow": {
    pagina: "sobre",
    rotulo: "Etiqueta acima do título",
    tipo: "texto",
    padrao: "Para quem nunca usou",
  },
  "sobre.titulo": {
    pagina: "sobre",
    rotulo: "Título da página",
    tipo: "texto",
    padrao: "O que é uma prótese capilar",
  },
  "sobre.intro": {
    pagina: "sobre",
    rotulo: "Frase de introdução",
    tipo: "paragrafo",
    padrao:
      "Um guia simples, sem termo técnico sem explicação, para entender do que a peça é feita e o que muda de uma base para outra.",
  },

  "sobre.oQueE.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"O que é\" — título",
    tipo: "texto",
    padrao: "O que é",
  },
  "sobre.oQueE.texto": {
    pagina: "sobre",
    rotulo: "Seção \"O que é\" — texto",
    tipo: "paragrafo",
    padrao:
      "A prótese capilar é uma peça feita com fios aplicados a uma base que se fixa no couro cabeludo. A função da base é servir de suporte para os fios exatamente onde não há mais cabelo — por isso a aparência da base (mais discreta ou mais grossa, mais transparente ou mais opaca) importa tanto quanto os fios em si.",
  },

  "sobre.oQueEABase.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"O que é a base\" — título",
    tipo: "texto",
    padrao: "O que é a base",
  },
  "sobre.oQueEABase.texto": {
    pagina: "sobre",
    rotulo: "Seção \"O que é a base\" — texto",
    tipo: "paragrafo",
    padrao:
      "A base é a membrana onde cada fio é fixado, um a um. É ela que fica em contato com o couro cabeludo e que dá o formato da peça. A espessura dessa membrana — medida em milímetros — é o principal número técnico que aparece quando se fala de prótese capilar.",
  },

  "sobre.basesFinas.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"Bases finas e grossas\" — título",
    tipo: "texto",
    padrao: "Bases mais finas e bases mais grossas",
  },
  "sobre.basesFinas.texto": {
    pagina: "sobre",
    rotulo: "Seção \"Bases finas e grossas\" — texto",
    tipo: "paragrafo",
    padrao:
      "De um jeito geral, quanto mais fina a base, mais discreta ela tende a ficar sobre a pele — é o que costuma se buscar na linha frontal, perto do rosto. Quanto mais grossa, mais resistente ao manuseio do dia a dia ela tende a ser. Essa troca (discrição de um lado, resistência do outro) é a lógica geral por trás da variedade de espessuras que existe no mercado de próteses capilares — não uma promessa sobre qualquer peça específica.",
  },

  "sobre.medida008.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"O que significa 0,08mm\" — título",
    tipo: "texto",
    padrao: "O que significa 0,08mm",
  },
  "sobre.medida008.texto": {
    pagina: "sobre",
    rotulo: "Seção \"O que significa 0,08mm\" — texto",
    tipo: "paragrafo",
    padrao:
      "É a medida da espessura da base, em milímetros. Quanto menor o número, mais fina a membrana. A linha que a Reverá trabalha hoje é a Micropele 0,08mm — a base mais fina da linha, com acabamento natural na linha frontal.",
  },

  "sobre.grisalhos.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"Cabelos grisalhos\" — título",
    tipo: "texto",
    padrao: "Cabelos grisalhos",
  },
  "sobre.grisalhos.texto": {
    pagina: "sobre",
    rotulo: "Seção \"Cabelos grisalhos\" — texto",
    tipo: "paragrafo",
    padrao:
      "Próteses grisalhas de até 50% possuem fios sintéticos, para permitir o processo de tonalização sem alterar os fios brancos.",
  },

  "sobre.comoEscolher.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"Como escolher\" — título",
    tipo: "texto",
    padrao: "Como escolher",
  },
  "sobre.comoEscolher.texto1": {
    pagina: "sobre",
    rotulo: "Seção \"Como escolher\" — texto (antes do 1º link)",
    tipo: "paragrafo",
    padrao:
      "Duas decisões pesam mais: a cor do fio e a orientação de um profissional que vai preparar, cortar e aplicar a peça. A Reverá ajuda na primeira — veja as",
  },
  "sobre.comoEscolher.link1": {
    pagina: "sobre",
    rotulo: "Seção \"Como escolher\" — texto do link para /cores",
    tipo: "texto",
    padrao: "cores disponíveis",
  },
  "sobre.comoEscolher.texto2": {
    pagina: "sobre",
    rotulo: "Seção \"Como escolher\" — texto (entre os dois links)",
    tipo: "paragrafo",
    padrao:
      "e a ferramenta para descobrir a sua. A segunda depende do profissional escolhido — veja",
  },
  "sobre.comoEscolher.link2": {
    pagina: "sobre",
    rotulo: "Seção \"Como escolher\" — texto do link para /naturalidade",
    tipo: "texto",
    padrao: "o que influencia o resultado",
  },
} as const satisfies Record<string, TextoRegistrado>;
