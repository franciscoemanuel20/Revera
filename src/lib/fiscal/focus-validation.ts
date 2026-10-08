import type { EntradaProcesso } from "@/lib/internacional/processo-exportacao";
import { PAISES } from "@/lib/internacional/paises";

export type FiscalSettings = {
  cfop: string | null; natureza_operacao: string | null; tributacao: string | null;
  regime_exportacao: string | null; serie: string | null; numeracao: string | null;
  emitente_confirmado: boolean; contador_validou: boolean;
};
export type FiscalAmounts = {
  shipping_order_cents: number; discount_order_cents: number;
  shipping_treatment: "included" | "excluded";
  discount_treatment: "included_in_items" | "separate";
  fx_rate_brl_per_order_unit: number; fx_source: string; fx_date: string;
  freight_brl_cents: number; discount_brl_cents: number;
  insurance_brl_cents: number; other_brl_cents: number; ii_brl_cents: number;
  ipi_brl_cents: number; services_brl_cents: number; icms_relief_brl_cents: number;
  icms_st_brl_cents: number; approved_by: string;
};

export function amountBlockers(input: EntradaProcesso, amounts: FiscalAmounts | null): string[] {
  if (!amounts || !amounts.approved_by) return ["WAITING_FOR_OWNER: componentes e conversão dos valores fiscais validados pelo contador."];
  const result: string[] = [];
  const rate = Number(amounts.fx_rate_brl_per_order_unit);
  if (input.valorFretePedidoCents === undefined || input.valorDescontoPedidoCents === undefined ||
    amounts.shipping_order_cents !== input.valorFretePedidoCents ||
    amounts.discount_order_cents !== input.valorDescontoPedidoCents)
    result.push("Valores de frete ou desconto do pedido mudaram após a validação fiscal.");
  if (!Number.isFinite(rate) || rate <= 0 || !amounts.fx_source || !amounts.fx_date ||
    amounts.freight_brl_cents !== (amounts.shipping_treatment === "included"
      ? Math.round(amounts.shipping_order_cents * rate) : 0) ||
    amounts.discount_brl_cents !== (amounts.discount_treatment === "separate"
      ? Math.round(amounts.discount_order_cents * rate) : 0))
    result.push("Conversão fiscal de frete ou desconto não fecha com o pedido.");
  return result;
}

export function focusBlockers(input: EntradaProcesso, settings: FiscalSettings | null,
  amounts: FiscalAmounts | null = null): string[] {
  const b: string[] = [];
  if (!input.internacional || !input.pago || input.cancelado) b.push("Pedido internacional pago e não cancelado obrigatório.");
  if (!input.destino?.country || !input.destino.city || !input.destino.line1 ||
    !(input.destino.recipient_name || input.contato.nome))
    b.push("Conferir destinatário e endereço.");
  const exporter = input.exportador;
  if (!exporter || [exporter.tax_id, exporter.legal_name, exporter.city, exporter.postal_code,
    exporter.address_line1].some(x => !x)) b.push("WAITING_FOR_OWNER: identidade e endereço do emitente.");
  if (input.itens.length !== input.linhas.length || input.itens.some(i => !i.ncm || !i.fiscal_value_brl_cents ||
    !i.net_weight_g || !i.description_en || !i.fx_source || !i.fx_date || !i.customs_value_cents ||
    Math.abs(Math.round(i.customs_value_cents * i.fx_rate_brl_per_unit) - i.fiscal_value_brl_cents) > 1) ||
    input.itens.reduce((sum, i) => sum + i.customs_value_cents, 0) !== input.valorMercadoriasCents)
    b.push("Conferir snapshot fiscal de todos os produtos.");
  const net = input.itens.reduce((total, i) => total + i.net_weight_g *
    (input.linhas.find(l => l.id === i.order_item_id)?.quantity ?? 0), 0);
  if (!input.pacote || input.pacote.gross_weight_g < net ||
    !input.pacote.length_cm || !input.pacote.width_cm || !input.pacote.height_cm)
    b.push("WAITING_FOR_OWNER: peso bruto e dimensões finais medidos.");
  const fields: Array<[keyof FiscalSettings, string]> = [
    ["cfop", "CFOP"], ["natureza_operacao", "natureza da operação"],
    ["tributacao", "CSOSN/CST ou tributação aplicável"], ["regime_exportacao", "regime da exportação"],
    ["serie", "série"], ["numeracao", "numeração"],
  ];
  for (const [key, label] of fields) if (!settings?.[key]) b.push(`WAITING_FOR_OWNER: ${label}.`);
  if (!settings?.emitente_confirmado) b.push("WAITING_FOR_OWNER: dados do emitente confirmados.");
  if (!settings?.contador_validou) b.push("WAITING_FOR_OWNER: configuração fiscal validada pelo contador.");
  b.push(...amountBlockers(input, amounts));
  return b;
}

export function validateFocusPayload(payload: unknown, input: EntradaProcesso, settings: FiscalSettings,
  amounts: FiscalAmounts): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ["JSON da NF-e inválido."];
  const p = payload as Record<string, unknown>;
  const errors: string[] = [];
  const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
  const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  if (p.natureza_operacao !== settings.natureza_operacao) errors.push("Natureza da operação difere da configuração fiscal.");
  if (String(p.serie ?? "") !== settings.serie) errors.push("Série difere da configuração fiscal.");
  if (p.tipo_documento !== 1 || p.local_destino !== 3) errors.push("Tipo de saída/exportação inválido.");
  const x = input.exportador;
  if (!x || !x.tax_id || !x.legal_name || digits(p.cnpj_emitente) !== digits(x.tax_id) ||
    norm(p.nome_emitente) !== norm(x.legal_name)) errors.push("Identidade do emitente difere do exportador confirmado.");
  if (x && (norm(p.municipio_emitente) !== norm(x.city) || digits(p.cep_emitente) !== digits(x.postal_code) ||
    !norm(x.address_line1).includes(norm(p.logradouro_emitente)) || !norm(p.logradouro_emitente)))
    errors.push("Endereço do emitente difere do exportador confirmado.");
  const recipient = input.destino?.recipient_name || input.contato.nome;
  if (!recipient || norm(p.nome_destinatario) !== norm(recipient))
    errors.push("Destinatário da NF-e difere do pedido.");
  const country = input.destino?.country ?? "";
  const names = [country, PAISES[country]?.nomePt, PAISES[country]?.nomeEn, PAISES[country]?.nomeEs];
  if (!country || !names.some(name => name && norm(p.pais_destinatario) === norm(name)))
    errors.push("País da NF-e difere do pedido.");
  if (!input.destino || norm(p.municipio_destinatario) !== norm(input.destino.city) ||
    norm(p.cep_destinatario) !== norm(input.destino.postal_code) ||
    !norm(input.destino.line1).includes(norm(p.logradouro_destinatario)) || !norm(p.logradouro_destinatario))
    errors.push("Endereço do destinatário difere do pedido.");
  const items = Array.isArray(p.items) ? p.items : [];
  if (items.length !== input.linhas.length) errors.push("Quantidade de linhas da NF-e difere do pedido.");
  const remaining = [...input.itens];
  for (const item of items) {
    if (!item || typeof item !== "object") { errors.push("Item da NF-e inválido."); continue; }
    const x = item as Record<string, unknown>;
    const index = remaining.findIndex(i => i.ncm === String(x.codigo_ncm) &&
      i.fiscal_value_brl_cents === Math.round(Number(x.valor_bruto) * 100) &&
      input.linhas.find(l => l.id === i.order_item_id)?.quantity === Number(x.quantidade_comercial));
    if (index < 0) errors.push("NCM, quantidade ou valor fiscal de item diverge do snapshot do pedido.");
    else remaining.splice(index, 1);
    if (String(x.cfop) !== settings.cfop) errors.push("CFOP de item diverge da configuração fiscal.");
    if (!x.descricao || !x.unidade_comercial || !x.valor_unitario_comercial)
      errors.push("Item sem descrição, unidade ou valor unitário.");
    if (!Number.isFinite(Number(x.valor_unitario_comercial)) ||
      Math.abs(Math.round(Number(x.valor_unitario_comercial) * Number(x.quantidade_comercial) * 100) -
        Math.round(Number(x.valor_bruto) * 100)) > 1)
      errors.push("Valor unitário vezes quantidade diverge do valor bruto do item.");
  }
  if (remaining.length) errors.push("Há itens do pedido ausentes na NF-e.");
  const sum = input.itens.reduce((n, i) => n + i.fiscal_value_brl_cents, 0);
  if (Math.round(Number(p.valor_produtos) * 100) !== sum) errors.push("Valor dos produtos diverge do snapshot fiscal.");
  const money = (key: string) => p[key] === undefined ? 0 : Number(p[key]);
  const components = ["valor_produtos", "valor_desconto", "valor_frete", "valor_seguro",
    "valor_outras_despesas", "valor_total_ii", "valor_ipi", "valor_total_servicos",
    "icms_valor_total_desonerado", "icms_valor_total_st"];
  if (components.some(key => !Number.isFinite(money(key)) || money(key) < 0))
    errors.push("Componentes do valor total inválidos.");
  const expectedComponents: Record<string, number> = {
    valor_frete: amounts.freight_brl_cents, valor_desconto: amounts.discount_brl_cents,
    valor_seguro: amounts.insurance_brl_cents, valor_outras_despesas: amounts.other_brl_cents,
    valor_total_ii: amounts.ii_brl_cents, valor_ipi: amounts.ipi_brl_cents,
    valor_total_servicos: amounts.services_brl_cents,
    icms_valor_total_desonerado: amounts.icms_relief_brl_cents,
    icms_valor_total_st: amounts.icms_st_brl_cents,
  };
  for (const [key, cents] of Object.entries(expectedComponents)) {
    if (Math.round(money(key) * 100) !== cents) errors.push(`${key} difere dos valores aprovados para o pedido.`);
  }
  const expectedTotal = money("valor_produtos") - money("valor_desconto") + money("valor_frete") +
    money("valor_seguro") + money("valor_outras_despesas") + money("valor_total_ii") +
    money("valor_ipi") + money("valor_total_servicos") - money("icms_valor_total_desonerado") +
    money("icms_valor_total_st");
  if (!Number.isFinite(Number(p.valor_total)) || Number(p.valor_total) <= 0 ||
    Math.abs(Math.round(Number(p.valor_total) * 100) - Math.round(expectedTotal * 100)) > 1)
    errors.push("Valor total da NF-e diverge dos componentes fiscais informados.");
  return [...new Set(errors)];
}
