import { describe, expect, it } from "vitest";
import { avaliarExportacao, escolherModoInvoicePedido, guiaDhlValida, type EntradaProcesso } from "@/lib/internacional/processo-exportacao";

const base = (): EntradaProcesso => ({
  internacional: true, pago: true, cancelado: false,
  contato: { nome: "Cliente", email: "cliente@example.com", telefone: "+491234567" },
  destino: { country: "DE", city: "Berlin", postal_code: "10115", line1: "Rua 1" },
  linhas: [{ id: "item-1", nome: "FITA 20METROS", quantity: 2 }, { id: "item-2", nome: "Prótese Cacho Fechado", quantity: 1 }],
  valorMercadoriasCents: 30000, moedaPedido: "EUR",
  itens: ["item-1", "item-2"].map(order_item_id => ({ order_item_id, ncm: "67042000", hs_code: "670420",
    country_of_origin: "BR", description_en: "Hair product", net_weight_g: 100, customs_value_cents: 15000,
    fiscal_value_brl_cents: 90000, fx_rate_brl_per_unit: 6, fx_source: "Taxa validada pelo contador", fx_date: "2026-10-07" })),
  pacote: { gross_weight_g: 400, length_cm: 20, width_cm: 19, height_cm: 9, incoterm: "DAP" },
  documentos: [
    { kind: "nfe", source: "external", status: "verified", reference: "1".repeat(44), storage_path: "nfe.pdf", regime: null },
    { kind: "invoice", source: "external", status: "verified", reference: "INV-1", storage_path: "invoice.pdf", regime: null },
    { kind: "declaration", source: "external", status: "verified", reference: "DRE-1", storage_path: "dre.pdf", regime: "DRE" },
  ],
  exportador: { legal_name: "Exportadora", tax_id: "123", country: "BR", postal_code: "12216530", city: "SJC",
    address_line1: "Rua", contact_name: "Pessoa", phone: "+5511", email: "a@b.com",
    invoice_mode: "external", dhl_account_confirmed: true },
  rastreio: "1234567890", remessaEmProcessamento: false,
});

describe("regra única da exportação", () => {
  it("mantém a invoice verificada do pedido quando o modo global muda e falha fechado em remessa legada sem modo", () => {
    const invoice = base().documentos.find(d => d.kind === "invoice")!;
    expect(escolherModoInvoicePedido(false, null, invoice, "api")).toBe("external");
    expect(escolherModoInvoicePedido(true, null, invoice, "api")).toBeNull();
  });
  it("recusa rastreio de outro provedor ou remessa DHL ainda incerta", () => {
    expect(guiaDhlValida([{ provider: "superfrete", tracking_code: "123", status: "label_created" }])).toBeNull();
    expect(guiaDhlValida([{ provider: "dhl", tracking_code: "123", status: "creation_unknown" }])).toBeNull();
    expect(guiaDhlValida([{ provider: "dhl", tracking_code: "123", status: "label_created" }])).toBeNull();
    expect(guiaDhlValida([{ provider: "dhl", tracking_code: "12345-67890", status: "label_created" }])).toBe("1234567890");
  });
  it("libera despacho somente com dois itens, caixa e documentos conferidos", () => {
    const a = avaliarExportacao(base());
    expect(a.podeCriarEtiqueta).toBe(true);
    expect(a.podeRegistrarGuia).toBe(true);
    expect(a.podeDespachar).toBe(true);
    expect(a.status).toBe("ready_for_dispatch");
  });
  it("não usa catálogo como fallback se faltar snapshot de um item", () => {
    const e = base(); e.itens.pop();
    const a = avaliarExportacao(e);
    expect(a.podeCriarEtiqueta).toBe(false);
    expect(a.bloqueiosEtiqueta.join(" ")).toContain("Prótese Cacho Fechado");
  });
  it("bloqueia peso bruto menor que a soma dos pesos líquidos", () => {
    const e = base(); e.pacote!.gross_weight_g = 200;
    expect(avaliarExportacao(e).podeCriarEtiqueta).toBe(false);
  });
  it("bloqueia etiqueta até o Incoterm ser validado para o pedido", () => {
    const e = base(); e.pacote!.incoterm = "" as "DAP";
    expect(avaliarExportacao(e).podeCriarEtiqueta).toBe(false);
  });
  it("bloqueia divergência entre valor aduaneiro, câmbio e valor fiscal", () => {
    const e = base(); e.itens[0]!.fiscal_value_brl_cents++;
    e.itens[0]!.fiscal_value_brl_cents++;
    expect(avaliarExportacao(e).podeCriarEtiqueta).toBe(false);
    e.itens[0]!.fiscal_value_brl_cents -= 2;
    e.valorMercadoriasCents++;
    expect(avaliarExportacao(e).podeCriarEtiqueta).toBe(false);
  });
  it("bloqueia pagamento pendente e pedido cancelado", () => {
    const e = base(); e.pago = false;
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.pago = true; e.cancelado = true;
    expect(avaliarExportacao(e).podeCriarEtiqueta).toBe(false);
  });
  it("permite pedir invoice à DHL, mas só libera despacho após retorno e conferência", () => {
    const e = base(); e.exportador!.invoice_mode = "api"; e.documentos = e.documentos.filter(d => d.kind !== "invoice");
    expect(avaliarExportacao(e).podeCriarEtiqueta).toBe(true);
    expect(avaliarExportacao(e).podeRegistrarGuia).toBe(true);
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.documentos.push({ kind: "invoice", source: "dhl", status: "pending", reference: "INV-DHL", storage_path: "dhl.pdf", regime: null });
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.documentos[2]!.status = "verified";
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.invoiceDhlComprovada = true;
    expect(avaliarExportacao(e).podeDespachar).toBe(true);
  });
  it("documento rejeitado ou declaração sem regime nunca vale como pronta", () => {
    const e = base(); e.documentos[0]!.status = "rejected";
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.documentos[0]!.status = "verified"; e.documentos[2]!.regime = null;
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
  });
  it("não aceita invoice de origem diferente do modo fiscal atual", () => {
    const e = base(); e.documentos[1]!.source = "dhl";
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.exportador!.invoice_mode = "api";
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.invoiceDhlComprovada = true;
    expect(avaliarExportacao(e).podeDespachar).toBe(true);
  });
  it("mantém o modo fiscal fixado na remessa quando a configuração global muda", () => {
    const e = base();
    e.invoiceModeForOrder = "external";
    e.exportador!.invoice_mode = "api";
    expect(avaliarExportacao(e).podeDespachar).toBe(true);
    e.documentos[1]!.source = "dhl";
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
  });
  it("guia manual legada pode ser registrada, mas não despachada sem reconciliar o modo", () => {
    const e = base();
    e.invoiceModeForOrder = null;
    e.rastreio = null;
    expect(avaliarExportacao(e).podeRegistrarGuia).toBe(true);
    e.rastreio = "1234567890";
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
    e.invoiceModeForOrder = "external";
    expect(avaliarExportacao(e).podeDespachar).toBe(true);
  });
  it("guia ausente bloqueia despacho, mesmo com documentação completa", () => {
    const e = base(); e.rastreio = null;
    expect(avaliarExportacao(e).podeDespachar).toBe(false);
  });
});
