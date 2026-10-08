import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { avaliarExportacao, escolherModoInvoicePedido, guiaDhlValida, remessaDhlEmAvaliacao, type DocumentoExportacao, type EntradaProcesso,
  type Exportador, type ItemExportacao, type PacoteExportacao } from "./processo-exportacao";

type Cliente = Awaited<ReturnType<typeof createClient>>;
type PedidoLinha = {
  id: string; payment_status: string; canceled_at: string | null; shipping_status: string;
  subtotal_cents: number; discount_cents: number; currency: string;
  customers: { full_name: string | null; email: string | null; phone: string | null } | null;
  addresses: { country: string | null; city: string | null; postal_code: string | null; line1: string | null } | null;
  order_items: { id: string; product_name_snapshot: string; quantity: number }[];
  shipments: { id: string; provider: string; tracking_code: string | null; status: string | null;
    metadata?: { documents?: Array<{ typeCode?: string | null; storagePath?: string }>;
      exporter_snapshot?: { invoice_mode?: string };
      request_snapshot?: { exporter_snapshot?: { invoice_mode?: string }; request?: { requestInvoice?: boolean } };
      invoice_recovery?: { storage_path?: string; invoice_reference?: string; lookup_reference?: string;
        confirmed_by?: string; confirmed_at?: string } } | null }[];
};
const um = <T>(x: T | T[] | null | undefined): T | null => Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

export async function carregarProcessosExportacao(s: Cliente, ids: string[]) {
  const resultado = new Map<string, { entrada: EntradaProcesso; avaliacao: ReturnType<typeof avaliarExportacao> }>();
  if (!ids.length) return resultado;
  const [pedidos, itens, pacotes, documentos, config] = await Promise.all([
    s.from("orders").select("id,payment_status,canceled_at,shipping_status,subtotal_cents,discount_cents,currency,customers(full_name,email,phone),addresses(country,city,postal_code,line1),order_items(id,product_name_snapshot,quantity),shipments(id,provider,tracking_code,status,metadata)").in("id", ids),
    s.from("order_export_items").select("order_id,order_item_id,ncm,hs_code,country_of_origin,description_en,net_weight_g,customs_value_cents,fiscal_value_brl_cents,fx_rate_brl_per_unit,fx_source,fx_date").in("order_id", ids),
    s.from("order_export_packages").select("*").in("order_id", ids),
    s.from("order_export_documents").select("*").in("order_id", ids),
    s.from("international_export_settings").select("*").eq("singleton", true).maybeSingle(),
  ]);
  const erro = [pedidos.error, itens.error, pacotes.error, documentos.error, config.error].find(Boolean);
  if (erro) throw new Error(`Não foi possível avaliar a exportação: ${erro.message}`);
  const exporter = config.data as Exportador | null;
  for (const raw of pedidos.data ?? []) {
    const p = raw as unknown as PedidoLinha;
    const c = um(p.customers), a = um(p.addresses);
    const envios = Array.isArray(p.shipments) ? p.shipments : p.shipments ? [p.shipments] : [];
    const documentosPedido = (documentos.data ?? []).filter(i => i.order_id === p.id) as DocumentoExportacao[];
    const remessa = remessaDhlEmAvaliacao(envios);
    const modoRemessa = remessa?.metadata?.exporter_snapshot?.invoice_mode ??
      remessa?.metadata?.request_snapshot?.exporter_snapshot?.invoice_mode ??
      (remessa?.metadata?.request_snapshot?.request?.requestInvoice === true ? "api" :
        remessa?.metadata?.request_snapshot?.request?.requestInvoice === false ? "external" : null);
    const invoiceDoc = documentosPedido.find(d => d.kind === "invoice");
    const modoInvoice = escolherModoInvoicePedido(Boolean(remessa), modoRemessa ?? null,
      invoiceDoc, exporter?.invoice_mode ?? null);
    const invoiceDaApi = Boolean(invoiceDoc && remessa?.metadata?.documents?.some(d =>
      /invoice|commercial|^inv$/i.test(d.typeCode ?? "") &&
      d.storagePath === invoiceDoc.storage_path &&
      d.storagePath?.startsWith(`${p.id}/dhl/${remessa.id}/`)));
    const recuperacao = remessa?.metadata?.invoice_recovery;
    const invoiceManual = Boolean(invoiceDoc && recuperacao &&
      invoiceDoc.storage_path === recuperacao.storage_path &&
      invoiceDoc.reference === recuperacao.invoice_reference &&
      invoiceDoc.storage_path.startsWith(`${p.id}/dhl/invoice-manual/`) &&
      (recuperacao.lookup_reference?.length ?? 0) >= 3 &&
      recuperacao.confirmed_by && recuperacao.confirmed_at);
    const entrada: EntradaProcesso = {
      internacional: a?.country !== "BR",
      pago: p.payment_status === "paid", cancelado: Boolean(p.canceled_at),
      contato: { nome: c?.full_name, email: c?.email, telefone: c?.phone }, destino: a,
      linhas: (p.order_items ?? []).map(l => ({ id: l.id, nome: l.product_name_snapshot, quantity: l.quantity })),
      valorMercadoriasCents: p.subtotal_cents - p.discount_cents,
      moedaPedido: p.currency,
      itens: (itens.data ?? []).filter(i => i.order_id === p.id) as ItemExportacao[],
      pacote: (pacotes.data ?? []).find(i => i.order_id === p.id) as PacoteExportacao | undefined ?? null,
      documentos: documentosPedido,
      exportador: exporter,
      invoiceModeForOrder: modoInvoice,
      invoiceDhlComprovada: invoiceDaApi || invoiceManual,
      rastreio: guiaDhlValida(envios),
      remessaEmProcessamento: envios.some(e => e.provider === "dhl" && ["creating", "creation_unknown"].includes(e.status ?? "")),
    };
    resultado.set(p.id, { entrada, avaliacao: avaliarExportacao(entrada) });
  }
  return resultado;
}
