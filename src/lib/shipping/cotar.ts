import "server-only";

import { getShippingProvider } from "./index";
import { ShippingUnavailable } from "./provider";
import type { ShippingPackageInfo, ShippingQuote } from "./provider";
import { CAIXA_UNITARIA, caixaPara, melhorOpcao } from "./regras";
import { cepDeOrigem } from "./superfrete-provider";

export { melhorOpcao, caixaPara } from "./regras";

function numeroOuPadrao(v: string | undefined, padrao: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/**
 * A caixa unitária vinda do ambiente, caindo nos padrões de regras.ts quando
 * não configurada. Trocar a embalagem não exige deploy — basta definir as
 * variáveis.
 */
function unidadeConfigurada(): ShippingPackageInfo {
  return {
    weightGrams: numeroOuPadrao(
      process.env.SUPERFRETE_CAIXA_PESO_GRAMAS,
      CAIXA_UNITARIA.weightGrams
    ),
    lengthCm: numeroOuPadrao(
      process.env.SUPERFRETE_CAIXA_COMPRIMENTO_CM,
      CAIXA_UNITARIA.lengthCm
    ),
    widthCm: numeroOuPadrao(
      process.env.SUPERFRETE_CAIXA_LARGURA_CM,
      CAIXA_UNITARIA.widthCm
    ),
    heightCm: numeroOuPadrao(
      process.env.SUPERFRETE_CAIXA_ALTURA_CM,
      CAIXA_UNITARIA.heightCm
    ),
  };
}

export interface ResultadoCotacao {
  /** Todas as opções que voltaram, inclusive as com erro — para o painel. */
  opcoes: ShippingQuote[];
  /** A escolhida, ou null se nenhuma serve. */
  escolhida: ShippingQuote | null;
  /** A caixa usada na cotação — vai para o recibo, e depois para a etiqueta. */
  caixa: ShippingPackageInfo;
  /** Preenchido quando a plataforma não respondeu. */
  indisponivel: string | null;
}

/**
 * Cota o frete de um destino.
 *
 * NUNCA lança por indisponibilidade: devolve `indisponivel` preenchido. Quem
 * chama decide o que fazer — e no checkout essa decisão é deixar a venda
 * acontecer (ver src/app/checkout/actions.ts). Uma exceção aqui viraria
 * "não consegui cotar" = "não vendi", que é o pior desfecho possível.
 */
export async function cotarFrete(input: {
  cepDestino: string;
  valorDeclaradoCents: number;
  quantidade: number;
}): Promise<ResultadoCotacao> {
  const provider = getShippingProvider();
  const caixa = caixaPara(input.quantidade, unidadeConfigurada());

  try {
    const origem = { cep: provider.name === "mock" ? "12216530" : cepDeOrigem() };
    const opcoes = await provider.quote(
      origem,
      { cep: input.cepDestino },
      caixa,
      input.valorDeclaradoCents
    );
    return {
      opcoes,
      escolhida: melhorOpcao(opcoes),
      caixa,
      indisponivel: null,
    };
  } catch (e) {
    const motivo =
      e instanceof ShippingUnavailable
        ? e.message
        : `Erro inesperado ao cotar frete: ${e instanceof Error ? e.message : e}`;
    console.error("[frete] cotação falhou:", motivo);
    return { opcoes: [], escolhida: null, caixa, indisponivel: motivo };
  }
}
