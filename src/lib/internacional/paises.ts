/**
 * Países de entrega e o que cada um exige de um endereço.
 *
 * ===========================================================================
 * POR QUE UMA TABELA, E NÃO CONDICIONAIS ESPALHADAS (27/08/2026)
 * ===========================================================================
 * A regra "americano não precisa de UF brasileira" pode virar duas coisas:
 * um `if` numa tela, ou uma linha nesta tabela. O `if` funciona até a
 * segunda tela existir, e a partir daí cada lugar precisa lembrar da regra
 * sozinho — inclusive o admin, o e-mail, a etiqueta e a invoice.
 *
 * Aqui a regra é dado. Quem precisa validar um endereço pergunta ao país
 * quais campos ele exige; quem precisa desenhar um formulário pergunta a
 * mesma coisa. Uma fonte, muitos leitores.
 *
 * ===========================================================================
 * O QUE ESTA LISTA NÃO É
 * ===========================================================================
 * Não é a lista de países para onde a Reverá vende. É a lista de países que
 * o sistema sabe REPRESENTAR. Vender depende de haver como cobrar, e hoje
 * não há: o gateway atual não processa venda internacional.
 */

export type CodigoPais = string; // ISO 3166-1 alfa-2, maiúsculo

export interface RegraDePais {
  iso: CodigoPais;
  nomePt: string;
  nomeEn: string;
  /** Moeda em que costumamos apresentar preço neste mercado. */
  moedaPadrao: string;
  /** Prefixo telefônico internacional, sem o "+". */
  ddi: string;
  /**
   * Estado/província é obrigatório? Nos EUA e no Canadá o endereço não
   * existe sem ele. Em Portugal e no Reino Unido, o código postal já
   * identifica a região, e exigir "estado" faria a pessoa inventar um.
   */
  exigeRegiao: boolean;
  /** Rótulo local para o campo de região — "State", "Province", "UF". */
  rotuloRegiao: string | null;
  /** Rótulo local do código postal — "ZIP Code", "Postcode", "CEP". */
  rotuloPostal: string;
  /**
   * Formato do código postal. Alfanumérico é a regra, não a exceção: só o
   * Brasil e alguns outros usam apenas dígitos. Um validador de CEP
   * aplicado a "SW1A 1AA" recusa um endereço perfeitamente válido.
   */
  postalRegex: RegExp;
  /** Exemplo real, mostrado no formulário como placeholder. */
  postalExemplo: string;
}

/**
 * Os seis primeiros mercados. A ordem é a do pedido do Francisco (Brasil,
 * EUA, Portugal, Reino Unido, Austrália, Canadá), que é também a ordem de
 * interesse comercial.
 *
 * As expressões de código postal seguem o formato publicado por cada
 * serviço postal. A do Reino Unido é a mais complexa porque o formato
 * britânico realmente é assim — de "M1 1AA" a "EC1A 1BB".
 */
export const PAISES: Record<CodigoPais, RegraDePais> = {
  BR: {
    iso: "BR",
    nomePt: "Brasil",
    nomeEn: "Brazil",
    moedaPadrao: "BRL",
    ddi: "55",
    exigeRegiao: true,
    rotuloRegiao: "UF",
    rotuloPostal: "CEP",
    postalRegex: /^\d{5}-?\d{3}$/,
    postalExemplo: "12245-000",
  },
  US: {
    iso: "US",
    nomePt: "Estados Unidos",
    nomeEn: "United States",
    moedaPadrao: "USD",
    ddi: "1",
    exigeRegiao: true,
    rotuloRegiao: "State",
    rotuloPostal: "ZIP Code",
    postalRegex: /^\d{5}(-\d{4})?$/,
    postalExemplo: "90210",
  },
  PT: {
    iso: "PT",
    nomePt: "Portugal",
    nomeEn: "Portugal",
    moedaPadrao: "EUR",
    ddi: "351",
    // Portugal tem distritos, mas o endereço postal não os usa: o código
    // postal de sete dígitos já resolve a entrega.
    exigeRegiao: false,
    rotuloRegiao: null,
    rotuloPostal: "Código Postal",
    postalRegex: /^\d{4}-\d{3}$/,
    postalExemplo: "1000-001",
  },
  GB: {
    iso: "GB",
    nomePt: "Reino Unido",
    nomeEn: "United Kingdom",
    moedaPadrao: "GBP",
    ddi: "44",
    exigeRegiao: false,
    rotuloRegiao: "County",
    rotuloPostal: "Postcode",
    postalRegex: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
    postalExemplo: "SW1A 1AA",
  },
  AU: {
    iso: "AU",
    nomePt: "Austrália",
    nomeEn: "Australia",
    moedaPadrao: "AUD",
    ddi: "61",
    exigeRegiao: true,
    rotuloRegiao: "State",
    rotuloPostal: "Postcode",
    postalRegex: /^\d{4}$/,
    postalExemplo: "2000",
  },
  CA: {
    iso: "CA",
    nomePt: "Canadá",
    nomeEn: "Canada",
    moedaPadrao: "CAD",
    ddi: "1",
    exigeRegiao: true,
    rotuloRegiao: "Province",
    rotuloPostal: "Postal Code",
    postalRegex: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
    postalExemplo: "K1A 0B1",
  },
};

export const PAISES_SUPORTADOS: CodigoPais[] = Object.keys(PAISES);

export function ehPaisSuportado(iso: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAISES, iso.toUpperCase());
}

export function regraDoPais(iso: string): RegraDePais | null {
  return PAISES[iso.toUpperCase()] ?? null;
}

export function nomeDoPais(iso: string): string {
  return regraDoPais(iso)?.nomePt ?? iso.toUpperCase();
}

/** Bandeira por composição de Regional Indicator — sem imagem, sem CDN. */
export function bandeira(iso: string): string {
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

export function ehInternacional(iso: string): boolean {
  return iso.toUpperCase() !== "BR";
}

/* =========================================================================
 * O QUE O CHECKOUT OFERECE HOJE
 * =======================================================================*/

/**
 * Países que a loja aceita no checkout AGORA.
 *
 * Separado de PAISES de propósito. Aquela lista é "o que o sistema sabe
 * representar"; esta é "para onde dá para vender de verdade". Hoje as duas
 * são diferentes, e essa diferença é a coisa mais honesta deste arquivo:
 * a Reverá não tem como cobrar um cliente estrangeiro — o gateway atual não
 * processa venda fora do Brasil.
 *
 * Oferecer os seis países no seletor faria a pessoa preencher o endereço
 * inteiro para descobrir no fim que não consegue pagar. Pior que não
 * oferecer.
 *
 * Quando existir gateway internacional, o país entra aqui pela variável de
 * ambiente — sem tocar em código:
 *
 *     CHECKOUT_PAISES=BR,US,PT
 *
 * A ausência da variável mantém o comportamento de hoje: só Brasil.
 */
export function paisesDoCheckout(): CodigoPais[] {
  const bruto = (process.env.CHECKOUT_PAISES ?? "BR").trim();
  const pedidos = bruto
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => ehPaisSuportado(p));
  // Brasil nunca sai da lista, mesmo com a variável mal preenchida: uma
  // configuração errada não pode derrubar a venda nacional, que é a que
  // paga as contas hoje.
  return pedidos.includes("BR") ? pedidos : ["BR", ...pedidos];
}

export function checkoutInternacionalAberto(): boolean {
  return paisesDoCheckout().some((p) => p !== "BR");
}
