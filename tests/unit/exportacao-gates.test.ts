import { beforeEach, describe, expect, it, vi } from "vitest";
import { avaliarExportacao, type EntradaProcesso } from "@/lib/internacional/processo-exportacao";

const state = vi.hoisted(() => ({ updates: 0, shipmentCreates: 0, allowGuide: false }));
const order = { id: "11111111-1111-4111-8111-111111111111", order_number: "REV-TEST", payment_status: "paid",
  shipping_status: "label_created", canceled_at: null, currency: "EUR", total_cents: 20000,
  addresses: { country: "DE", city: "Berlin", postal_code: "10115", line1: "Street" },
  customers: { full_name: "Cliente", email: "a@b.com", phone: "+4912345" },
  order_items: [{ id: "22222222-2222-4222-8222-222222222222", quantity: 1, product_name_snapshot: "Produto", unit_price_cents: 20000 }],
  shipments: [], payments: [] };
const exporter = { legal_name: "Exportadora", tax_id: "123", country: "BR", postal_code: "12216530",
  city: "SJC", address_line1: "Rua", contact_name: "Pessoa", phone: "+5511", email: "a@b.com",
  invoice_mode: "external", dhl_account_confirmed: true };
const entrada: EntradaProcesso = { internacional: true, pago: true, cancelado: false,
  contato: { nome: "Cliente", email: "a@b.com", telefone: "+4912345" }, destino: order.addresses,
  linhas: [{ id: order.order_items[0]!.id, nome: "Produto", quantity: 1 }], itens: [], pacote: null,
  valorMercadoriasCents: 20000, moedaPedido: "EUR",
  documentos: [], exportador: exporter, rastreio: null, remessaEmProcessamento: false };
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin/audit", () => ({ registrarAuditoria: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  from: (table: string) => ({
    select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: table === "orders" ? order : exporter, error: null }),
    update() { state.updates++; return this; }, insert() { state.shipmentCreates++; return this; },
  }),
}) }));
vi.mock("@/lib/internacional/processo-exportacao-server", () => ({
  carregarProcessosExportacao: async () => new Map([[order.id, { entrada,
    avaliacao: state.allowGuide ? { ...avaliarExportacao(entrada), podeRegistrarGuia: true } : avaliarExportacao(entrada) }]]),
}));
vi.mock("@/lib/payments/paypal-provider", () => ({ PayPalProvider: class {} }));

import { marcarEnvioAction, cancelarPedidoAction } from "@/app/admin/(protected)/pedidos/actions";
import { gerarEnvioDhlAction } from "@/app/admin/(protected)/pedidos/gerar-envio-dhl";
import { registrarEnvioDhlAction } from "@/app/admin/(protected)/pedidos/envio-dhl";

describe("travas nas três ações de expedição", () => {
  beforeEach(() => { state.updates = 0; state.shipmentCreates = 0; state.allowGuide = false; });
  it("não marca enviado sem evidências", async () => {
    const r = await marcarEnvioAction({ orderId: order.id, novoEnvio: "shipped" });
    expect(r).toHaveProperty("error"); expect(state.updates).toBe(0);
  });
  it("não cria remessa DHL sem evidências", async () => {
    const r = await gerarEnvioDhlAction({ orderId: order.id });
    expect(r).toHaveProperty("error"); expect(state.shipmentCreates).toBe(0);
  });
  it("não registra guia manual sem evidências", async () => {
    const r = await registrarEnvioDhlAction({ orderId: order.id, awb: "1234567890" });
    expect(r).toHaveProperty("error"); expect(state.updates).toBe(0);
  });
  it("não registra guia manual inicial sem comprovante MyDHL mesmo com regra fiscal pronta", async () => {
    state.allowGuide = true;
    const r = await registrarEnvioDhlAction({ orderId: order.id, awb: "1234567890" });
    expect(r).toHaveProperty("error"); expect(state.shipmentCreates).toBe(0);
  });
  it("não promove creation_unknown a guia sem reconciliação comprovada", async () => {
    state.allowGuide = true;
    (order.shipments as Array<{ id: string; provider: string; status: string; tracking_code: string | null }>).push({
      id: "33333333-3333-4333-8333-333333333333", provider: "dhl", status: "creation_unknown", tracking_code: null });
    const antigo = order.shipping_status; order.shipping_status = "shipping_error";
    try {
      const r = await registrarEnvioDhlAction({ orderId: order.id, awb: "1234567890" });
      expect(r).toHaveProperty("error"); expect(state.updates).toBe(0);
    } finally { order.shipments.pop(); order.shipping_status = antigo; }
  });
  it("não cancela enquanto a DHL cria a remessa", async () => {
    const antigo = order.shipping_status;
    order.shipping_status = "label_processing";
    try {
      const r = await cancelarPedidoAction({ orderId: order.id, motivo: "Cliente pediu cancelamento" });
      expect(r).toHaveProperty("error"); expect(state.updates).toBe(0);
    } finally { order.shipping_status = antigo; }
  });
});
