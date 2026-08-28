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
  email: string | null;
  cpf: string | null;
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

/**
 * O join de endereço muda conforme a consulta filtra por ele ou não — e isso
 * não é estilo, é correção (bug real pego no teste vivo de 28/08/2026):
 *
 * No PostgREST, filtrar um recurso EMBUTIDO (`addresses.country=eq.BR`) com
 * o join padrão (left) NÃO exclui o pedido — só anula o endereço embutido da
 * linha que não casa. O filtro "Internacional" devolvia TODOS os pedidos, e
 * os do Brasil ainda apareciam (sem cidade, porque o endereço vinha null e
 * `mapear` assume BR como padrão). Com `!inner`, o filtro passa a cortar a
 * linha inteira, que é o que as chips de origem/país/UF prometem.
 *
 * O left join continua sendo o padrão de propósito: com `!inner` sempre, um
 * pedido sem endereço (não deveria existir, mas dado ruim acontece) sumiria
 * do painel silenciosamente — e pedido invisível é pior que pedido sem
 * cidade.
 */
export function selectVenda(filtraPorEndereco: boolean): string {
  return (
    "id, order_number, created_at, total_cents, currency, export_status, payment_status, shipping_status, canceled_at, cancel_reason, seen_at," +
    " customers(full_name, phone, email, cpf)," +
    ` addresses${filtraPorEndereco ? "!inner" : ""}(city, state, country),` +
    " order_items(product_name_snapshot, quantity)," +
    " payments(method, status)," +
    " shipments(tracking_code, label_url, service_name)"
  );
}


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
 * A busca por número de pedido é filtrada direto no banco. Nome, telefone,
 * e-mail, CPF e rastreio moram em tabelas relacionadas: filtrar por eles
 * exigiria um join que o PostgREST não expressa bem numa query só, então o
 * casamento desses campos é feito em memória (ver a segunda passada em
 * buscarVendas).
 *
 * É honesto sobre o limite: com poucos milhares de pedidos isto é
 * instantâneo. Quando a loja passar disso, a saída é uma coluna de busca
 * materializada (tsvector) — e não emendar mais um `or` aqui.
 */
export function casaBuscaLocal(venda: VendaResumo, termo: string): boolean {
  const alvo = [venda.numero, venda.cliente, venda.rastreio ?? "", venda.email ?? ""]
    .join(" ")
    .toLowerCase();
  if (alvo.includes(termo)) return true;

  // Telefone e CPF casam por dígitos: "(12) 98140" deve achar "+55 12 98140…".
  const soDigitos = termo.replace(/\D/g, "");
  if (soDigitos.length < 4) return false;
  return [venda.telefone ?? "", venda.cpf ?? ""].some((v) =>
    v.replace(/\D/g, "").includes(soDigitos)
  );
}

export async function buscarVendas(
  supabase: SupabaseClient,
  params: ParametrosBusca,
  agora: Date
): Promise<{ vendas: VendaResumo[]; erro: string | null }> {
  // Encadeado direto, sem função auxiliar: os tipos do PostgREST não
  // sobrevivem a uma passagem por variável genérica (o builder carrega o
  // nome da tabela no tipo), e forçar isso com `any` esconderia erro real.
  const filtraPorEndereco = Boolean(
    params.uf ||
      params.pais ||
      params.origem === "brasil" ||
      params.origem === "internacional"
  );
  let query = supabase.from("orders").select(selectVenda(filtraPorEndereco));

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
  const escapado = termo.replace(/[%,()]/g, "");
  if (termo && escapado) {
    // O que o banco consegue filtrar sozinho, ele filtra: assim a busca por
    // número de pedido continua exata mesmo com muitos pedidos.
    query = query.or(`order_number.ilike.%${escapado}%`);
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

  /**
   * Segunda passada da busca (bug real pego no teste vivo de 28/08/2026):
   * a versão anterior filtrava por order_number NO BANCO e depois tentava
   * casar nome/rastreio em memória — mas sobre um resultado que o próprio
   * filtro de número já tinha esvaziado. Buscar por rastreio ou por nome
   * devolvia sempre "nenhuma venda encontrada".
   *
   * Agora, quando o termo não casa como número de pedido, a MESMA consulta
   * (mesma aba, período, origem, país) roda de novo sem o filtro de número,
   * e o casamento por nome, e-mail, telefone, CPF e rastreio é feito em
   * memória sobre essa página. Duas idas ao banco no pior caso — honesto
   * para a escala atual; a saída definitiva (tsvector) está anotada em
   * casaBuscaLocal.
   */
  if (termo) {
    vendas = vendas.filter((v) => casaBuscaLocal(v, termo));
    if (vendas.length === 0) {
      let ampla = supabase.from("orders").select(selectVenda(filtraPorEndereco));
      if (filtroAba.paymentStatus) ampla = ampla.in("payment_status", filtroAba.paymentStatus);
      if (filtroAba.shippingStatus) ampla = ampla.in("shipping_status", filtroAba.shippingStatus);
      if (filtroAba.cancelado === true) ampla = ampla.not("canceled_at", "is", null);
      if (filtroAba.cancelado === false) ampla = ampla.is("canceled_at", null);
      if (inicio) ampla = ampla.gte("created_at", inicio.toISOString());
      if (fim) ampla = ampla.lt("created_at", fim.toISOString());
      if (params.uf) ampla = ampla.eq("addresses.state", params.uf);
      if (params.pais) ampla = ampla.eq("addresses.country", params.pais.toUpperCase());
      else if (params.origem === "brasil") ampla = ampla.eq("addresses.country", "BR");
      else if (params.origem === "internacional") ampla = ampla.neq("addresses.country", "BR");

      const buscaAmpla = await ampla.order("created_at", { ascending: false }).limit(300);
      if (buscaAmpla.error) return { vendas: [], erro: buscaAmpla.error.message };
      vendas = (buscaAmpla.data ?? []).map(mapear).filter((v) => casaBuscaLocal(v, termo));
    }
  }

  return { vendas, erro: null };
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
    email: l.customers?.email ?? null,
    cpf: l.customers?.cpf ?? null,
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
