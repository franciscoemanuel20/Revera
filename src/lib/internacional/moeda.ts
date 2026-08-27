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
  CAD: { codigo: "CAD", simbolo: "C$", nome: "Dólar canadense", expoente: 2, locale: "en-CA" },
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

export function formatarDinheiro(valor: Dinheiro): string {
  const info = MOEDAS[valor.moeda];
  return new Intl.NumberFormat(info.locale, {
    style: "currency",
    currency: valor.moeda,
    minimumFractionDigits: info.expoente,
    maximumFractionDigits: info.expoente,
  }).format(valor.minor / fatorDaMoeda(valor.moeda));
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
