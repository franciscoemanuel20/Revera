import "server-only";

/**
 * A consulta da central de vendas — abas, filtros, busca e ordenação.
 *
 * ===========================================================================
 * POR QUE ISTO NÃO É UM CAMPO NOVO NO BANCO (27/08/2026)
 * ===========================================================================
 * Cada aba ("Aguardando envio", "Etiqueta pronta") é um PREDICADO sobre os
 * dois eixos reais do pedido, montado aqui. Nenhuma delas existe como valor
 * gravado em lugar nenhum.
 *
 * A alternativa — uma coluna `aba` ou `situacao_geral` — pareceria mais
 * simples e criaria a possibilidade de a coluna discordar dos eixos: um
 * pedido marcado "enviado" na coluna e 'awaiting_label' no eixo. Quando isso
 * acontece, ninguém sabe qual dos dois está certo, e a resposta costuma ser
 * "nenhum".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filtroDaAba,
  type AbaVendas,
  type PaymentStatusValue,
  type ShippingStatusValue,
} from "./venda-status";

export type Ordenacao = "recentes" | "antigos" | "maior_valor" | "menor_valor";

export type Periodo = "hoje" | "ontem" | "7dias" | "30dias" | "tudo";

export type Origem = "todas" | "brasil" | "internacional";

export interface ParametrosBusca {
  aba: AbaVendas;
  periodo: Periodo;
  ordem: Ordenacao;
  busca?: string;
  uf?: string;
  /** Brasil x exterior. É filtro, não um sistema de pedidos separado. */
  origem?: Origem;
  /** ISO-2 de um país específico. */
  pais?: string;
}

export interface VendaResumo {
  id: string;
  numero: string;
  criadoEm: string;
  cliente: string;
  produto: string;
  quantidade: number;
  totalCents: number;
  metodo: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  pais: string;
  internacional: boolean;
  moeda: string;
  exportStatus: string;
  paymentStatus: PaymentStatusValue;
  shippingStatus: ShippingStatusValue;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  rastreio: string | null;
  etiquetaUrl: string | null;
  transportadora: string | null;
  vistoEm: string | null;
}

const SELECT_VENDA =
  "id, order_number, created_at, total_cents, currency, export_status, payment_status, shipping_status, canceled_at, cancel_reason, seen_at," +
  " customers(full_name, phone, email, cpf)," +
  " addresses(city, state, country)," +
  " order_items(product_name_snapshot, quantity)," +
  " payments(method, status)," +
  " shipments(tracking_code, label_url, service_name)";

/**
 * O recorte de tempo é calculado no fuso de São Paulo, não no do servidor.
 * A Vercel roda em UTC: depois das 21h de Brasília, "hoje" em UTC já é
 * amanhã — e o painel mostraria zero venda numa noite movimentada.
 */
export function inicioDoPeriodo(periodo: Periodo, agora: Date): Date | null {
  if (periodo === "tudo") return null;
  const emSP = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const deslocamento = agora.getTime() - emSP.getTime();
  const meiaNoiteSP = new Date(emSP);
  meiaNoiteSP.setHours(0, 0, 0, 0);

  const dias = periodo === "hoje" ? 0 : periodo === "ontem" ? 1 : periodo === "7dias" ? 6 : 29;
  meiaNoiteSP.setDate(meiaNoiteSP.getDate() - dias);
  return new Date(meiaNoiteSP.getTime() + deslocamento);
}

export function fimDoPeriodo(periodo: Periodo, agora: Date): Date | null {
  // Só "ontem" tem teto: os outros vão até agora.
  if (periodo !== "ontem") return null;
  const inicioHoje = inicioDoPeriodo("hoje", agora);
  return inicioHoje;
}

/**
 * A busca cobre número do pedido e rastreio direto no banco. Nome, telefone,
 * e-mail e CPF moram na tabela de clientes: filtrar por eles exigiria um
 * join que o PostgREST não expressa bem numa query só, então o casamento
 * desses campos é feito em memória, sobre a página já carregada.
 *
 * É honesto sobre o limite: com poucos milhares de pedidos isto é
 * instantâneo. Quando a loja passar disso, a saída é uma coluna de busca
 * materializada (tsvector) — e não emendar mais um `or` aqui.
 */
function casaBuscaLocal(venda: VendaResumo, termo: string): boolean {
  const alvo = [venda.numero, venda.cliente, venda.rastreio ?? ""].join(" ").toLowerCase();
  return alvo.includes(termo);
}

export async function buscarVendas(
  supabase: SupabaseClient,
  params: ParametrosBusca,
  agora: Date
): Promise<{ vendas: VendaResumo[]; erro: string | null }> {
  // Encadeado direto, sem função auxiliar: os tipos do PostgREST não
  // sobrevivem a uma passagem por variável genérica (o builder carrega o
  // nome da tabela no tipo), e forçar isso com `any` esconderia erro real.
  let query = supabase.from("orders").select(SELECT_VENDA);

  const filtroAba = filtroDaAba(params.aba);
  if (filtroAba.paymentStatus) query = query.in("payment_status", filtroAba.paymentStatus);
  if (filtroAba.shippingStatus) query = query.in("shipping_status", filtroAba.shippingStatus);
  if (filtroAba.cancelado === true) query = query.not("canceled_at", "is", null);
  if (filtroAba.cancelado === false) query = query.is("canceled_at", null);

  const inicio = inicioDoPeriodo(params.periodo, agora);
  if (inicio) query = query.gte("created_at", inicio.toISOString());
  const fim = fimDoPeriodo(params.periodo, agora);
  if (fim) query = query.lt("created_at", fim.toISOString());

  if (params.uf) query = query.eq("addresses.state", params.uf);
  // Origem e país filtram pelo endereço, não por um campo do pedido: o país
  // do endereço é a verdade, e um campo espelho no pedido só criaria a
  // chance de os dois discordarem.
  if (params.pais) query = query.eq("addresses.country", params.pais.toUpperCase());
  else if (params.origem === "brasil") query = query.eq("addresses.country", "BR");
  else if (params.origem === "internacional") query = query.neq("addresses.country", "BR");

  const termo = params.busca?.trim().toLowerCase() ?? "";
  if (termo) {
    // O que o banco consegue filtrar sozinho, ele filtra: assim a busca por
    // número de pedido continua exata mesmo com muitos pedidos.
    const escapado = termo.replace(/[%,()]/g, "");
    if (escapado) query = query.or(`order_number.ilike.%${escapado}%`);
  }

  switch (params.ordem) {
    case "antigos":
      query = query.order("created_at", { ascending: true });
      break;
    case "maior_valor":
      query = query.order("total_cents", { ascending: false });
      break;
    case "menor_valor":
      query = query.order("total_cents", { ascending: true });
      break;
    case "recentes":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data, error } = await query.limit(300);
  if (error) return { vendas: [], erro: error.message };

  let vendas = (data ?? []).map(mapear);

  // Termo que não casou pelo número do pedido ainda pode ser nome ou
  // rastreio — a segunda passada, em memória, cobre isso.
  if (termo) {
    const doBanco = vendas.filter((v) => casaBuscaLocal(v, termo));
    if (doBanco.length > 0) vendas = doBanco;
  }

  return { vendas, erro: null };
}

/** Busca ampla (sem o filtro de número) para quando o termo é nome ou CPF. */
export async function buscarVendasPorPessoa(
  supabase: SupabaseClient,
  termo: string
): Promise<VendaResumo[]> {
  const limpo = termo.trim().toLowerCase();
  if (!limpo) return [];
  const soDigitos = limpo.replace(/\D/g, "");

  const { data } = await supabase.from("orders").select(SELECT_VENDA).limit(300);
  return (data ?? []).map(mapear).filter((v) => {
    const alvo = [v.numero, v.cliente, v.rastreio ?? ""].join(" ").toLowerCase();
    if (alvo.includes(limpo)) return true;
    return soDigitos.length >= 4 && (v.telefone ?? "").replace(/\D/g, "").includes(soDigitos);
  });
}

interface LinhaBanco {
  id: string;
  order_number: string;
  created_at: string;
  total_cents: number;
  payment_status: string;
  shipping_status: string;
  canceled_at: string | null;
  cancel_reason: string | null;
  seen_at: string | null;
  customers: { full_name?: string; phone?: string; email?: string; cpf?: string } | null;
  addresses: { city?: string; state?: string; country?: string } | null;
  currency?: string;
  export_status?: string;
  order_items: Array<{ product_name_snapshot: string; quantity: number }> | null;
  payments: Array<{ method: string | null; status: string }> | null;
  shipments: Array<{
    tracking_code: string | null;
    label_url: string | null;
    service_name: string | null;
  }> | null;
}

function mapear(linha: unknown): VendaResumo {
  const l = linha as LinhaBanco;
  const itens = l.order_items ?? [];
  const primeiro = itens[0];
  const envio = (l.shipments ?? [])[0];
  const pagamentoAprovado = (l.payments ?? []).find((p) => p.status === "approved");

  return {
    id: l.id,
    numero: l.order_number,
    criadoEm: l.created_at,
    cliente: l.customers?.full_name?.trim() || "Cliente sem nome",
    telefone: l.customers?.phone ?? null,
    produto: primeiro
      ? itens.length > 1
        ? `${primeiro.product_name_snapshot} +${itens.length - 1}`
        : primeiro.product_name_snapshot
      : "—",
    quantidade: itens.reduce((s, i) => s + i.quantity, 0),
    totalCents: l.total_cents,
    metodo: pagamentoAprovado?.method ?? (l.payments ?? [])[0]?.method ?? null,
    cidade: l.addresses?.city ?? null,
    uf: l.addresses?.state ?? null,
    pais: l.addresses?.country ?? "BR",
    internacional: (l.addresses?.country ?? "BR") !== "BR",
    moeda: l.currency ?? "BRL",
    exportStatus: l.export_status ?? "not_required",
    paymentStatus: l.payment_status as PaymentStatusValue,
    shippingStatus: l.shipping_status as ShippingStatusValue,
    canceladoEm: l.canceled_at,
    motivoCancelamento: l.cancel_reason,
    rastreio: envio?.tracking_code ?? null,
    etiquetaUrl: envio?.label_url ?? null,
    transportadora: envio?.service_name ?? null,
    vistoEm: l.seen_at,
  };
}
