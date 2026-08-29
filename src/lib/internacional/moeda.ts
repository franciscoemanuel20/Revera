/**
 * Dinheiro em mais de uma moeda.
 *
 * ===========================================================================
 * DOIS CONCEITOS QUE NÃO PODEM VIRAR UM (27/08/2026)
 * ===========================================================================
 * O Francisco marcou isto como importante, e é:
 *
 *   MOEDA COBRADA  — o que o cliente vê e paga. USD 320.00.
 *   VALOR FISCAL   — o que vai na NF-e. Sempre BRL, por exigência legal:
 *                    "independentemente da moeda utilizada na transação, a
 *                    emissão da NF-e deve ser com o valor do produto em
 *                    reais".
 *
 * Não são o mesmo número em roupas diferentes, e não dá para derivar um do
 * outro na hora de imprimir: a conversão depende de uma taxa com DATA, e
 * essa data é a da venda, não a de quem abriu o documento. Por isso a taxa
 * é gravada no pedido (`orders.exchange_rate`) e nunca recalculada.
 *
 * Um pedido reimpresso em dezembro precisa mostrar o mesmo real que mostrou
 * em agosto. Se a conversão acontecesse na renderização, não mostraria.
 *
 * ===========================================================================
 * INTEIROS, SEMPRE
 * ===========================================================================
 * Nenhum valor monetário é float em lugar nenhum deste arquivo. 0.1 + 0.2
 * não é 0.3 em ponto flutuante, e num carrinho isso vira um centavo de
 * diferença entre o que a tela mostra e o que o gateway cobra.
 */

export const MOEDAS_SUPORTADAS = ["BRL", "USD", "EUR", "GBP", "AUD", "CAD"] as const;
export type Moeda = (typeof MOEDAS_SUPORTADAS)[number];

export const MOEDA_FISCAL: Moeda = "BRL";

interface InfoMoeda {
  codigo: Moeda;
  simbolo: string;
  nome: string;
  /** Casas decimais. As seis têm 2 — mas o código não presume isso. */
  expoente: number;
  locale: string;
}

/**
 * `expoente` existe mesmo com as seis moedas usando 2 casas. O dia em que
 * entrar iene (0 casas) ou dinar (3), quem multiplicar por 100 fixo vai
 * errar por cem vezes — e o erro só aparece na fatura de alguém.
 */
export const MOEDAS: Record<Moeda, InfoMoeda> = {
  BRL: { codigo: "BRL", simbolo: "R$", nome: "Real", expoente: 2, locale: "pt-BR" },
  USD: { codigo: "USD", simbolo: "US$", nome: "Dólar americano", expoente: 2, locale: "en-US" },
  EUR: { codigo: "EUR", simbolo: "€", nome: "Euro", expoente: 2, locale: "pt-PT" },
  GBP: { codigo: "GBP", simbolo: "£", nome: "Libra", expoente: 2, locale: "en-GB" },
  AUD: { codigo: "AUD", simbolo: "A$", nome: "Dólar australiano", expoente: 2, locale: "en-AU" },
  CAD: { codigo: "CAD", simbolo: "CA$", nome: "Dólar canadense", expoente: 2, locale: "en-CA" },
};

export function ehMoedaSuportada(v: string): v is Moeda {
  return (MOEDAS_SUPORTADAS as readonly string[]).includes(v.toUpperCase());
}

/** Quantas unidades mínimas cabem em uma unidade. 100 para as seis atuais. */
export function fatorDaMoeda(moeda: Moeda): number {
  return 10 ** MOEDAS[moeda].expoente;
}

/**
 * Valor monetário: um inteiro em unidade mínima, com a moeda junto.
 *
 * Andar com o número solto é o que produz o bug clássico de somar centavos
 * de dólar com centavos de real e obter um total que não existe em moeda
 * nenhuma. Aqui a moeda viaja com o valor, e `somar` recusa a mistura.
 */
export interface Dinheiro {
  readonly minor: number;
  readonly moeda: Moeda;
}

export function dinheiro(minor: number, moeda: Moeda): Dinheiro {
  if (!Number.isInteger(minor)) {
    throw new Error(
      `Valor monetário precisa ser inteiro em unidade mínima — recebi ${minor}. ` +
        "Float em dinheiro acumula erro; converta antes de chegar aqui."
    );
  }
  return { minor, moeda };
}

export function somar(a: Dinheiro, b: Dinheiro): Dinheiro {
  if (a.moeda !== b.moeda) {
    throw new Error(
      `Não dá para somar ${a.moeda} com ${b.moeda}. Converta explicitamente, com taxa e data.`
    );
  }
  return { minor: a.minor + b.minor, moeda: a.moeda };
}

export function multiplicar(valor: Dinheiro, quantidade: number): Dinheiro {
  if (!Number.isInteger(quantidade)) {
    throw new Error("Quantidade precisa ser inteira.");
  }
  return { minor: valor.minor * quantidade, moeda: valor.moeda };
}

/**
 * O símbolo vem da NOSSA tabela, não do Intl.
 *
 * Deixando o Intl escolher, `en-US`, `en-CA` e `en-AU` devolvem todos "$"
 * — e numa lista com pedidos dos três países ninguém distingue US$ 320 de
 * A$ 320, que são valores bem diferentes. Foi o bug 5 encontrado no teste
 * vivo de 27/08/2026.
 *
 * Alguns locales resolveriam isso hoje (pt-BR devolve "US$", "CA$"), mas
 * isso depende dos dados de locale da versão do Node ou do navegador, e
 * mudança silenciosa de símbolo em tela de dinheiro é o tipo de regressão
 * que ninguém percebe. Com a tabela nossa, o símbolo é decisão, não sorte.
 *
 * A formatação do NÚMERO continua com Intl em pt-BR — quem opera a loja é
 * brasileiro e lê "1.234,56", não "1,234.56".
 */
export function formatarDinheiro(valor: Dinheiro): string {
  const info = MOEDAS[valor.moeda];
  const numero = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: info.expoente,
    maximumFractionDigits: info.expoente,
  }).format(valor.minor / fatorDaMoeda(valor.moeda));
  return `${info.simbolo} ${numero}`;
}

/**
 * A porta única para dinheiro na tela do admin.
 *
 * Recebe a moeda como texto solto — que é como ela chega do banco — e nunca
 * lança: uma tela de pedido não pode quebrar porque alguém gravou um código
 * de moeda estranho. Moeda desconhecida sai com o próprio código na frente
 * ("XYZ 320,00"), o que é feio de propósito: sinaliza o problema sem
 * esconder o número nem fingir que é real.
 *
 * Criada em 28/08/2026 para os bugs 2 e 3: o detalhe do pedido e o painel
 * formatavam TUDO com formatarBRL, e um pedido de US$ 320 aparecia como
 * "R$ 320,00".
 */
export function formatarValorNaMoeda(minor: number, moeda: string): string {
  const codigo = (moeda ?? "").toUpperCase();
  if (ehMoedaSuportada(codigo)) {
    return formatarDinheiro({ minor, moeda: codigo });
  }
  const numero = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return `${codigo || "???"} ${numero}`;
}

/**
 * O mesmo dinheiro, formatado para quem COMPRA — não para quem opera.
 *
 * `formatarDinheiro` acima agrupa em pt-BR de propósito: quem lê o admin é
 * brasileiro. Mas o comprador americano lê a MESMA tela de checkout, e para
 * ele "1.250,00" não é mil duzentos e cinquenta — é um e vinte e cinco com
 * um ponto estranho. Grupo e decimal trocados numa tela de pagamento é o
 * tipo de erro que faz a pessoa fechar a aba.
 *
 * O SÍMBOLO continua vindo da nossa tabela, e não do Intl. Aqui isso não é
 * teimosia: `en-US`, `en-AU` e `en-CA` devolvem todos "$" (foi o bug 5 de
 * 27/08/2026), e um australiano vendo "$1,250.00" numa loja brasileira não
 * tem como saber se está olhando dólar dele ou dos EUA. "A$ 1,250.00" tem.
 *
 * Só o número muda de locale. É a menor mudança que resolve o problema real.
 */
export function formatarDinheiroParaComprador(
  minor: number,
  moeda: string,
  locale: string
): string {
  const codigo = (moeda ?? "").toUpperCase();
  if (!ehMoedaSuportada(codigo)) {
    // Mesma degradação honesta de formatarValorNaMoeda: código na frente,
    // feio de propósito, sem fingir que é uma moeda que conhecemos.
    const bruto = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
    return `${codigo || "???"} ${bruto}`;
  }
  const info = MOEDAS[codigo];
  const numero = new Intl.NumberFormat(locale, {
    minimumFractionDigits: info.expoente,
    maximumFractionDigits: info.expoente,
  }).format(minor / fatorDaMoeda(codigo));
  return `${info.simbolo} ${numero}`;
}

/** Sem símbolo, para a Commercial Invoice, onde a moeda vai em coluna própria. */
export function formatarNumeroDinheiro(valor: Dinheiro): string {
  const info = MOEDAS[valor.moeda];
  return (valor.minor / fatorDaMoeda(valor.moeda)).toFixed(info.expoente);
}

/* =========================================================================
 * CÂMBIO
 * =======================================================================*/

export interface Cambio {
  /** Quantos BRL vale 1 unidade da moeda estrangeira. */
  taxa: number;
  /** De onde veio — "PTAX", "manual", o nome do provedor. */
  fonte: string;
  /** ISO 8601, só a data. */
  data: string;
}

/**
 * Converte para a moeda fiscal. Usada para preencher a NF-e a partir de uma
 * venda em moeda estrangeira.
 *
 * Arredonda para o inteiro mais próximo (half-up). Truncar favoreceria
 * sistematicamente um dos lados, e num documento fiscal um viés constante é
 * pior que um centavo aleatório.
 *
 * NÃO existe função inversa de propósito. Converter BRL para a moeda do
 * cliente seria "preço convertido pelo câmbio do dia" — exatamente o que o
 * Francisco recusou: o preço de cada mercado é decisão comercial, e mora em
 * `variant_prices`.
 */
export function paraMoedaFiscal(valor: Dinheiro, cambio: Cambio): Dinheiro {
  if (valor.moeda === MOEDA_FISCAL) return valor;
  if (!(cambio.taxa > 0)) {
    throw new Error("Taxa de câmbio precisa ser maior que zero.");
  }
  const fatorOrigem = fatorDaMoeda(valor.moeda);
  const fatorDestino = fatorDaMoeda(MOEDA_FISCAL);
  const emUnidades = valor.minor / fatorOrigem;
  return {
    minor: Math.round(emUnidades * cambio.taxa * fatorDestino),
    moeda: MOEDA_FISCAL,
  };
}

/* =========================================================================
 * PREÇO POR MERCADO
 * =======================================================================*/

export interface PrecoDeMercado {
  moeda: Moeda;
  precoMinor: number;
  compareAtMinor: number | null;
}

/**
 * O preço da variante naquela moeda — ou nada.
 *
 * Devolver `null` quando não há preço cadastrado é a decisão importante
 * deste arquivo. A alternativa tentadora seria cair no preço em real
 * convertido pelo câmbio, e isso publicaria um preço que ninguém decidiu,
 * mudando sozinho todo dia. Sem linha cadastrada, não vendemos naquela
 * moeda — e a tela diz isso.
 */
export function precoNaMoeda(
  precos: PrecoDeMercado[],
  moeda: Moeda
): Dinheiro | null {
  const achado = precos.find((p) => p.moeda === moeda);
  return achado ? dinheiro(achado.precoMinor, moeda) : null;
}

/* =========================================================================
 * TOTAIS POR MOEDA
 * =======================================================================*/

/**
 * Soma pedidos AGRUPANDO por moeda, em vez de somar tudo num número só.
 *
 * ===========================================================================
 * POR QUE NÃO EXISTE "FATURAMENTO TOTAL" (bug 3, 28/08/2026)
 * ===========================================================================
 * O painel somava `total_cents` de todos os pedidos e mostrava o resultado
 * em reais. Com um pedido de US$ 320 no período, ele exibia "R$ 320,00" —
 * um número que não existe: não é o faturamento em real, não é em dólar, e
 * ninguém consegue conferir contra extrato nenhum.
 *
 * A correção óbvia seria converter tudo para real. Só que converter exige
 * uma taxa, e taxa exige data e fonte — senão o faturamento de agosto muda
 * sozinho quando alguém abre a tela em outubro. Enquanto não houver decisão
 * sobre qual câmbio usar (é uma das perguntas ao contador), somar moedas
 * diferentes é errado de um jeito silencioso.
 *
 * Então o painel mostra o que ele realmente sabe: quanto entrou em cada
 * moeda. Uma linha por moeda, e nenhuma soma entre elas.
 */
export interface TotalPorMoeda {
  moeda: string;
  minor: number;
  pedidos: number;
}

export function totalizarPorMoeda(
  linhas: Array<{ total_cents: number; currency?: string | null }>
): TotalPorMoeda[] {
  const mapa = new Map<string, TotalPorMoeda>();
  for (const l of linhas) {
    const moeda = (l.currency ?? "BRL").toUpperCase();
    const atual = mapa.get(moeda) ?? { moeda, minor: 0, pedidos: 0 };
    atual.minor += l.total_cents;
    atual.pedidos += 1;
    mapa.set(moeda, atual);
  }
  // Real primeiro (é a maior parte da operação), o resto em ordem alfabética.
  return [...mapa.values()].sort((a, b) => {
    if (a.moeda === "BRL") return -1;
    if (b.moeda === "BRL") return 1;
    return a.moeda.localeCompare(b.moeda);
  });
}

/** "R$ 650,00 · US$ 320,00" — para caber num cartão de resumo. */
export function formatarTotais(totais: TotalPorMoeda[]): string {
  if (totais.length === 0) return formatarValorNaMoeda(0, "BRL");
  return totais.map((t) => formatarValorNaMoeda(t.minor, t.moeda)).join(" · ");
}
