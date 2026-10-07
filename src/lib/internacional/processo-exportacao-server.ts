import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { avaliarExportacao, guiaDhlValida, type DocumentoExportacao, type EntradaProcesso,
  type Exportador, type ItemExportacao, type PacoteExportacao } from "./processo-exportacao";

type Cliente = Awaited<ReturnType<typeof createClient>>;
type PedidoLinha = {
  id: string; payment_status: string; canceled_at: string | null; shipping_status: string;
  subtotal_cents: number; discount_cents: number; currency: string;
  customers: { full_name: string | null; email: string | null; phone: string | null } | null;
  addresses: { country: string | null; city: string | null; postal_code: string | null; line1: string | null } | null;
  order_items: { id: string; product_name_snapshot: string; quantity: number }[];
  shipments: { provider: string; tracking_code: string | null; status: string | null }[];
};
const um = <T>(x: T | T[] | null | undefined): T | null => Array.isArray(x) ? (x[0] ?? null) : (x ?? null);

export async function carregarProcessosExportacao(s: Cliente, ids: string[]) {
  const resultado = new Map<string, { entrada: EntradaProcesso; avaliacao: ReturnType<typeof avaliarExportacao> }>();
  if (!ids.length) return resultado;
  const [pedidos, itens, pacotes, documentos, config] = await Promise.all([
    s.from("orders").select("id,payment_status,canceled_at,shipping_status,subtotal_cents,discount_cents,currency,customers(full_name,email,phone),addresses(country,city,postal_code,line1),order_items(id,product_name_snapshot,quantity),shipments(provider,tracking_code,status)").in("id", ids),
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
    const entrada: EntradaProcesso = {
      internacional: a?.country !== "BR",
      pago: p.payment_status === "paid", cancelado: Boolean(p.canceled_at),
      contato: { nome: c?.full_name, email: c?.email, telefone: c?.phone }, destino: a,
      linhas: (p.order_items ?? []).map(l => ({ id: l.id, nome: l.product_name_snapshot, quantity: l.quantity })),
      valorMercadoriasCents: p.subtotal_cents - p.discount_cents,
      moedaPedido: p.currency,
      itens: (itens.data ?? []).filter(i => i.order_id === p.id) as ItemExportacao[],
      pacote: (pacotes.data ?? []).find(i => i.order_id === p.id) as PacoteExportacao | undefined ?? null,
      documentos: (documentos.data ?? []).filter(i => i.order_id === p.id) as DocumentoExportacao[],
      exportador: exporter,
      rastreio: guiaDhlValida(envios),
      remessaEmProcessamento: envios.some(e => e.provider === "dhl" && ["creating", "creation_unknown"].includes(e.status ?? "")),
    };
    resultado.set(p.id, { entrada, avaliacao: avaliarExportacao(entrada) });
  }
  return resultado;
}
