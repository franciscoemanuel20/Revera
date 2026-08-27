import { ehEnderecoBR, type Endereco } from "./endereco";

/**
 * O checklist de exportação — e a regra de nunca fingir prontidão.
 *
 * ===========================================================================
 * TRÊS ESTADOS, NÃO DOIS (27/08/2026)
 * ===========================================================================
 * A tentação é modelar cada etapa como feito/não feito. Mas há uma terceira
 * possibilidade, e ela é a mais comum hoje:
 *
 *   pronto            — está feito
 *   pendente          — falta alguém fazer, e dá para fazer
 *   nao_configurado   — NÃO EXISTE ainda. Ninguém pode fazer.
 *
 * NF-e, Commercial Invoice e DHL estão todos no terceiro estado. Mostrá-los
 * como "pendente" seria mentir por omissão: sugere que a responsável está
 * atrasada em algo, quando na verdade o sistema não tem essa capacidade.
 *
 * A diferença importa na tela. "Pendente" convida a agir. "Não configurado"
 * explica por que não há botão.
 */

export type EstadoEtapa = "pronto" | "pendente" | "nao_configurado";

export interface EtapaExportacao {
  chave: string;
  titulo: string;
  estado: EstadoEtapa;
  /** O que falta, em linguagem de operação. Nulo quando está pronto. */
  detalhe: string | null;
}

export type ExportStatus =
  | "not_required"
  | "pending_data"
  | "ready_for_documents"
  | "documents_processing"
  | "documents_ready"
  | "ready_for_dispatch"
  | "export_error";

export const EXPORT_STATUS_LABEL: Record<ExportStatus, string> = {
  not_required: "Pedido nacional",
  pending_data: "Configuração pendente",
  ready_for_documents: "Dados completos",
  documents_processing: "Gerando documentos",
  documents_ready: "Documentos prontos",
  ready_for_dispatch: "Pronto para levar à DHL",
  export_error: "Erro na exportação",
};

export const EXPORT_STATUS_BADGE: Record<ExportStatus, string> = {
  not_required: "bg-ink/10 text-ink/60",
  pending_data: "bg-amber-100 text-amber-900",
  ready_for_documents: "bg-sky-100 text-sky-900",
  documents_processing: "bg-sky-100 text-sky-900",
  documents_ready: "bg-sky-100 text-sky-900",
  ready_for_dispatch: "bg-moss/20 text-moss",
  export_error: "bg-red-100 text-red-800",
};

/**
 * Configuração de terceiros. Enquanto for tudo `false`, o painel mostra
 * "não configurado" nessas etapas — e é a verdade.
 *
 * Lê variável de ambiente em vez de constante para que ligar cada peça, no
 * futuro, não exija mexer neste arquivo. Ausente conta como desligado.
 */
export interface ProvedoresConfigurados {
  nfe: boolean;
  invoice: boolean;
  dhl: boolean;
}

export function provedoresConfigurados(): ProvedoresConfigurados {
  const ligado = (v: string | undefined) => (v ?? "").trim().toLowerCase() === "1";
  return {
    nfe: ligado(process.env.NFE_PROVIDER_ATIVO),
    invoice: ligado(process.env.INVOICE_ATIVA),
    dhl: ligado(process.env.DHL_ATIVA),
  };
}

export interface DadosFiscaisProduto {
  nome: string;
  ncm: string | null;
  hsCode: string | null;
  paisOrigem: string | null;
  descricaoEn: string | null;
  pesoLiquidoG: number | null;
}

export interface EntradaChecklist {
  pago: boolean;
  endereco: Endereco | null;
  /** Telefone e e-mail do cliente — a DHL exige contato do destinatário. */
  clienteTemContato: boolean;
  produtos: DadosFiscaisProduto[];
  provedores: ProvedoresConfigurados;
}

/**
 * Lista o que falta em cada produto. Devolve nomes de campo em linguagem de
 * gente, porque quem lê isto é a responsável — não quem escreveu o schema.
 */
function faltaNoProduto(p: DadosFiscaisProduto): string[] {
  const faltas: string[] = [];
  if (!p.ncm) faltas.push("NCM");
  if (!p.hsCode) faltas.push("HS Code");
  if (!p.paisOrigem) faltas.push("país de origem");
  if (!p.descricaoEn) faltas.push("descrição em inglês");
  if (!p.pesoLiquidoG) faltas.push("peso");
  return faltas;
}

export function montarChecklist(e: EntradaChecklist): EtapaExportacao[] {
  const etapas: EtapaExportacao[] = [];

  etapas.push({
    chave: "pagamento",
    titulo: "Pagamento",
    estado: e.pago ? "pronto" : "pendente",
    detalhe: e.pago ? null : "Aguardando confirmação do pagamento.",
  });

  etapas.push({
    chave: "cliente",
    titulo: "Dados do cliente",
    estado: e.clienteTemContato ? "pronto" : "pendente",
    detalhe: e.clienteTemContato
      ? null
      : "Falta telefone ou e-mail — a transportadora exige contato do destinatário.",
  });

  const enderecoOk = Boolean(e.endereco) && !ehEnderecoBR(e.endereco as Endereco);
  etapas.push({
    chave: "endereco",
    titulo: "Endereço internacional",
    estado: enderecoOk ? "pronto" : "pendente",
    detalhe: enderecoOk ? null : "Endereço de entrega fora do Brasil incompleto.",
  });

  // O detalhe nomeia o PRODUTO e o CAMPO. "Dados fiscais pendentes" sozinho
  // manda a pessoa procurar em qual dos cinco produtos está o buraco.
  const pendencias = e.produtos
    .map((p) => ({ nome: p.nome, faltas: faltaNoProduto(p) }))
    .filter((p) => p.faltas.length > 0);

  etapas.push({
    chave: "fiscal_produto",
    titulo: "Dados fiscais do produto",
    estado: pendencias.length === 0 ? "pronto" : "pendente",
    detalhe:
      pendencias.length === 0
        ? null
        : pendencias.map((p) => `${p.nome}: falta ${p.faltas.join(", ")}`).join(" · "),
  });

  etapas.push({
    chave: "nfe",
    titulo: "NF-e de exportação",
    estado: e.provedores.nfe ? "pendente" : "nao_configurado",
    detalhe: e.provedores.nfe
      ? "Pronta para ser emitida."
      : "Provedor de nota fiscal ainda não contratado.",
  });

  etapas.push({
    chave: "invoice",
    titulo: "Commercial Invoice",
    estado: e.provedores.invoice ? "pendente" : "nao_configurado",
    detalhe: e.provedores.invoice
      ? "Pronta para ser gerada."
      : "Depende dos dados fiscais validados pelo contador.",
  });

  etapas.push({
    chave: "dhl",
    titulo: "DHL",
    estado: e.provedores.dhl ? "pendente" : "nao_configurado",
    detalhe: e.provedores.dhl ? "Pronto para cotar e despachar." : "Acesso à DHL ainda não configurado.",
  });

  return etapas;
}

/**
 * Deriva o eixo de exportação do estado real, em vez de guardar mais um
 * campo que alguém precisa lembrar de atualizar.
 *
 * Repare no teto: esta função NUNCA devolve 'ready_for_dispatch' hoje,
 * porque nenhum documento pode ser gerado. Prometer "pronto para despachar"
 * sem invoice nem nota seria a mentira que o Francisco pediu para evitar.
 */
export function derivarExportStatus(
  ehPedidoInternacional: boolean,
  etapas: EtapaExportacao[]
): ExportStatus {
  if (!ehPedidoInternacional) return "not_required";

  const porChave = new Map(etapas.map((et) => [et.chave, et]));
  const dadosProprios = ["pagamento", "cliente", "endereco", "fiscal_produto"];

  const faltaDadoProprio = dadosProprios.some(
    (c) => porChave.get(c)?.estado !== "pronto"
  );
  if (faltaDadoProprio) return "pending_data";

  const documentos = ["nfe", "invoice", "dhl"];
  const algumNaoConfigurado = documentos.some(
    (c) => porChave.get(c)?.estado === "nao_configurado"
  );
  // Dados nossos completos, terceiros ausentes: o pedido está pronto até
  // onde depende de nós, e travado onde depende de contratação.
  if (algumNaoConfigurado) return "ready_for_documents";

  const todosProntos = documentos.every((c) => porChave.get(c)?.estado === "pronto");
  return todosProntos ? "ready_for_dispatch" : "documents_ready";
}

/** Resumo de uma linha para a lista de vendas. */
export function resumoChecklist(etapas: EtapaExportacao[]): string {
  const naoConfig = etapas.filter((e) => e.estado === "nao_configurado").length;
  const pendentes = etapas.filter((e) => e.estado === "pendente").length;
  if (naoConfig > 0 && pendentes === 0) return "Aguardando configuração";
  if (pendentes > 0) return "Configuração pendente";
  return "Documentação pronta";
}
