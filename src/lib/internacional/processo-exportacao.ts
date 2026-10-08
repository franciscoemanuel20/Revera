import type { EtapaExportacao, ExportStatus } from "./exportacao";
import { normalizarAwbDhl } from "@/lib/shipping/awb-dhl";

export type DocumentoTipo = "nfe" | "invoice" | "declaration";
export type DocumentoExportacao = {
  kind: DocumentoTipo;
  source: "external" | "dhl";
  status: "pending" | "verified" | "rejected";
  reference: string;
  storage_path: string;
  regime: "DRE" | "DUE" | null;
};

export function escolherModoInvoicePedido(remessaPresente: boolean, modoRemessa: string | null,
  invoice: DocumentoExportacao | undefined, modoGlobal: string | null): string | null {
  if (remessaPresente) return modoRemessa;
  if (invoice?.status === "verified") return invoice.source === "dhl" ? "api" : "external";
  return modoGlobal;
}
export type ItemExportacao = {
  order_item_id: string;
  ncm: string;
  hs_code: string;
  country_of_origin: string;
  description_en: string;
  net_weight_g: number;
  customs_value_cents: number;
  fiscal_value_brl_cents: number;
  fx_rate_brl_per_unit: number;
  fx_source: string;
  fx_date: string;
};
export type PacoteExportacao = {
  gross_weight_g: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  incoterm: "DAP" | "DDP";
};
export type Exportador = {
  legal_name: string | null; tax_id: string | null; country: string | null;
  postal_code: string | null; city: string | null; address_line1: string | null;
  contact_name: string | null; phone: string | null; email: string | null;
  invoice_mode: string; dhl_account_confirmed: boolean;
};
export type EntradaProcesso = {
  internacional: boolean;
  pago: boolean;
  cancelado: boolean;
  contato: { nome?: string | null; email?: string | null; telefone?: string | null };
  destino: { country?: string | null; city?: string | null; postal_code?: string | null;
    line1?: string | null; recipient_name?: string | null } | null;
  linhas: { id: string; nome: string; quantity: number }[];
  valorMercadoriasCents: number;
  moedaPedido: string;
  itens: ItemExportacao[];
  pacote: PacoteExportacao | null;
  documentos: DocumentoExportacao[];
  focusNfeAuthorized?: boolean;
  exportador: Exportador | null;
  invoiceModeForOrder?: string | null;
  invoiceDhlComprovada?: boolean;
  rastreio: string | null;
  remessaEmProcessamento: boolean;
};

export function guiaDhlValida(envios: Array<{ provider: string; tracking_code: string | null; status: string | null }>): string | null {
  const remessa = envios.find(e => e.provider === "dhl" && e.tracking_code &&
    ["label_created", "registrado_manual"].includes(e.status ?? ""));
  return remessa?.tracking_code ? normalizarAwbDhl(remessa.tracking_code) : null;
}

export type AvaliacaoExportacao = {
  status: ExportStatus;
  etapas: EtapaExportacao[];
  podeCriarEtiqueta: boolean;
  podeRegistrarGuia: boolean;
  podeDespachar: boolean;
  bloqueiosEtiqueta: string[];
  bloqueiosGuia: string[];
  bloqueiosDespacho: string[];
};

const presente = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const completo = (i: ItemExportacao | undefined) => Boolean(i &&
  /^[0-9]{8}$/.test(i.ncm) && /^[0-9]{6,10}$/.test(i.hs_code) &&
  /^[A-Z]{2}$/.test(i.country_of_origin) && presente(i.description_en) &&
  i.net_weight_g > 0 && i.customs_value_cents > 0 && i.fiscal_value_brl_cents > 0 &&
  i.fx_rate_brl_per_unit > 0 && presente(i.fx_source) && presente(i.fx_date) &&
  Math.abs(Math.round(i.customs_value_cents * i.fx_rate_brl_per_unit) - i.fiscal_value_brl_cents) <= 1);
const documentoValido = (d: DocumentoExportacao | undefined) => Boolean(d && d.status === "verified" && presente(d.reference) && presente(d.storage_path));

/** Única decisão operacional usada por tela, etiqueta, guia e despacho. */
export function avaliarExportacao(e: EntradaProcesso): AvaliacaoExportacao {
  if (!e.internacional) return { status: "not_required", etapas: [], podeCriarEtiqueta: false,
    podeRegistrarGuia: false, podeDespachar: false, bloqueiosEtiqueta: [], bloqueiosGuia: [], bloqueiosDespacho: [] };
  const etapas: EtapaExportacao[] = [];
  const adicionar = (chave: string, titulo: string, ok: boolean, detalhe: string) =>
    etapas.push({ chave, titulo, estado: ok ? "pronto" : "pendente", detalhe: ok ? null : detalhe });
  const pagamento = e.pago && !e.cancelado;
  adicionar("pagamento", "Pagamento", pagamento, e.cancelado ? "Pedido cancelado." : "Pagamento não confirmado.");
  const contato = presente(e.contato.nome) && presente(e.contato.email) && presente(e.contato.telefone);
  adicionar("cliente", "Dados do cliente", contato, "Nome, e-mail e telefone são necessários para a DHL.");
  const destino = Boolean(e.destino && e.destino.country !== "BR" && presente(e.destino.country) &&
    presente(e.destino.city) && presente(e.destino.line1) && presente(e.destino.postal_code));
  adicionar("endereco", "Endereço internacional", destino, "Confira país, cidade, endereço e código postal do destinatário.");
  const faltantes = e.linhas.filter(l => {
    const i = e.itens.find(i => i.order_item_id === l.id);
    return !completo(i) || !i || i.customs_value_cents % l.quantity !== 0;
  });
  const valoresFecham = e.itens.reduce((sum, i) => sum + i.customs_value_cents, 0) === e.valorMercadoriasCents;
  const itensOk = e.linhas.length > 0 && faltantes.length === 0 && valoresFecham;
  adicionar("fiscal_produto", "Dados fiscais dos itens", itensOk,
    faltantes.length ? `Validar snapshot fiscal em: ${faltantes.map(l => l.nome).join(", ")}.` :
      !valoresFecham ? `A soma dos valores aduaneiros em ${e.moedaPedido} deve igualar o valor dos produtos após desconto.` : "Pedido sem itens.");
  const pacote = Boolean(e.pacote && e.pacote.gross_weight_g > 0 && e.pacote.length_cm > 0 &&
    e.pacote.width_cm > 0 && e.pacote.height_cm > 0 &&
    ["DAP", "DDP"].includes(e.pacote.incoterm) &&
    e.pacote.gross_weight_g >= e.itens.reduce((sum, i) => sum + i.net_weight_g * (e.linhas.find(l => l.id === i.order_item_id)?.quantity ?? 0), 0));
  adicionar("pacote", "Embalagem e condição de entrega", pacote, "Informe peso bruto e dimensões da caixa final e valide o Incoterm DAP ou DDP para este pedido; o peso bruto não pode ser menor que o líquido.");
  const x = e.exportador;
  const exportador = Boolean(x && [x.legal_name, x.tax_id, x.country, x.postal_code, x.city,
    x.address_line1, x.contact_name, x.phone, x.email].every(presente));
  adicionar("exportador", "Dados do exportador", exportador, "Complete os dados da empresa exportadora no painel Internacional.");
  const docs = Object.fromEntries(e.documentos.map(d => [d.kind, d])) as Partial<Record<DocumentoTipo, DocumentoExportacao>>;
  const nfe = documentoValido(docs.nfe) && e.focusNfeAuthorized === true;
  adicionar("nfe", "NF-e de exportação", nfe, "A NF-e deve estar autorizada na Focus, com XML e DANFE privados, e conferida neste pedido.");
  const modo = e.invoiceModeForOrder === undefined ? x?.invoice_mode : e.invoiceModeForOrder;
  const invoice = documentoValido(docs.invoice) &&
    ((modo === "external" && docs.invoice?.source === "external") ||
      (modo === "api" && docs.invoice?.source === "dhl" && e.invoiceDhlComprovada === true));
  adicionar("invoice", "Commercial Invoice", invoice,
    docs.invoice?.status === "pending" ? "Documento recebido; falta conferência." : "Anexe e confira a fatura comercial.");
  const declaracao = documentoValido(docs.declaration) && Boolean(docs.declaration?.regime);
  adicionar("declaration", "Declaração aduaneira", declaracao, "Registre DRE ou DU-E com referência e documento conferidos.");
  const conta = Boolean(x?.dhl_account_confirmed);
  adicionar("dhl", "Conta DHL", conta, "Confirme a conta DHL da exportadora.");
  adicionar("guia", "Guia DHL", Boolean(e.rastreio), "Crie a remessa ou registre a guia conferida no MyDHL+.");

  const base = etapas.filter(t => ["pagamento","cliente","endereco","fiscal_produto","pacote","exportador","nfe","dhl"].includes(t.chave) && t.estado !== "pronto").map(t => t.detalhe!);
  const bloqueiosEtiqueta = [...base,
    ...(!invoice ? ["Commercial Invoice ainda não conferida antes da etiqueta."] : []),
    ...(!declaracao ? ["DRE ou DU-E ainda não conferida antes da etiqueta."] : []),
    ...(modo === "api" ? ["Nova guia exige Commercial Invoice externa conferida antes da DHL; anexe-a para fixar o modo externo."] : []),
    ...(modo !== "external" && modo !== "api" ? ["Defina o modo de emissão da Commercial Invoice."] : [])];
  const bloqueiosGuia = [...base,
    ...(!invoice ? ["Commercial Invoice ainda não conferida."] : []),
    ...(!declaracao ? ["DRE ou DU-E ainda não conferida."] : [])];
  const bloqueiosDespacho = [...bloqueiosGuia,
    ...(!invoice ? ["Commercial Invoice ainda não conferida."] : []),
    ...(!declaracao ? ["Declaração aduaneira ainda não conferida."] : []),
    ...(!e.rastreio ? ["Guia DHL ainda não registrada."] : [])];
  const dadosOk = ["pagamento","cliente","endereco","fiscal_produto","pacote","exportador"].every(k => etapas.find(t => t.chave === k)?.estado === "pronto");
  const status: ExportStatus = !dadosOk ? "pending_data" : e.remessaEmProcessamento ? "documents_processing" :
    !nfe || !invoice ? "ready_for_documents" : !declaracao || !e.rastreio ? "documents_ready" : "ready_for_dispatch";
  return { status, etapas, podeCriarEtiqueta: bloqueiosEtiqueta.length === 0,
    podeRegistrarGuia: bloqueiosGuia.length === 0, podeDespachar: bloqueiosDespacho.length === 0,
    bloqueiosEtiqueta, bloqueiosGuia, bloqueiosDespacho };
}
