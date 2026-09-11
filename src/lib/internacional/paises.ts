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

import { textos, type Dicionario, type Idioma } from "./idioma";

export type CodigoPais = string; // ISO 3166-1 alfa-2, maiúsculo

export interface RegraDePais {
  iso: CodigoPais;
  nomePt: string;
  nomeEn: string;
  nomeEs: string;
  /** Moeda em que costumamos apresentar preço neste mercado. */
  moedaPadrao: string;
  /**
   * Em que língua o comprador deste país lê o checkout.
   *
   * Mora aqui, e não numa regra "é BR? então português", porque Portugal
   * desmente a regra: é internacional em tudo (euro, DHL, alfândega) e lê
   * em português. País é dado; idioma é atributo do país.
   */
  idioma: Idioma;
  /**
   * Locale BCP-47 para formatar NÚMERO e DATA na tela do comprador.
   *
   * Separado de `idioma` porque não é a mesma pergunta: en-US e en-GB
   * compartilham o texto e discordam da data (03/04 é abril nos EUA e
   * março no Reino Unido). E é o que faz um total sair "1,250.00" para
   * quem lê em inglês, em vez do "1.250,00" que só o Brasil entende.
   */
  locale: string;
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
  /** Alguns destinos (como os Emirados Árabes) não usam código postal. */
  exigeCodigoPostal?: boolean;
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
 * Os mercados que o sistema sabe representar. Esta lista é estrutura de
 * endereço, idioma e moeda; ela não abre uma venda por si só. Um país só
 * aparece no checkout após preço e frete próprios serem publicados.
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
    nomeEs: "Brasil",
    moedaPadrao: "BRL",
    idioma: "pt",
    locale: "pt-BR",
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
    nomeEs: "Estados Unidos",
    moedaPadrao: "USD",
    idioma: "en",
    locale: "en-US",
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
    nomeEs: "Portugal",
    moedaPadrao: "EUR",
    idioma: "pt",
    locale: "pt-PT",
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
    nomeEs: "Reino Unido",
    moedaPadrao: "GBP",
    idioma: "en",
    locale: "en-GB",
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
    nomeEs: "Australia",
    moedaPadrao: "AUD",
    idioma: "en",
    locale: "en-AU",
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
    nomeEs: "Canadá",
    moedaPadrao: "CAD",
    idioma: "en",
    locale: "en-CA",
    ddi: "1",
    exigeRegiao: true,
    rotuloRegiao: "Province",
    rotuloPostal: "Postal Code",
    postalRegex: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
    postalExemplo: "K1A 0B1",
  },
  ES: {
    iso: "ES",
    nomePt: "Espanha",
    nomeEn: "Spain",
    nomeEs: "España",
    moedaPadrao: "EUR",
    idioma: "es",
    locale: "es-ES",
    ddi: "34",
    // Espanha tem províncias, e o endereço postal as menciona — mas os dois
    // primeiros dígitos do código postal JÁ identificam a província, então
    // exigir o campo faria a pessoa repetir o que ela acabou de digitar.
    // Mesma decisão de Portugal e do Reino Unido: rótulo existe, obrigação
    // não.
    exigeRegiao: false,
    rotuloRegiao: "Provincia",
    rotuloPostal: "Código Postal",
    // Cinco dígitos, de 01000 a 52999. A faixa não é validada aqui de
    // propósito: recusar um CP válido custa uma venda, e a DHL confere.
    postalRegex: /^\d{5}$/,
    postalExemplo: "28013",
  },
  MX: { iso: "MX", nomePt: "México", nomeEn: "Mexico", nomeEs: "México", moedaPadrao: "USD", idioma: "es", locale: "es-MX", ddi: "52", exigeRegiao: true, rotuloRegiao: "Estado", rotuloPostal: "Código Postal", postalRegex: /^\d{5}$/, postalExemplo: "06000" },
  CL: { iso: "CL", nomePt: "Chile", nomeEn: "Chile", nomeEs: "Chile", moedaPadrao: "USD", idioma: "es", locale: "es-CL", ddi: "56", exigeRegiao: false, rotuloRegiao: "Región", rotuloPostal: "Código Postal", postalRegex: /^\d{7}$/, postalExemplo: "8320000" },
  AR: { iso: "AR", nomePt: "Argentina", nomeEn: "Argentina", nomeEs: "Argentina", moedaPadrao: "USD", idioma: "es", locale: "es-AR", ddi: "54", exigeRegiao: false, rotuloRegiao: "Provincia", rotuloPostal: "Código Postal", postalRegex: /^(?:[A-Z]\d{4}[A-Z]{0,3}|\d{4})$/i, postalExemplo: "C1000" },
  CO: { iso: "CO", nomePt: "Colômbia", nomeEn: "Colombia", nomeEs: "Colombia", moedaPadrao: "USD", idioma: "es", locale: "es-CO", ddi: "57", exigeRegiao: false, rotuloRegiao: "Departamento", rotuloPostal: "Código Postal", postalRegex: /^\d{6}$/, postalExemplo: "110111" },
  VE: { iso: "VE", nomePt: "Venezuela", nomeEn: "Venezuela", nomeEs: "Venezuela", moedaPadrao: "USD", idioma: "es", locale: "es-VE", ddi: "58", exigeRegiao: false, rotuloRegiao: "Estado", rotuloPostal: "Código Postal", postalRegex: /^\d{4}$/, postalExemplo: "1010" },
  EC: { iso: "EC", nomePt: "Equador", nomeEn: "Ecuador", nomeEs: "Ecuador", moedaPadrao: "USD", idioma: "es", locale: "es-EC", ddi: "593", exigeRegiao: false, rotuloRegiao: "Provincia", rotuloPostal: "Código Postal", postalRegex: /^\d{6}$/, postalExemplo: "170150" },
  GT: { iso: "GT", nomePt: "Guatemala", nomeEn: "Guatemala", nomeEs: "Guatemala", moedaPadrao: "USD", idioma: "es", locale: "es-GT", ddi: "502", exigeRegiao: false, rotuloRegiao: "Departamento", rotuloPostal: "Código Postal", postalRegex: /^\d{5}$/, postalExemplo: "01001" },
  PA: { iso: "PA", nomePt: "Panamá", nomeEn: "Panama", nomeEs: "Panamá", moedaPadrao: "USD", idioma: "es", locale: "es-PA", ddi: "507", exigeRegiao: false, rotuloRegiao: "Provincia", rotuloPostal: "Código Postal", postalRegex: /^\d{4}$/, postalExemplo: "0801" },
  CR: { iso: "CR", nomePt: "Costa Rica", nomeEn: "Costa Rica", nomeEs: "Costa Rica", moedaPadrao: "USD", idioma: "es", locale: "es-CR", ddi: "506", exigeRegiao: false, rotuloRegiao: "Provincia", rotuloPostal: "Código Postal", postalRegex: /^\d{5}$/, postalExemplo: "10101" },
  DO: { iso: "DO", nomePt: "República Dominicana", nomeEn: "Dominican Republic", nomeEs: "República Dominicana", moedaPadrao: "USD", idioma: "es", locale: "es-DO", ddi: "1", exigeRegiao: false, rotuloRegiao: "Provincia", rotuloPostal: "Código Postal", postalRegex: /^\d{5}$/, postalExemplo: "10101" },
  DE: { iso: "DE", nomePt: "Alemanha", nomeEn: "Germany", nomeEs: "Alemania", moedaPadrao: "EUR", idioma: "en", locale: "de-DE", ddi: "49", exigeRegiao: false, rotuloRegiao: "State", rotuloPostal: "Postcode", postalRegex: /^\d{5}$/, postalExemplo: "10115" },
  NL: { iso: "NL", nomePt: "Holanda", nomeEn: "Netherlands", nomeEs: "Países Bajos", moedaPadrao: "EUR", idioma: "en", locale: "nl-NL", ddi: "31", exigeRegiao: false, rotuloRegiao: "Province", rotuloPostal: "Postcode", postalRegex: /^\d{4}\s?[A-Z]{2}$/i, postalExemplo: "1012 JS" },
  IE: { iso: "IE", nomePt: "Irlanda", nomeEn: "Ireland", nomeEs: "Irlanda", moedaPadrao: "EUR", idioma: "en", locale: "en-IE", ddi: "353", exigeRegiao: false, rotuloRegiao: "County", rotuloPostal: "Eircode", postalRegex: /^[A-Z]\d{2}\s?[A-Z0-9]{4}$/i, postalExemplo: "D02 X285" },
  IN: { iso: "IN", nomePt: "Índia", nomeEn: "India", nomeEs: "India", moedaPadrao: "USD", idioma: "en", locale: "en-IN", ddi: "91", exigeRegiao: true, rotuloRegiao: "State", rotuloPostal: "PIN Code", postalRegex: /^\d{6}$/, postalExemplo: "110001" },
  CN: { iso: "CN", nomePt: "China", nomeEn: "China", nomeEs: "China", moedaPadrao: "USD", idioma: "en", locale: "en-CN", ddi: "86", exigeRegiao: true, rotuloRegiao: "Province", rotuloPostal: "Postal Code", postalRegex: /^\d{6}$/, postalExemplo: "100000" },
  ID: { iso: "ID", nomePt: "Indonésia", nomeEn: "Indonesia", nomeEs: "Indonesia", moedaPadrao: "USD", idioma: "en", locale: "en-ID", ddi: "62", exigeRegiao: true, rotuloRegiao: "Province", rotuloPostal: "Postal Code", postalRegex: /^\d{5}$/, postalExemplo: "10110" },
  BD: { iso: "BD", nomePt: "Bangladesh", nomeEn: "Bangladesh", nomeEs: "Bangladés", moedaPadrao: "USD", idioma: "en", locale: "en-BD", ddi: "880", exigeRegiao: false, rotuloRegiao: "Division", rotuloPostal: "Postcode", postalRegex: /^\d{4}$/, postalExemplo: "1000" },
  ZA: { iso: "ZA", nomePt: "África do Sul", nomeEn: "South Africa", nomeEs: "Sudáfrica", moedaPadrao: "USD", idioma: "en", locale: "en-ZA", ddi: "27", exigeRegiao: false, rotuloRegiao: "Province", rotuloPostal: "Postal Code", postalRegex: /^\d{4}$/, postalExemplo: "2000" },
  AE: { iso: "AE", nomePt: "Emirados Árabes Unidos", nomeEn: "United Arab Emirates", nomeEs: "Emiratos Árabes Unidos", moedaPadrao: "USD", idioma: "en", locale: "en-AE", ddi: "971", exigeRegiao: false, rotuloRegiao: "Emirate", rotuloPostal: "Postal Code", exigeCodigoPostal: false, postalRegex: /^$/, postalExemplo: "Not required" },
  NZ: { iso: "NZ", nomePt: "Nova Zelândia", nomeEn: "New Zealand", nomeEs: "Nueva Zelanda", moedaPadrao: "USD", idioma: "en", locale: "en-NZ", ddi: "64", exigeRegiao: false, rotuloRegiao: "Region", rotuloPostal: "Postcode", postalRegex: /^\d{4}$/, postalExemplo: "6011" },
};

export const PAISES_SUPORTADOS: CodigoPais[] = Object.keys(PAISES);

export function ehPaisSuportado(iso: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAISES, iso.toUpperCase());
}

export function regraDoPais(iso: string): RegraDePais | null {
  return PAISES[iso.toUpperCase()] ?? null;
}

export function nomeDoPais(iso: string, idioma: Idioma = "pt"): string {
  const regra = regraDoPais(iso);
  if (!regra) return iso.toUpperCase();
  // Não é `idioma === "en" ? en : pt`. Com o espanhol dentro, esse ternário
  // devolveria "Espanha" a um espanhol lendo em espanhol — nome do país
  // errado na primeira linha do endereço dele.
  if (idioma === "en") return regra.nomeEn;
  if (idioma === "es") return regra.nomeEs;
  return regra.nomePt;
}

/**
 * O idioma de um país, com o português como porta padrão.
 *
 * País desconhecido cai em português de propósito: quem chega aqui com um
 * ISO que a tabela não conhece está num caminho que não deveria existir, e
 * a tela de erro é brasileira.
 */
export function idiomaDoPais(iso: string): Idioma {
  return regraDoPais(iso)?.idioma ?? "pt";
}

/** Locale de NÚMERO e DATA. Mesma lógica de porta padrão. */
export function localeDoPais(iso: string): string {
  return regraDoPais(iso)?.locale ?? "pt-BR";
}

/** Atalho: o dicionário já resolvido pelo país. */
export function textosDoPais(iso: string): Dicionario {
  return textos(idiomaDoPais(iso));
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
