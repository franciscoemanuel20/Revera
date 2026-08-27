/**
 * O vocabulário da central de vendas — os dois eixos do pedido, no idioma
 * de quem opera a loja.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO DE order-status.ts (27/08/2026)
 * ===========================================================================
 * `order-status.ts` descreve o campo ANTIGO `orders.status`, que a partir da
 * migration 8 é uma coluna DERIVADA. Ele continua valendo para quem lê o
 * campo antigo (página do cliente, checkout, rastreamento) e não foi tocado.
 *
 * Aqui ficam os dois eixos reais. Não é arquitetura paralela: é a fonte, e o
 * outro arquivo é a projeção. Quando nada mais ler `orders.status`, aquele
 * some e este fica.
 *
 * ===========================================================================
 * REGRA DE LINGUAGEM
 * ===========================================================================
 * Nenhum rótulo aqui pode conter "webhook", "API", "provider", "payload" ou
 * "evento". A pessoa que usa esta tela cuida de cabelo, não de sistema. O
 * termo técnico fica no nome da constante; o que aparece na tela é o que ela
 * diria em voz alta: "pago", "emitir etiqueta", "enviado".
 */

export type PaymentStatusValue = "pending" | "paid" | "failed" | "refunded";

export type ShippingStatusValue =
  | "not_ready"
  | "awaiting_label"
  | "label_processing"
  | "label_created"
  | "shipped"
  | "delivered"
  | "shipping_error";

export const PAGAMENTO_LABEL: Record<PaymentStatusValue, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  failed: "Pagamento recusado",
  refunded: "Reembolsado",
};

export const ENVIO_LABEL: Record<ShippingStatusValue, string> = {
  not_ready: "Aguardando pagamento",
  awaiting_label: "Aguardando etiqueta",
  label_processing: "Emitindo etiqueta",
  label_created: "Etiqueta pronta",
  shipped: "Enviado",
  delivered: "Entregue",
  shipping_error: "Erro ao emitir etiqueta",
};

/**
 * Cor + palavra, nunca cor sozinha. Quem enxerga pouca diferença entre
 * verde e laranja — e quem imprime a tela em preto e branco — continua
 * lendo o status, porque ele está escrito ao lado.
 */
export const PAGAMENTO_BADGE: Record<PaymentStatusValue, string> = {
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-moss/20 text-moss",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-ink/10 text-ink/70",
};

export const ENVIO_BADGE: Record<ShippingStatusValue, string> = {
  not_ready: "bg-ink/10 text-ink/70",
  awaiting_label: "bg-orange-100 text-orange-900",
  label_processing: "bg-orange-100 text-orange-900",
  label_created: "bg-sky-100 text-sky-900",
  shipped: "bg-sky-100 text-sky-900",
  delivered: "bg-moss/20 text-moss",
  shipping_error: "bg-red-100 text-red-800",
};

/**
 * As abas são VISÕES dos dois eixos — não um terceiro campo. Cada uma é um
 * predicado sobre (payment_status, shipping_status, canceled_at), e é isso
 * que impede a tela de inventar estado que o banco não tem.
 */
export type AbaVendas =
  | "todas"
  | "pendentes"
  | "pagas"
  | "aguardando_envio"
  | "etiqueta_pronta"
  | "enviadas"
  | "entregues"
  | "canceladas";

export const ABA_LABEL: Record<AbaVendas, string> = {
  todas: "Todas",
  pendentes: "Pendentes",
  pagas: "Pagas",
  aguardando_envio: "Aguardando envio",
  etiqueta_pronta: "Etiqueta pronta",
  enviadas: "Enviadas",
  entregues: "Entregues",
  canceladas: "Canceladas",
};

export const ORDEM_DAS_ABAS: AbaVendas[] = [
  "todas",
  "pendentes",
  "pagas",
  "aguardando_envio",
  "etiqueta_pronta",
  "enviadas",
  "entregues",
  "canceladas",
];

/**
 * "Aguardando envio" é a aba que a responsável abre de manhã: é a lista de
 * tarefas do dia. Por isso ela reúne TUDO que ainda exige ação física —
 * emitir etiqueta, etiqueta já emitida esperando ir ao correio, e também o
 * que deu erro na emissão. Um pedido com erro de etiqueta some da vista se
 * ficar só numa aba de exceção, e some é o pior que pode acontecer com ele.
 */
export const ENVIOS_AGUARDANDO: ShippingStatusValue[] = [
  "awaiting_label",
  "label_processing",
  "label_created",
  "shipping_error",
];

export interface FiltroAba {
  paymentStatus?: PaymentStatusValue[];
  shippingStatus?: ShippingStatusValue[];
  cancelado?: boolean;
}

export function filtroDaAba(aba: AbaVendas): FiltroAba {
  switch (aba) {
    case "pendentes":
      return { paymentStatus: ["pending", "failed"], cancelado: false };
    case "pagas":
      return { paymentStatus: ["paid"], cancelado: false };
    case "aguardando_envio":
      return { paymentStatus: ["paid"], shippingStatus: ENVIOS_AGUARDANDO, cancelado: false };
    case "etiqueta_pronta":
      return { shippingStatus: ["label_created"], cancelado: false };
    case "enviadas":
      return { shippingStatus: ["shipped"], cancelado: false };
    case "entregues":
      return { shippingStatus: ["delivered"], cancelado: false };
    case "canceladas":
      return { cancelado: true };
    case "todas":
    default:
      return {};
  }
}

/**
 * Ações manuais no eixo de ENVIO. Emitir etiqueta não está aqui: aquilo não
 * é "mudar um status", é gastar dinheiro na SuperFrete — mora em
 * etiqueta.ts, com trava própria.
 *
 * Repare no que NÃO existe: nenhum caminho manual leva a 'label_created'.
 * Marcar "etiqueta pronta" na mão criaria um pedido que a tela diz ter
 * etiqueta e que não tem etiqueta nenhuma.
 */
const TRANSICOES_ENVIO: Record<ShippingStatusValue, ShippingStatusValue[]> = {
  not_ready: [],
  awaiting_label: [],
  label_processing: [],
  label_created: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  shipping_error: ["awaiting_label"],
};

export type ResultadoValidacaoEnvio = { ok: true } | { ok: false; erro: string };

export function validarTransicaoEnvio(
  atual: ShippingStatusValue,
  destino: ShippingStatusValue
): ResultadoValidacaoEnvio {
  if (atual === destino) {
    return { ok: false, erro: "O pedido já está nesta situação." };
  }
  if (!TRANSICOES_ENVIO[atual].includes(destino)) {
    return {
      ok: false,
      erro: `Não dá para ir de "${ENVIO_LABEL[atual]}" direto para "${ENVIO_LABEL[destino]}".`,
    };
  }
  return { ok: true };
}

export function transicoesEnvioDisponiveis(atual: ShippingStatusValue): ShippingStatusValue[] {
  return TRANSICOES_ENVIO[atual];
}

/** O que conta como venda de verdade no faturamento: pago e não cancelado. */
export function contaComoVenda(
  paymentStatus: PaymentStatusValue,
  canceladoEm: string | null
): boolean {
  return paymentStatus === "paid" && !canceladoEm;
}
