import "server-only";

import type { Moeda } from "./moeda";

const PTAX_TIMEOUT_MS = 8_000;
const cache = new Map<string, { valor: CotacaoPtax; expiraEm: number }>();

export interface CotacaoPtax {
  moeda: Exclude<Moeda, "BRL">;
  reaisPorUnidade: number;
  data: string;
  fonte: "Banco Central do Brasil PTAX venda";
}

export function converterCentavosBrl(
  centavosBrl: number,
  reaisPorUnidade: number
): number {
  if (!Number.isInteger(centavosBrl) || centavosBrl <= 0 || !Number.isFinite(reaisPorUnidade) || reaisPorUnidade <= 0) {
    throw new Error("Valor ou cotação inválidos para conversão cambial.");
  }
  // Os mercados habilitados usam duas casas decimais. Arredondar para cima
  // impede que frações de centavo façam a loja cobrar menos que o preço BRL.
  return Math.ceil(centavosBrl / reaisPorUnidade);
}

function dataMmDdYyyy(data: Date): string {
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(data.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${data.getUTCFullYear()}`;
}

export async function obterCotacaoPtax(moeda: Moeda): Promise<CotacaoPtax> {
  if (moeda === "BRL") throw new Error("PTAX estrangeira exige moeda diferente de BRL.");
  const existente = cache.get(moeda);
  if (existente && existente.expiraEm > Date.now()) return existente.valor;

  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - 10);
  const base = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)";
  const params = new URLSearchParams({
    "@moeda": `'${moeda}'`,
    "@dataInicial": `'${dataMmDdYyyy(inicio)}'`,
    "@dataFinalCotacao": `'${dataMmDdYyyy(fim)}'`,
    "$format": "json",
    "$orderby": "dataHoraCotacao desc",
  });

  const resposta = await fetch(`${base}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(PTAX_TIMEOUT_MS),
  });
  if (!resposta.ok) throw new Error(`Banco Central indisponível (HTTP ${resposta.status}).`);
  const json = await resposta.json() as { value?: Array<Record<string, unknown>> };
  const fechamento = json.value?.find((linha) => linha.tipoBoletim === "Fechamento") ?? json.value?.[0];
  const taxa = Number(fechamento?.cotacaoVenda);
  const instante = typeof fechamento?.dataHoraCotacao === "string" ? fechamento.dataHoraCotacao : "";
  if (!Number.isFinite(taxa) || taxa <= 0 || !instante) throw new Error("Banco Central não retornou uma PTAX de venda válida.");

  const valor: CotacaoPtax = {
    moeda,
    reaisPorUnidade: taxa,
    data: instante.slice(0, 10),
    fonte: "Banco Central do Brasil PTAX venda",
  };
  cache.set(moeda, { valor, expiraEm: Date.now() + 30 * 60_000 });
  return valor;
}
