import type { ShippingPackageInfo, ShippingQuote } from "./provider";

/**
 * As regras de frete que decidem dinheiro — separadas de propósito.
 *
 * Este arquivo NÃO importa "server-only" e não fala com rede nem com banco:
 * é aritmética pura. A separação existe para que estas regras possam ser
 * testadas isoladamente (scripts/test-regras-frete.mjs), sem subir servidor,
 * sem token e sem gastar chamada de API.
 *
 * A que mais importa é `melhorOpcao`: é ela que escolhe quanto o cliente
 * paga e qual transportadora leva uma peça de R$ 1.600.
 */

/**
 * A caixa unitária. PROVISÓRIA até a embalagem real ser medida, e erra para
 * CIMA de propósito.
 *
 * A assimetria é o ponto: cotar com uma caixa MAIOR que a real faz o cliente
 * pagar alguns centavos a mais; cotar com uma MENOR faz a operação pagar a
 * diferença em TODO pedido, calada, até alguém conferir a fatura da
 * transportadora. Entre os dois erros, só um sangra.
 *
 * As medidas não são chute. Em 19/08/2026 as duas pontas foram cotadas no
 * painel da SuperFrete (São José dos Campos → Manaus, 300 g) e o tamanho quase
 * não mexe no preço nesta faixa: caixa mínima (16×11×2) contra caixa realista
 * (30×20×5) deu o MESMO valor em PAC e SEDEX; só a Loggi subiu R$ 4,53. Ou
 * seja, o peso cubado não domina aqui — quem decide é a faixa de peso.
 *
 * Por isso 30×20×5: é o tamanho plausível de uma peça embalada, e errar nele
 * custa centavos. O peso de 300 g foi informado pela operação.
 */
export const CAIXA_UNITARIA: ShippingPackageInfo = {
  weightGrams: 300,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 5,
};

/**
 * A caixa para uma quantidade qualquer de peças.
 *
 * Peças empilham: a base (30×20) não muda, a altura e o peso somam. É como a
 * operação embala de verdade, e mantém o erro para o lado seguro — uma caixa
 * alta demais custa centavos, uma rasa demais deixa a operação pagando a
 * diferença em todo pedido com mais de uma peça.
 */
export function caixaPara(
  quantidade: number,
  unidade: ShippingPackageInfo = CAIXA_UNITARIA
): ShippingPackageInfo {
  const q = Math.max(1, Math.floor(quantidade));
  return {
    weightGrams: unidade.weightGrams * q,
    lengthCm: unidade.lengthCm,
    widthCm: unidade.widthCm,
    heightCm: unidade.heightCm * q,
  };
}

/**
 * Escolhe a opção que será cobrada do cliente.
 *
 * Regra: entre as que cobrem o seguro INTEGRAL e não vieram com erro, a mais
 * barata. O cliente não escolhe transportadora — ele já preencheu um
 * formulário inteiro, e pedir mais uma decisão técnica ali derruba conversão
 * sem melhorar nada para ele.
 *
 * O filtro `coversInsurance` custa dinheiro DE PROPÓSITO. Na cotação real de
 * 19/08 ele significou escolher a Loggi a R$ 22,80 em vez da Jadlog a
 * R$ 19,43: os R$ 3,37 de diferença são o preço de cobrir os R$ 1.600
 * inteiros. Economizar ali deixaria R$ 100 da peça descobertos em todo envio,
 * e no dia em que uma se extraviasse a conta viria para a operação.
 *
 * Devolve null quando nenhuma serve — que é diferente de "deu erro". Quem
 * chama decide o que fazer com isso.
 */
export function melhorOpcao(opcoes: ShippingQuote[]): ShippingQuote | null {
  const validas = opcoes.filter(
    (o) => !o.error && o.priceCents > 0 && o.coversInsurance
  );
  return validas.sort((a, b) => a.priceCents - b.priceCents)[0] ?? null;
}

/**
 * Qual serviço comprar na hora de despachar. A ESCOLHA NÃO É LIVRE.
 *
 * Regra trazida do site irmão, onde nasceu de um erro já cometido
 * (painel/postagem/route.ts, 19/08/2026): a rota recotava e comprava a melhor
 * opção do momento. Parecia certo — "preço de ontem não vale para postar
 * hoje" — e estava errado, porque o cliente JÁ FOI COBRADO por um frete
 * específico no checkout. Comprar outro faz a diferença sair do bolso da
 * operação sem aparecer em lugar nenhum, só na fatura do fim do mês.
 *
 * Então: procura o MESMO serviço que o cliente pagou, e confirma que ele
 * continua servindo hoje — uma transportadora pode ter saído da praça, ou vir
 * com erro para aquele CEP. Só quando não dá (pedido sem serviço gravado, ou
 * serviço que sumiu) cai na melhor opção do momento.
 *
 * Repare que o serviço pago é aceito mesmo sem `coversInsurance`: se ele foi
 * cobrado assim, mudar agora sem ninguém saber seria trocar uma decisão já
 * tomada. Quem decide sobre diferença é a camada de cima, que compara os
 * preços e para quando passa de R$ 5.
 */
export function escolherServico(
  servicoPago: number | null,
  opcoes: ShippingQuote[]
): ShippingQuote | null {
  if (servicoPago) {
    const mesmo = opcoes.find(
      (o) => o.serviceId === servicoPago && !o.error && o.priceCents > 0
    );
    if (mesmo) return mesmo;
  }
  return melhorOpcao(opcoes);
}

/**
 * O teto de seguro mais alto entre os serviços cotados por padrão
 * (PAC, SEDEX e Loggi: R$ 3.000 cada). Fica aqui, e não em
 * superfrete-provider.ts, porque é aritmética de regra — quem divide o
 * pedido em remessas precisa dele sem falar com a rede.
 */
export const TETO_SEGURO_MAIS_ALTO_CENTS = 300_000;

export interface Remessa {
  /** Quantas peças vão nesta caixa. */
  quantidade: number;
  /** Quanto vale o conteúdo desta caixa — é o que o seguro precisa cobrir. */
  valorDeclaradoCents: number;
}

/**
 * Divide um pedido em remessas cujo valor declarado caiba no seguro.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE (29/08/2026) — o frete sumia no pedido grande
 * ===========================================================================
 * Medido em produção: 1 peça (R$ 650) cotava Loggi a R$ 19,03; 4 peças
 * (R$ 2.600) cotavam Loggi a R$ 45,43; 5 peças (R$ 3.100) não cotavam NADA —
 * "Nenhuma transportadora atende este CEP com a cobertura necessária".
 *
 * A causa não era o CEP nem o peso: era `melhorOpcao` descartando, com
 * razão, toda transportadora cujo teto de seguro (R$ 3.000) não cobria o
 * valor declarado. E a própria loja empurra o cliente para lá, anunciando
 * desconto "a partir de 5 peças".
 *
 * A saída certa NÃO é baixar o seguro — é fazer o que a operação faria no
 * balcão: mandar em duas caixas. Cada caixa declara o seu próprio conteúdo,
 * cada uma cabe no teto, e o cliente paga a soma dos fretes.
 *
 * Aritmética pura de propósito, para ser testável sem rede (mesmo motivo do
 * resto deste arquivo).
 *
 * Regras:
 *   - o valor é repartido PROPORCIONALMENTE às peças, e o resto de divisão
 *     vai para a primeira caixa (nunca some centavo: a soma das remessas é
 *     exatamente o valor declarado total);
 *   - se uma única peça já valer mais que o teto, não há divisão que
 *     resolva — devolve uma remessa só e quem chama trata a falta de
 *     cobertura explicitamente. Melhor recusar do que enviar descoberto.
 */
export function dividirEmRemessas(
  quantidade: number,
  valorDeclaradoTotalCents: number,
  tetoCents: number = TETO_SEGURO_MAIS_ALTO_CENTS
): Remessa[] {
  const q = Math.max(1, Math.floor(quantidade));
  const total = Math.max(0, Math.round(valorDeclaradoTotalCents));

  if (total <= tetoCents) {
    return [{ quantidade: q, valorDeclaradoCents: total }];
  }

  const valorPorPeca = total / q;

  // Peça sozinha já estoura o teto: dividir não adianta.
  if (valorPorPeca > tetoCents) {
    return [{ quantidade: q, valorDeclaradoCents: total }];
  }

  const pecasPorCaixa = Math.max(1, Math.floor(tetoCents / valorPorPeca));
  const caixas = Math.ceil(q / pecasPorCaixa);

  const remessas: Remessa[] = [];
  let pecasRestantes = q;
  let centavosRestantes = total;

  for (let i = 0; i < caixas; i++) {
    const ultima = i === caixas - 1;
    const pecas = ultima ? pecasRestantes : Math.min(pecasPorCaixa, pecasRestantes);
    // A última leva o que sobrou de centavo, para a soma fechar exatamente.
    const valor = ultima ? centavosRestantes : Math.round(valorPorPeca * pecas);
    remessas.push({ quantidade: pecas, valorDeclaradoCents: valor });
    pecasRestantes -= pecas;
    centavosRestantes -= valor;
  }

  return remessas;
}

/**
 * Combina as cotações de várias remessas num frete só.
 *
 * O cliente recebe UM valor de frete e a operação despacha N caixas pela
 * MESMA transportadora — misturar serviço entre caixas do mesmo pedido é
 * pedir para uma chegar semanas depois da outra.
 *
 * Por isso a escolha é feita por serviço presente em TODAS as remessas, que
 * cubra o seguro em TODAS elas e não tenha erro em nenhuma. Entre os que
 * sobram, o de menor soma. O prazo é o MAIOR entre as caixas: o pedido só
 * está completo quando a última chega.
 *
 * Devolve null quando nenhum serviço serve para o conjunto — que é
 * diferente de "deu erro", igual a melhorOpcao.
 */
export function melhorCombinacao(
  cotacoesPorRemessa: ShippingQuote[][]
): ShippingQuote | null {
  if (cotacoesPorRemessa.length === 0) return null;
  if (cotacoesPorRemessa.some((lista) => lista.length === 0)) return null;

  const primeira = cotacoesPorRemessa[0]!;
  const candidatos: ShippingQuote[] = [];

  for (const base of primeira) {
    if (base.error || base.priceCents <= 0 || !base.coversInsurance) continue;

    const equivalentes: ShippingQuote[] = [base];
    let serveEmTodas = true;

    for (let i = 1; i < cotacoesPorRemessa.length; i++) {
      const mesma = cotacoesPorRemessa[i]!.find(
        (o) => o.serviceId === base.serviceId && !o.error && o.priceCents > 0 && o.coversInsurance
      );
      if (!mesma) {
        serveEmTodas = false;
        break;
      }
      equivalentes.push(mesma);
    }

    if (!serveEmTodas) continue;

    candidatos.push({
      serviceId: base.serviceId,
      serviceName: base.serviceName,
      carrier: base.carrier,
      priceCents: equivalentes.reduce((soma, o) => soma + o.priceCents, 0),
      etaDays: equivalentes.reduce((maior, o) => Math.max(maior, o.etaDays), 0),
      coversInsurance: true,
    });
  }

  return candidatos.sort((a, b) => a.priceCents - b.priceCents)[0] ?? null;
}
