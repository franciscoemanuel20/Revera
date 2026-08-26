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
