import type { EntradaProcesso } from "@/lib/internacional/processo-exportacao";

export type FiscalSettings = {
  cfop: string | null; natureza_operacao: string | null; tributacao: string | null;
  regime_exportacao: string | null; serie: string | null; numeracao: string | null;
  emitente_confirmado: boolean; contador_validou: boolean;
};

export function focusBlockers(input: EntradaProcesso, settings: FiscalSettings | null): string[] {
  const b: string[] = [];
  if (!input.internacional || !input.pago || input.cancelado) b.push("Pedido internacional pago e não cancelado obrigatório.");
  if (!input.destino?.country || !input.destino.city || !input.destino.line1 || !input.contato.nome)
    b.push("Conferir destinatário e endereço.");
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
  return b;
}

export function validateFocusPayload(payload: unknown, input: EntradaProcesso, settings: FiscalSettings): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ["JSON da NF-e inválido."];
  const p = payload as Record<string, unknown>;
  const errors: string[] = [];
  if (p.natureza_operacao !== settings.natureza_operacao) errors.push("Natureza da operação difere da configuração fiscal.");
  if (String(p.serie ?? "") !== settings.serie) errors.push("Série difere da configuração fiscal.");
  if (p.tipo_documento !== 1 || p.local_destino !== 3) errors.push("Tipo de saída/exportação inválido.");
  if (typeof p.nome_destinatario !== "string" || !p.nome_destinatario.trim()) errors.push("Destinatário ausente.");
  if (typeof p.cnpj_emitente !== "string" || !/^\d{14}$/.test(p.cnpj_emitente)) errors.push("CNPJ do emitente ausente ou inválido.");
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
  }
  if (remaining.length) errors.push("Há itens do pedido ausentes na NF-e.");
  const sum = input.itens.reduce((n, i) => n + i.fiscal_value_brl_cents, 0);
  if (Math.round(Number(p.valor_produtos) * 100) !== sum) errors.push("Valor dos produtos diverge do snapshot fiscal.");
  if (!Number.isFinite(Number(p.valor_total)) || Number(p.valor_total) <= 0) errors.push("Valor total inválido.");
  return [...new Set(errors)];
}
