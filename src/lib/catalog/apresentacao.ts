export type TexturaCatalogo = "lisa" | "cacheada" | "crespa" | "afro";

export interface ApresentacaoProduto {
  titulo: string;
  resumo: string;
  textura: TexturaCatalogo;
  prioridade: "discricao" | "equilibrio" | "fixacao" | "textura";
}

/**
 * Linguagem de vitrine: o nome do cadastro continua íntegro para pedidos e
 * operação, mas a pessoa que está comprando compara peças por benefício e
 * textura, não por uma mistura de medida, modelo e espessura.
 */
const APRESENTACOES: Record<string, ApresentacaoProduto> = {
  "micropele-008": {
    titulo: "Micropele 0,08 mm",
    resumo: "Equilíbrio entre naturalidade, leveza e praticidade para o dia a dia.",
    textura: "lisa",
    prioridade: "equilibrio",
  },
  "micropele-006": {
    titulo: "Micropele 0,06 mm",
    resumo: "Base mais fina para quem busca uma frente ainda mais discreta.",
    textura: "lisa",
    prioridade: "discricao",
  },
  "cacho-aberto": {
    titulo: "Cacho aberto",
    resumo: "Para um cacheado mais solto, com movimento e definição natural.",
    textura: "cacheada",
    prioridade: "textura",
  },
  "cacho-fechado": {
    titulo: "Cacho fechado",
    resumo: "Para textura crespa com cachos mais marcados e cheios.",
    textura: "crespa",
    prioridade: "textura",
  },
  afro: {
    titulo: "Afro",
    resumo: "Para volume e textura afro definidos, preservando a identidade do cabelo.",
    textura: "afro",
    prioridade: "textura",
  },
  "full-lace": {
    titulo: "Full Lace",
    resumo: "Base em renda para leveza e acabamento natural em toda a peça.",
    textura: "lisa",
    prioridade: "discricao",
  },
  australia: {
    titulo: "Austrália",
    resumo: "Renda onde aparece e película onde a fixação precisa de mais segurança.",
    textura: "lisa",
    prioridade: "fixacao",
  },
};

export function apresentacaoDoProduto(slug: string, nomeOriginal: string): ApresentacaoProduto {
  return APRESENTACOES[slug] ?? {
    titulo: nomeOriginal,
    resumo: "Conheça os detalhes, cores e opções desta prótese.",
    textura: "lisa",
    prioridade: "equilibrio",
  };
}
